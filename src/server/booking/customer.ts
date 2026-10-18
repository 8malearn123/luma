import { randomUUID } from 'node:crypto';
import type { Tx } from '../db';
import { withTenant, withUser } from '../db';
import { AppError, notFound } from '../errors';
import { hmacHex, randomToken } from '../crypto';
import { tenantBySlug, type TenantInfo } from '../tenancy/context';
import { ensureTenantCustomer, getBookingFor, refundDue, type Actor, type BookingRow } from './service';

/**
 * Customer-side helpers: public storefront booking data, the business-local
 * customer relationship, and the customer's own cross-business views.
 * A business never sees a customer's activity at other businesses: tenant
 * scope is always the single tenant being viewed.
 */

/** Contract (CONTRIBUTING_AGENTS.md): business-local relationship for a central customer. */
export async function customerTenantRelationship(tx: Tx, tenantId: string, userId: string, displayName: string) {
  return ensureTenantCustomer(tx, tenantId, { userId, displayName, source: 'online' });
}

/** Public storefront tenant: must exist and be accepting customers. Unknown and inactive look the same. */
export async function publicTenant(slug: string): Promise<TenantInfo> {
  const t = await tenantBySlug(slug);
  if (!t || t.status !== 'active') throw notFound('store');
  return t;
}

export const customerActor = (userId: string, tenantId: string): Actor => ({ kind: 'customer', userId, tenantId });

export function runPublic<T>(t: TenantInfo, userId: string | null, fn: (tx: Tx) => Promise<T>) {
  return withTenant({ tenantId: t.id, userId }, fn);
}

// ── pseudonymous analytics session (first-party cookie, HMAC'd before storage) ──
export const SESSION_COOKIE = 'luma_sid';
export const newSid = () => randomToken(18);
export const sessionHash = (sid: string, tenantId: string) => hmacHex(`sid|${tenantId}|${sid}`).slice(0, 32);

export async function recordAvailabilityMiss(tx: Tx, tenantId: string, sid: string | null, serviceIds: string[]) {
  const hash = sessionHash(sid ?? randomUUID(), tenantId);
  for (const s of serviceIds.slice(0, 5)) {
    await tx`insert into analytics_events (tenant_id, event_id, type, session_hash, entity_type, entity_id)
             values (${tenantId}, ${randomUUID()}, 'availability_miss', ${hash}, 'service', ${s})`;
  }
}

/** Services, variants, add-ons, qualified public staff and branches for the booking flow. */
export async function publicBookingCatalog(tx: Tx) {
  const services = await tx<{
    id: string; name: string; nameEn: string | null; description: string | null; descriptionEn: string | null; priceMinor: number;
    priceIsFrom: boolean; durationMin: number; categoryId: string | null; categoryName: string | null; categoryNameEn: string | null; branchId: string | null; imageAssetId: string | null;
  }[]>`
    select s.id, s.name, s.name_en, s.description, s.description_en, s.price_minor, s.price_is_from, s.duration_min, s.category_id,
           c.name as category_name, c.name_en as category_name_en, s.branch_id, s.image_asset_id
    from services s left join categories c on c.tenant_id = s.tenant_id and c.id = s.category_id
    where s.status = 'active' and s.is_visible and s.group_capacity is null
      and (c.id is null or c.status = 'active')
    order by c.sort nulls last, s.sort, s.name`;
  const ids = services.map((s) => s.id);
  const [variants, addons, staff, branches, policy] = await Promise.all([
    tx<{ id: string; serviceId: string; name: string; nameEn: string | null; priceMinor: number; durationMin: number }[]>`
      select id, service_id, name, name_en, price_minor, duration_min from service_variants where service_id = any(${ids}::uuid[]) and status = 'active' order by sort, name`,
    tx<{ id: string; serviceId: string; name: string; nameEn: string | null; priceMinor: number; durationMin: number }[]>`
      select id, service_id, name, name_en, price_minor, duration_min from service_addons where service_id = any(${ids}::uuid[]) and status = 'active' order by name`,
    tx<{ id: string; displayName: string; displayNameEn: string | null; specialty: string | null; serviceIds: string[]; branchIds: string[] }[]>`
      select sp.id, sp.display_name, sp.display_name_en, sp.specialty,
        coalesce((select array_agg(ss.service_id) from service_staff ss where ss.staff_id = sp.id), '{}') as service_ids,
        coalesce((select array_agg(a.branch_id) from staff_branch_assignments a where a.staff_id = sp.id), '{}') as branch_ids
      from staff_profiles sp where sp.status = 'active' and sp.public_visible order by sp.sort, sp.display_name`,
    tx<{ id: string; name: string; city: string | null; address: string | null; isPrimary: boolean }[]>`
      select id, name, city, address, is_primary from branches where status = 'active' order by is_primary desc, name`,
    tx<{ policyText: string | null; policyTextEn: string | null; holdMinutes: number; requireAccount: boolean }[]>`
      select policy_text, policy_text_en, hold_minutes, require_account from booking_policies limit 1`,
  ]);
  return {
    services: services.map((s) => ({ ...s, variants: variants.filter((v) => v.serviceId === s.id), addons: addons.filter((a) => a.serviceId === s.id) })),
    staff,
    branches,
    policy: policy[0] ?? null,
  };
}

