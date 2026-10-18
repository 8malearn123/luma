import { z } from 'zod';
import type { Tx } from '../db';
import { forbidden, notFound } from '../errors';
import { audit } from '../audit';
import type { TenantContext } from '../tenancy/context';

/**
 * Tenant-local customer relationships. Everything here is scoped by RLS to the
 * current business: a customer's bookings/orders at other businesses are never
 * queried or shown.
 */
export async function listCustomers(tx: Tx, opts: { q?: string; tag?: string; offset?: number; limit?: number }) {
  const limit = Math.min(opts.limit ?? 50, 100);
  const like = opts.q ? `%${opts.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%` : null;
  const rows = await tx`
    select c.id, c.display_name, c.phone, c.email, c.tags, c.first_seen_at, (c.user_id is not null) as has_account,
      (select count(*)::int from bookings b where b.tenant_customer_id = c.id and b.status = 'completed') as visits,
      (select max(starts_at) from bookings b where b.tenant_customer_id = c.id and b.status = 'completed') as last_visit
    from tenant_customers c
    where c.tenant_id = app.tenant_id() and c.archived_at is null
      and (${like}::text is null or c.display_name ilike ${like} or c.phone ilike ${like} or c.email::text ilike ${like})
      and (${opts.tag ?? null}::text is null or ${opts.tag ?? null} = any(c.tags))
    order by c.display_name limit ${limit + 1} offset ${opts.offset ?? 0}`;
  return { items: rows.slice(0, limit), hasMore: rows.length > limit };
}

export async function getCustomer(tx: Tx, ctx: TenantContext, id: string) {
  const [c] = await tx<Record<string, unknown>[]>`select id, display_name, phone, email, tags, source, first_seen_at, private_notes, (user_id is not null) as has_account
                      from tenant_customers where id = ${id} and tenant_id = app.tenant_id() and archived_at is null`;
  if (!c) throw notFound('customer');
  if (!ctx.caps.has('customers.notes')) delete c.privateNotes;
  const bookings = await tx`select id, number, status, financial_status, starts_at, total_minor,
      (select string_agg(service_name, '، ' order by seq) from booking_items i where i.booking_id = b.id and i.status = 'active') as services
    from bookings b where b.tenant_id = app.tenant_id() and tenant_customer_id = ${id} and status <> 'draft' order by starts_at desc limit 100`;
  const orders = await tx`select id, number, status, total_minor, created_at from orders where tenant_id = app.tenant_id() and tenant_customer_id = ${id} order by created_at desc limit 50`;
  const consents = await tx`select distinct on (channel, purpose) channel, purpose, status, recorded_at, source
    from customer_consents where tenant_customer_id = ${id} order by channel, purpose, recorded_at desc`;
  const [loyalty] = await tx<{ balance: number }[]>`select balance from loyalty_accounts where tenant_id = app.tenant_id() and tenant_customer_id = ${id}`;
  return { customer: c, bookings, orders, consents, loyaltyBalance: loyalty?.balance ?? null };
}

export const customerPatch = z.object({
  privateNotes: z.string().max(4000).nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(20).optional(),
  displayName: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(20).regex(/^[+0-9\s-]*$/).nullable().optional(),
});

export async function updateCustomer(tx: Tx, ctx: TenantContext, id: string, p: z.infer<typeof customerPatch>) {
  if (p.privateNotes !== undefined && !ctx.caps.has('customers.notes')) throw forbidden();
  const r = await tx`update tenant_customers set
      private_notes = case when ${p.privateNotes !== undefined} then ${p.privateNotes ?? null} else private_notes end,
      tags = coalesce(${p.tags ?? null}::text[], tags),
      display_name = coalesce(${p.displayName ?? null}, display_name),
      phone = case when ${p.phone !== undefined} then ${p.phone ?? null} else phone end,
      updated_at = now()
    where id = ${id} and tenant_id = app.tenant_id() and archived_at is null returning id`;
  if (!r.length) throw notFound('customer');
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: 'customer.updated', targetType: 'tenant_customer', targetId: id, requestId: ctx.requestId, metadata: { fields: Object.keys(p) } });
}
