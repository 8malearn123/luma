import { z } from 'zod';
import type { Tx } from '../db';
import { AppError, notFound } from '../errors';
import { audit } from '../audit';
import type { TenantContext } from '../tenancy/context';

/**
 * Tenant coupons. Validation is advisory (quote); redemption is atomic:
 * redeemed_count is incremented with a guarded UPDATE (max_redemptions CHECK
 * backs it up) and the per-customer limit is checked under the coupon row lock.
 * A discount never exceeds the total.
 */
export const couponInput = z.object({
  code: z.string().trim().min(3).max(32).regex(/^[A-Za-z0-9_-]+$/, 'errors.coupon_code_invalid'),
  kind: z.enum(['percent', 'fixed']),
  value: z.number().int().positive(), // bps for percent, minor units for fixed
  minTotalMinor: z.number().int().min(0).default(0),
  maxRedemptions: z.number().int().min(1).nullable().default(null),
  perCustomerLimit: z.number().int().min(1).max(100).default(1),
  startsAt: z.string().datetime({ offset: true }).nullable().default(null),
  endsAt: z.string().datetime({ offset: true }).nullable().default(null),
});

interface CouponRow {
  id: string;
  tenantId: string;
  code: string;
  kind: 'percent' | 'fixed';
  value: number;
  minTotalMinor: number;
  maxRedemptions: number | null;
  redeemedCount: number;
  perCustomerLimit: number;
  startsAt: Date | null;
  endsAt: Date | null;
  status: string;
}

export function discountFor(c: Pick<CouponRow, 'kind' | 'value'>, totalMinor: number): number {
  const d = c.kind === 'percent' ? Math.floor((totalMinor * c.value + 5000) / 10000) : c.value;
  return Math.max(0, Math.min(d, totalMinor));
}

async function check(tx: Tx, c: CouponRow | undefined, totalMinor: number, tenantCustomerId: string | null, now = new Date()) {
  if (!c || c.status !== 'active') throw new AppError('validation', 'errors.coupon_invalid');
  if (c.startsAt && c.startsAt > now) throw new AppError('validation', 'errors.coupon_not_started');
  if (c.endsAt && c.endsAt <= now) throw new AppError('validation', 'errors.coupon_expired');
  if (totalMinor < c.minTotalMinor) throw new AppError('validation', 'errors.coupon_min_total', { minTotalMinor: c.minTotalMinor });
  if (c.maxRedemptions !== null && c.redeemedCount >= c.maxRedemptions) throw new AppError('validation', 'errors.coupon_exhausted');
  if (tenantCustomerId) {
    const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from reward_redemptions where tenant_id = ${c.tenantId} and coupon_id = ${c.id} and tenant_customer_id = ${tenantCustomerId} and status = 'applied'`;
    if (n >= c.perCustomerLimit) throw new AppError('validation', 'errors.coupon_customer_limit');
  }
}

/** Contract for checkout: advisory validation (no state change). */
export async function validateCoupon(tx: Tx, _tenantId: string, code: string, ctx: { totalMinor: number; tenantCustomerId: string | null }) {
  const [c] = await tx<CouponRow[]>`select * from coupons where code = ${code.trim()}`;
  await check(tx, c, ctx.totalMinor, ctx.tenantCustomerId);
  return { couponId: c!.id, discountMinor: discountFor(c!, ctx.totalMinor) };
}

/** Atomic redemption inside the checkout transaction. */
export async function redeemCoupon(
  tx: Tx,
  tenantId: string,
  code: string,
  r: { totalMinor: number; tenantCustomerId: string; bookingId?: string | null; orderId?: string | null },
) {
  const [c] = await tx<CouponRow[]>`select * from coupons where code = ${code.trim()} for update`;
  await check(tx, c, r.totalMinor, r.tenantCustomerId);
  const discount = discountFor(c!, r.totalMinor);
  const upd = await tx`update coupons set redeemed_count = redeemed_count + 1
                       where id = ${c!.id} and (max_redemptions is null or redeemed_count < max_redemptions) returning id`;
  if (!upd.length) throw new AppError('validation', 'errors.coupon_exhausted');
  const [red] = await tx<{ id: string }[]>`
    insert into reward_redemptions (tenant_id, tenant_customer_id, coupon_id, booking_id, order_id, discount_minor)
    values (${tenantId}, ${r.tenantCustomerId}, ${c!.id}, ${r.bookingId ?? null}, ${r.orderId ?? null}, ${discount}) returning id`;
  return { couponId: c!.id, redemptionId: red.id, discountMinor: discount };
}

/** Reverse a redemption (e.g. order cancelled before payment). Frees the slot once. */
export async function reverseRedemption(tx: Tx, redemptionId: string) {
  const [r] = await tx<{ couponId: string | null }[]>`update reward_redemptions set status = 'reversed' where id = ${redemptionId} and status = 'applied' returning coupon_id`;
  if (r?.couponId) await tx`update coupons set redeemed_count = greatest(redeemed_count - 1, 0) where id = ${r.couponId}`;
}

export async function listCoupons(tx: Tx) {
  return tx`select id, code, kind, value, min_total_minor, max_redemptions, redeemed_count, per_customer_limit, starts_at, ends_at, status, created_at
            from coupons where status <> 'archived' order by created_at desc`;
}

export async function createCoupon(tx: Tx, ctx: TenantContext, input: z.infer<typeof couponInput>) {
  if (input.kind === 'percent' && input.value > 10000) throw new AppError('validation', 'errors.validation', { value: 'errors.validation' });
  if (input.startsAt && input.endsAt && new Date(input.endsAt) <= new Date(input.startsAt)) throw new AppError('validation', 'errors.time_range_invalid');
  const [c] = await tx<{ id: string }[]>`
    insert into coupons (tenant_id, code, kind, value, min_total_minor, max_redemptions, per_customer_limit, starts_at, ends_at)
    values (${ctx.tenant.id}, ${input.code}, ${input.kind}, ${input.value}, ${input.minTotalMinor}, ${input.maxRedemptions},
            ${input.perCustomerLimit}, ${input.startsAt}, ${input.endsAt}) returning id`;
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: 'coupon.created', targetType: 'coupon', targetId: c.id, requestId: ctx.requestId, metadata: { code: input.code } });
  return c;
}

export async function setCouponStatus(tx: Tx, ctx: TenantContext, id: string, status: 'active' | 'paused' | 'archived') {
  const r = await tx`update coupons set status = ${status} where id = ${id} returning id`;
  if (!r.length) throw notFound('coupon');
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: `coupon.${status}`, targetType: 'coupon', targetId: id, requestId: ctx.requestId });
}