// ─────────────────────────────────────────────────────────────
// Customer's own views (/me)
// ─────────────────────────────────────────────────────────────
export async function myBookings(userId: string, opts: { scope?: 'upcoming' | 'past' | 'all' } = {}) {
  const rows = await withUser(userId, (tx) => tx<{
    id: string; tenantId: string; number: string; status: string; financialStatus: string; startsAt: Date; endsAt: Date; totalMinor: number;
    paidMinor: number; currency: string; tenantName: string; tenantSlug: string; timezone: string;
  }[]>`
    select b.id, b.tenant_id, b.number, b.status, b.financial_status, b.starts_at, b.ends_at, b.total_minor, b.paid_minor, b.currency,
           t.name as tenant_name, t.slug as tenant_slug, t.timezone
    from bookings b join tenants t on t.id = b.tenant_id
    where b.customer_user_id = ${userId}
      and (${opts.scope ?? 'all'} = 'all'
        or (${opts.scope ?? 'all'} = 'upcoming' and b.ends_at >= now() and b.status not in ('cancelled','expired','no_show','completed'))
        or (${opts.scope ?? 'all'} = 'past' and (b.ends_at < now() or b.status in ('cancelled','expired','no_show','completed'))))
    order by b.starts_at desc limit 200`);
  // service names live in booking_items (tenant-scoped): read per tenant, verifying ownership again
  const byTenant = new Map<string, string[]>();
  for (const r of rows) byTenant.set(r.tenantId, [...(byTenant.get(r.tenantId) ?? []), r.id]);
  const names = new Map<string, string[]>();
  for (const [tenantId, ids] of byTenant) {
    const items = await withTenant({ tenantId, userId }, (tx) => tx<{ bookingId: string; serviceName: string; staffName: string }[]>`
      select i.booking_id, i.service_name, i.staff_name from booking_items i join bookings b on b.id = i.booking_id
      where i.booking_id = any(${ids}::uuid[]) and b.customer_user_id = ${userId} and i.status = 'active' order by i.seq`);
    for (const it of items) names.set(it.bookingId, [...(names.get(it.bookingId) ?? []), `${it.serviceName} · ${it.staffName}`]);
  }
  return rows.map((r) => ({ ...r, services: names.get(r.id) ?? [] }));
}

/** Locate which tenant owns the customer's booking (RLS customer_self_read), or 404. */
export async function bookingTenantFor(userId: string, bookingId: string): Promise<string> {
  if (!/^[0-9a-f-]{36}$/i.test(bookingId)) throw notFound('booking');
  const [r] = await withUser(userId, (tx) => tx<{ tenantId: string }[]>`select tenant_id from bookings where id = ${bookingId} and customer_user_id = ${userId}`);
  if (!r) throw notFound('booking');
  return r.tenantId;
}

