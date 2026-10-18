import { z } from 'zod';
import type { Tx } from '../db';
import { AppError, forbidden, notFound } from '../errors';
import { audit } from '../audit';
import { post } from '../finance/journal';
import type { TenantContext } from '../tenancy/context';
import { entitlements, requireFeature } from '../tenancy/plan';

/**
 * Memberships / prepaid packages: N sessions of eligible services within a
 * validity period. Entitlements move reserved → consumed (or back to free):
 *   reserve on hold, consume on completion, release on eligible cancellation.
 * CHECK (reserved + consumed ≤ total) plus a row lock make over-use impossible.
 * One reservation per booking_item (unique), so every step is idempotent.
 */
export const planInput = z.object({
  name: z.string().trim().min(1).max(120),
  nameEn: z.string().trim().max(120).nullable().optional(),
  priceMinor: z.number().int().min(0).max(100_000_000),
  validityDays: z.number().int().min(7).max(730),
  entitlements: z.array(z.object({ serviceId: z.string().uuid(), sessions: z.number().int().min(1).max(100) })).min(1).max(20),
});

async function ensureFeature(tx: Tx, tenantId: string) {
  requireFeature(await entitlements(tx, tenantId), 'memberships.enabled');
}

export async function listPlans(tx: Tx) {
  return tx`select id, name, name_en, price_minor, validity_days, entitlements, status, created_at from membership_plans where status <> 'archived' order by created_at`;
}

export async function upsertPlan(tx: Tx, ctx: TenantContext, input: z.infer<typeof planInput>, id?: string) {
  if (!ctx.caps.has('loyalty.manage')) throw forbidden();
  await ensureFeature(tx, ctx.tenant.id);
  const ids = input.entitlements.map((e) => e.serviceId);
  if (new Set(ids).size !== ids.length) throw new AppError('validation', 'errors.duplicate');
  const found = await tx`select id from services where id = any(${ids}::uuid[]) and status <> 'archived'`;
  if (found.length !== ids.length) throw new AppError('validation', 'errors.invalid_reference');
  if (id) {
    const r = await tx`update membership_plans set name = ${input.name}, name_en = ${input.nameEn ?? null}, price_minor = ${input.priceMinor},
                       validity_days = ${input.validityDays}, entitlements = ${tx.json(input.entitlements as never)} where id = ${id} returning id`;
    if (!r.length) throw notFound('membership_plan');
  } else {
    const [r] = await tx<{ id: string }[]>`insert into membership_plans (tenant_id, name, name_en, price_minor, validity_days, entitlements)
      values (${ctx.tenant.id}, ${input.name}, ${input.nameEn ?? null}, ${input.priceMinor}, ${input.validityDays}, ${tx.json(input.entitlements as never)}) returning id`;
    id = r.id;
  }
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: 'membership_plan.saved', targetType: 'membership_plan', targetId: id, requestId: ctx.requestId });
  return { id };
}

export async function archivePlan(tx: Tx, ctx: TenantContext, id: string) {
  if (!ctx.caps.has('loyalty.manage')) throw forbidden();
  const r = await tx`update membership_plans set status = 'archived' where id = ${id} returning id`;
  if (!r.length) throw notFound('membership_plan');
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: 'membership_plan.archived', targetType: 'membership_plan', targetId: id, requestId: ctx.requestId });
}

/**
 * Sell & activate a membership. Plan entitlements are copied at sale time (a
 * later plan edit never changes what a customer bought). On-site sales post
 * the money as a membership liability; paymentId links an online payment.
 */
