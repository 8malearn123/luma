import { z } from 'zod';
import type { Tx } from '../db';
import { AppError, forbidden, notFound } from '../errors';
import { audit } from '../audit';
import type { TenantContext } from '../tenancy/context';
import { ensureTenantCustomer } from '../booking/service';

/**
 * Business-side booking reads. Scope rules:
 *  - bookings.manage        → every booking of the business
 *  - bookings.view_financial → read-only list (no customer contact, no notes)
 *  - bookings.view_assigned → only bookings with an item assigned to my staff profile
 */
export const listQuery = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  staffId: z.string().uuid().optional(),
  status: z.string().regex(/^[a-z_]+(,[a-z_]+)*$/).optional(),
  branchId: z.string().uuid().optional(),
  q: z.string().trim().max(80).optional(),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type BookingScope = 'all' | 'financial' | 'assigned';

export function bookingScope(ctx: TenantContext): BookingScope {
  if (ctx.caps.has('bookings.manage')) return 'all';
  if (ctx.caps.has('bookings.view_financial')) return 'financial';
  if (ctx.caps.has('bookings.view_assigned') && ctx.staffProfileId) return 'assigned';
  throw forbidden();
}

export async function listBookings(tx: Tx, ctx: TenantContext, q: z.infer<typeof listQuery>) {
  const scope = bookingScope(ctx);
  const statuses = q.status ? q.status.split(',') : null;
  const like = q.q ? `%${q.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%` : null;
  const mine = scope === 'assigned' ? ctx.staffProfileId : null;
  const rows = await tx<Record<string, unknown>[]>`
    select b.id, b.number, b.status, b.financial_status, b.starts_at, b.ends_at, b.total_minor, b.paid_minor, b.refunded_minor,
      b.branch_id, b.source, b.payment_terms,
      ${scope === 'financial' ? tx`null` : tx`tc.display_name`} as customer_name,
      coalesce((select json_agg(json_build_object('id', i.id, 'staffId', i.staff_id, 'staffName', i.staff_name, 'serviceName', i.service_name,
        'startsAt', i.starts_at, 'endsAt', i.ends_at) order by i.seq) from booking_items i where i.booking_id = b.id and i.status = 'active'), '[]') as items
    from bookings b join tenant_customers tc on tc.id = b.tenant_customer_id
    where b.tenant_id = app.tenant_id() and (${q.from ?? null}::timestamptz is null or b.ends_at > ${q.from ?? null}::timestamptz)
      and (${q.to ?? null}::timestamptz is null or b.starts_at < ${q.to ?? null}::timestamptz)
      and (${q.branchId ?? null}::uuid is null or b.branch_id = ${q.branchId ?? null}::uuid)
      and (${statuses}::text[] is null or b.status = any(${statuses}::text[]))
      and (${q.staffId ?? null}::uuid is null or exists (select 1 from booking_items i where i.booking_id = b.id and i.staff_id = ${q.staffId ?? null}::uuid))
      and (${mine}::uuid is null or exists (select 1 from booking_items i where i.booking_id = b.id and i.staff_id = ${mine}::uuid and i.status = 'active'))
      and (${like}::text is null or b.number ilike ${like} or (${scope !== 'financial'} and tc.display_name ilike ${like}))
      and b.status <> 'draft'
    order by b.starts_at
    limit ${q.limit + 1} offset ${q.offset}`;
  return { items: rows.slice(0, q.limit), hasMore: rows.length > q.limit, scope };
}

/** Customer lookup for staff booking creation — only this business's relationships, never LUMA accounts. */
export async function searchTenantCustomers(tx: Tx, q: string, limit = 15) {
  const t = q.trim();
  if (t.length < 2) return [];
  const like = `%${t.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
  const digits = t.replace(/\D/g, '');
  return tx`select id, display_name, phone, (user_id is not null) as has_account from tenant_customers
            where tenant_id = app.tenant_id() and archived_at is null and (display_name ilike ${like} or (${digits.length >= 4} and phone like ${`%${digits}%`}))
            order by display_name limit ${limit}`;
}

export const walkInInput = z.object({
  displayName: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(20).regex(/^[+0-9\s-]*$/).optional().nullable(),
  email: z.string().email().max(254).optional().nullable(),
});

/** A business-local customer record without a LUMA account (walk-in / phone booking). */
export async function createWalkInCustomer(tx: Tx, ctx: TenantContext, input: z.infer<typeof walkInInput>) {
  if (!ctx.caps.has('bookings.manage')) throw forbidden();
  const id = await ensureTenantCustomer(tx, ctx.tenant.id, { userId: null, displayName: input.displayName, phone: input.phone ?? null, email: input.email ?? null, source: 'walk_in' });
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: 'customer.created', targetType: 'tenant_customer', targetId: id, requestId: ctx.requestId });
  return { id };
}

export async function setInternalNote(tx: Tx, ctx: TenantContext, bookingId: string, note: string) {
  if (!ctx.caps.has('bookings.manage')) throw forbidden();
  const r = await tx`update bookings set internal_note = ${note.slice(0, 2000)}, version = version + 1 where id = ${bookingId} returning id`;
  if (!r.length) throw notFound('booking');
  await tx`insert into booking_events (tenant_id, booking_id, kind, actor_user_id, source) values (${ctx.tenant.id}, ${bookingId}, 'note', ${ctx.user.userId}, 'staff')`;
}

export async function tenantCustomerUser(tx: Tx, tenantCustomerId: string) {
  const [c] = await tx<{ id: string; userId: string | null; archivedAt: Date | null }[]>`select id, user_id, archived_at from tenant_customers where id = ${tenantCustomerId} and tenant_id = app.tenant_id()`;
  if (!c || c.archivedAt) throw new AppError('validation', 'errors.invalid_reference');
  return c;
}

/**
 * Explicit tenant guard for booking ids coming from the URL. Needed because the
 * `customer_self_read` RLS policy also exposes the caller's OWN bookings at other
 * businesses; staff routes must only ever act on this tenant's bookings.
 */
export async function assertBookingInTenant(tx: Tx, bookingId: string) {
  const [b] = await tx`select 1 from bookings where id = ${bookingId} and tenant_id = app.tenant_id()`;
  if (!b) throw notFound('booking');
}

export async function assertOrderInTenant(tx: Tx, orderId: string) {
  const [o] = await tx`select 1 from orders where id = ${orderId} and tenant_id = app.tenant_id()`;
  if (!o) throw notFound('order');
}