export async function myBookingDetail(userId: string, bookingId: string) {
  const tenantId = await bookingTenantFor(userId, bookingId);
  return withTenant({ tenantId, userId }, async (tx) => {
    const d = await getBookingFor(tx, customerActor(userId, tenantId), bookingId);
    const [t] = await tx<{ name: string; slug: string; timezone: string }[]>`select name, slug, timezone from tenants where id = ${tenantId}`;
    const payments = await tx`select id, kind, method, amount_minor, status, refunded_minor, checkout_url, created_at, succeeded_at
                              from payments where booking_id = ${bookingId} order by created_at`;
    const refunds = await tx`select r.id, r.amount_minor, r.status, r.reason, r.created_at, r.completed_at
                             from refunds r join payments p on p.id = r.payment_id where p.booking_id = ${bookingId} order by r.created_at`;
    const b = d.booking as BookingRow & { cancelReason: string | null };
    const preview = ['held', 'pending_payment', 'confirmed'].includes(b.status) ? refundDue(b, 'cancelled', 'customer', new Date()) : 0;
    const snap = b.termsSnapshot as BookingRow['termsSnapshot'] & { policy?: { policyText?: string | null }; timezone?: string };
    return {
      booking: {
        id: b.id, number: b.number, status: b.status, financialStatus: b.financialStatus, startsAt: b.startsAt, endsAt: b.endsAt,
        totalMinor: b.totalMinor, paidMinor: b.paidMinor, refundedMinor: b.refundedMinor, depositDueMinor: b.depositDueMinor,
        paymentTerms: b.paymentTerms, holdExpiresAt: b.holdExpiresAt, version: b.version, branchId: b.branchId,
        policyText: snap.policy?.policyText ?? null, cancellationWindowHours: snap.policy?.cancellationWindowHours ?? null,
        explanationKey: snap.terms?.customerExplanationKey ?? null,
      },
      tenant: { id: tenantId, ...t },
      items: d.items,
      events: d.events.map((e) => ({ fromStatus: e.fromStatus, toStatus: e.toStatus, kind: e.kind, at: e.at, reason: e.kind === 'transition' ? null : null })),
      allowed: d.allowed,
      payments,
      refunds,
      cancelRefundPreviewMinor: preview,
    };
  });
}

export async function myOrders(userId: string) {
  return withUser(userId, (tx) => tx`
    select o.id, o.number, o.status, o.refund_status, o.total_minor, o.paid_minor, o.currency, o.created_at, o.payment_terms,
           t.name as tenant_name, t.slug as tenant_slug
    from orders o join tenants t on t.id = o.tenant_id where o.customer_user_id = ${userId} order by o.created_at desc limit 200`);
}

export async function myOrderDetail(userId: string, orderId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) throw notFound('order');
  const [r] = await withUser(userId, (tx) => tx<{ tenantId: string }[]>`select tenant_id from orders where id = ${orderId} and customer_user_id = ${userId}`);
  if (!r) throw notFound('order');
  return withTenant({ tenantId: r.tenantId, userId }, async (tx) => {
    const [o] = await tx`select id, number, status, refund_status, fulfillment_method, subtotal_minor, discount_minor, tax_minor, total_minor,
                           paid_minor, refunded_minor, currency, payment_terms, hold_expires_at, created_at, cancel_reason, branch_id
                         from orders where id = ${orderId} and customer_user_id = ${userId}`;
    if (!o) throw notFound('order');
    const items = await tx`select name, variant_name, unit_price_minor, quantity, line_total_minor from order_items where order_id = ${orderId}`;
    const payments = await tx`select id, kind, method, amount_minor, status, refunded_minor, checkout_url, created_at from payments where order_id = ${orderId} order by created_at`;
    const [t] = await tx`select name, slug, timezone from tenants where id = ${r.tenantId}`;
    const [br] = await tx`select name, address from branches where id = ${o.branchId}`;
    return { order: o, items, payments, tenant: t, branch: br ?? null };
  });
}