export async function sellMembership(
  tx: Tx,
  ctx: TenantContext,
  input: { planId: string; tenantCustomerId: string; sale: { method: 'cash' | 'card_terminal'; reference: string } | null; paymentId?: string | null },
) {
  if (!ctx.caps.has('loyalty.manage') && !ctx.caps.has('payments.collect')) throw forbidden();
  await ensureFeature(tx, ctx.tenant.id);
  const [plan] = await tx<{ id: string; priceMinor: number; validityDays: number; entitlements: { serviceId: string; sessions: number }[]; status: string }[]>`
    select id, price_minor, validity_days, entitlements, status from membership_plans where id = ${input.planId}`;
  if (!plan || plan.status !== 'active') throw notFound('membership_plan');
  if (plan.priceMinor > 0 && !input.sale && !input.paymentId) throw new AppError('payment_required', 'errors.payment_required');
  if (input.sale && !input.sale.reference.trim()) throw new AppError('validation', 'errors.reference_required');
  const [cust] = await tx<{ userId: string | null }[]>`select user_id from tenant_customers where id = ${input.tenantCustomerId}`;
  if (!cust) throw notFound('customer');
  const [m] = await tx<{ id: string; endsAt: Date }[]>`
    insert into memberships (tenant_id, plan_id, tenant_customer_id, customer_user_id, status, ends_at, payment_id, sold_by)
    values (${ctx.tenant.id}, ${plan.id}, ${input.tenantCustomerId}, ${cust.userId}, 'active', now() + make_interval(days => ${plan.validityDays}),
            ${input.paymentId ?? null}, ${ctx.user.userId})
    returning id, ends_at`;
  for (const e of plan.entitlements) {
    await tx`insert into membership_entitlements (tenant_id, membership_id, service_id, total) values (${ctx.tenant.id}, ${m.id}, ${e.serviceId}, ${e.sessions})`;
  }
  if (input.sale && plan.priceMinor > 0) {
    await post(tx, {
      tenantId: ctx.tenant.id,
      refType: 'membership_sale',
      refId: m.id,
      memo: `membership sold on-site ${input.sale.reference}`,
      actorUserId: ctx.user.userId,
      lines: [{ account: input.sale.method === 'cash' ? 'cash' : 'card_clearing', debit: plan.priceMinor }, { account: 'membership_liability', credit: plan.priceMinor }],
    });
  }
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: 'membership.sold', targetType: 'membership', targetId: m.id, requestId: ctx.requestId, metadata: { planId: plan.id } });
  return { membershipId: m.id, endsAt: m.endsAt };
}

export async function cancelMembership(tx: Tx, ctx: TenantContext, id: string, reason: string) {
  if (!ctx.caps.has('loyalty.manage')) throw forbidden();
  if (!reason.trim()) throw new AppError('validation', 'errors.reason_required');
  const r = await tx`update memberships set status = 'cancelled' where id = ${id} and status = 'active' returning id`;
  if (!r.length) throw new AppError('invalid_transition', 'errors.invalid_transition');
  // outstanding reservations are released so bookings fall back to normal payment terms
  await tx`update entitlement_reservations set status = 'released', updated_at = now()
           where status = 'reserved' and entitlement_id in (select id from membership_entitlements where membership_id = ${id})`;
  await tx`update membership_entitlements set reserved = 0 where membership_id = ${id}`;
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: 'membership.cancelled', targetType: 'membership', targetId: id, requestId: ctx.requestId, reason });
}

/** Usable entitlements of a customer for a service at a given time (valid on the appointment date). */
export async function eligibleEntitlement(tx: Tx, tenantCustomerId: string, serviceId: string, at: Date) {
  const [e] = await tx<{ id: string; total: number; reserved: number; consumed: number; membershipId: string; endsAt: Date }[]>`
    select e.id, e.total, e.reserved, e.consumed, e.membership_id, m.ends_at from membership_entitlements e
    join memberships m on m.id = e.membership_id
    where m.tenant_customer_id = ${tenantCustomerId} and m.status = 'active' and e.service_id = ${serviceId}
      and m.starts_at <= ${at} and m.ends_at > ${at} and e.reserved + e.consumed < e.total
    order by m.ends_at, e.id limit 1`;
  return e ?? null;
}