/** Payment status for the return page: ownership verified against the booking/order customer. */
export async function myPaymentStatus(userId: string, paymentId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(paymentId)) throw notFound('payment');
  // locate the tenant through the customer's own bookings/orders (RLS customer_self_read)
  const tenants = await withUser(userId, (tx) => tx<{ tenantId: string }[]>`
    select distinct tenant_id from bookings where customer_user_id = ${userId}
    union select distinct tenant_id from orders where customer_user_id = ${userId}`);
  for (const { tenantId } of tenants) {
    const [p] = await withTenant({ tenantId, userId }, (tx) => tx<{ id: string; status: string; amountMinor: number; bookingId: string | null; orderId: string | null }[]>`
      select p.id, p.status, p.amount_minor, p.booking_id, p.order_id from payments p
      left join bookings b on b.id = p.booking_id left join orders o on o.id = p.order_id
      where p.id = ${paymentId} and coalesce(b.customer_user_id, o.customer_user_id) = ${userId}`);
    if (p) {
      const [target] = p.bookingId
        ? await withTenant({ tenantId, userId }, (tx) => tx`select status, financial_status from bookings where id = ${p.bookingId}`)
        : await withTenant({ tenantId, userId }, (tx) => tx`select status, refund_status as financial_status from orders where id = ${p.orderId}`);
      return { paymentId: p.id, status: p.status, amountMinor: p.amountMinor, bookingId: p.bookingId, orderId: p.orderId, targetStatus: target?.status, financialStatus: target?.financialStatus };
    }
  }
  throw notFound('payment');
}

// ── consents ──
export const CONSENT_CHANNELS = ['email', 'sms', 'whatsapp'] as const;
export type ConsentChannel = (typeof CONSENT_CHANNELS)[number];

export async function myConsents(userId: string) {
  const rels = await withUser(userId, (tx) => tx<{ tenantId: string; tenantCustomerId: string; name: string; slug: string }[]>`
    select tc.tenant_id, tc.id as tenant_customer_id, t.name, t.slug from tenant_customers tc join tenants t on t.id = tc.tenant_id
    where tc.user_id = ${userId} order by t.name`);
  const out: { tenantId: string; name: string; slug: string; channels: Record<string, boolean> }[] = [];
  for (const r of rels) {
    const rows = await withTenant({ tenantId: r.tenantId, userId }, (tx) => tx<{ channel: string; status: string }[]>`
      select distinct on (channel) channel, status from customer_consents
      where tenant_id = ${r.tenantId} and (user_id = ${userId} or tenant_customer_id = ${r.tenantCustomerId}) and purpose = 'marketing'
      order by channel, recorded_at desc`);
    out.push({ tenantId: r.tenantId, name: r.name, slug: r.slug, channels: Object.fromEntries(CONSENT_CHANNELS.map((c) => [c, rows.find((x) => x.channel === c)?.status === 'granted'])) });
  }
  return out;
}

export async function setConsent(userId: string, tenantId: string, channel: ConsentChannel, granted: boolean) {
  return withTenant({ tenantId, userId }, async (tx) => {
    const [tc] = await tx<{ id: string }[]>`select id from tenant_customers where tenant_id = ${tenantId} and user_id = ${userId}`;
    if (!tc) throw notFound('relationship');
    await tx`insert into customer_consents (tenant_id, user_id, tenant_customer_id, channel, purpose, status, source)
             values (${tenantId}, ${userId}, ${tc.id}, ${channel}, 'marketing', ${granted ? 'granted' : 'revoked'}, 'account')`;
  });
}

export function assertOwnHold(b: { customerUserId: string | null } | undefined, userId: string) {
  if (!b || b.customerUserId !== userId) throw notFound('booking');
}

export { AppError };