/** Reserve one session for a booking item (idempotent). Returns null when no eligible entitlement exists. */
export async function reserveEntitlement(tx: Tx, bookingItemId: string) {
  const [existing] = await tx<{ id: string; status: string; entitlementId: string }[]>`select id, status, entitlement_id from entitlement_reservations where booking_item_id = ${bookingItemId}`;
  if (existing && existing.status !== 'released') return existing;
  const [it] = await tx<{ tenantId: string; serviceId: string; startsAt: Date; tenantCustomerId: string }[]>`
    select i.tenant_id, i.service_id, i.starts_at, b.tenant_customer_id from booking_items i join bookings b on b.id = i.booking_id where i.id = ${bookingItemId}`;
  if (!it) throw notFound('booking_item');
  const cand = await eligibleEntitlement(tx, it.tenantCustomerId, it.serviceId, it.startsAt);
  if (!cand) return null;
  const [locked] = await tx<{ total: number; reserved: number; consumed: number }[]>`select total, reserved, consumed from membership_entitlements where id = ${cand.id} for update`;
  if (locked.reserved + locked.consumed >= locked.total) return null;
  await tx`update membership_entitlements set reserved = reserved + 1 where id = ${cand.id}`;
  const [r] = existing
    ? await tx<{ id: string; status: string; entitlementId: string }[]>`update entitlement_reservations set status = 'reserved', entitlement_id = ${cand.id}, updated_at = now() where id = ${existing.id} returning id, status, entitlement_id`
    : await tx<{ id: string; status: string; entitlementId: string }[]>`insert into entitlement_reservations (tenant_id, entitlement_id, booking_item_id) values (${it.tenantId}, ${cand.id}, ${bookingItemId}) returning id, status, entitlement_id`;
  return r;
}

/** Consume on service delivery (idempotent). */
export async function consumeEntitlement(tx: Tx, bookingItemId: string) {
  const [r] = await tx<{ id: string; entitlementId: string; status: string }[]>`select id, entitlement_id, status from entitlement_reservations where booking_item_id = ${bookingItemId} for update`;
  if (!r || r.status !== 'reserved') return false;
  await tx`select id from membership_entitlements where id = ${r.entitlementId} for update`;
  await tx`update membership_entitlements set reserved = reserved - 1, consumed = consumed + 1 where id = ${r.entitlementId}`;
  await tx`update entitlement_reservations set status = 'consumed', updated_at = now() where id = ${r.id}`;
  return true;
}

/** Release after an eligible cancellation (idempotent). Consumed sessions are never released. */
export async function releaseEntitlement(tx: Tx, bookingItemId: string) {
  const [r] = await tx<{ id: string; entitlementId: string; status: string }[]>`select id, entitlement_id, status from entitlement_reservations where booking_item_id = ${bookingItemId} for update`;
  if (!r || r.status !== 'reserved') return false;
  await tx`select id from membership_entitlements where id = ${r.entitlementId} for update`;
  await tx`update membership_entitlements set reserved = reserved - 1 where id = ${r.entitlementId}`;
  await tx`update entitlement_reservations set status = 'released', updated_at = now() where id = ${r.id}`;
  return true;
}

/** Expiry job: memberships past ends_at become expired; open reservations are released. */
export async function expireMemberships(tx: Tx) {
  const rows = await tx<{ id: string }[]>`update memberships set status = 'expired' where status = 'active' and ends_at <= now() returning id`;
  for (const m of rows) {
    await tx`update entitlement_reservations set status = 'released', updated_at = now()
             where status = 'reserved' and entitlement_id in (select id from membership_entitlements where membership_id = ${m.id})`;
    await tx`update membership_entitlements set reserved = 0 where membership_id = ${m.id}`;
  }
  return { expired: rows.length };
}

export async function listMemberships(tx: Tx, opts: { tenantCustomerId?: string } = {}) {
  return tx`select m.id, m.status, m.starts_at, m.ends_at, p.name as plan_name, c.display_name as customer_name, m.tenant_customer_id,
              coalesce(json_agg(json_build_object('serviceId', e.service_id, 'serviceName', s.name, 'total', e.total, 'reserved', e.reserved, 'consumed', e.consumed))
                filter (where e.id is not null), '[]') as entitlements
            from memberships m join membership_plans p on p.id = m.plan_id join tenant_customers c on c.id = m.tenant_customer_id
            left join membership_entitlements e on e.membership_id = m.id left join services s on s.id = e.service_id
            where (${opts.tenantCustomerId ?? null}::uuid is null or m.tenant_customer_id = ${opts.tenantCustomerId ?? null}::uuid)
            group by m.id, p.name, c.display_name order by m.created_at desc limit 200`;
}
