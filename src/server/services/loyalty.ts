import type { Tx } from '../db';
import { AppError, notFound } from '../errors';
import { audit } from '../audit';
import type { TenantContext } from '../tenancy/context';

/**
 * Tenant-scoped points ledger. The balance column is a cache maintained in the
 * same transaction as each entry (CHECK balance ≥ 0 prevents over-redemption
 * under concurrency; the account row is locked FOR UPDATE).
 */
async function account(tx: Tx, tenantId: string, tenantCustomerId: string) {
  const [a] = await tx<{ id: string; balance: number }[]>`
    insert into loyalty_accounts (tenant_id, tenant_customer_id, customer_user_id)
    values (${tenantId}, ${tenantCustomerId}, (select user_id from tenant_customers where id = ${tenantCustomerId}))
    on conflict (tenant_id, tenant_customer_id) do update set tenant_customer_id = excluded.tenant_customer_id
    returning id, balance`;
  return a;
}

export async function earnForBooking(tx: Tx, bookingId: string) {
  const [b] = await tx<{ tenantId: string; tenantCustomerId: string; paidMinor: number; refundedMinor: number; status: string }[]>`
    select tenant_id, tenant_customer_id, paid_minor, refunded_minor, status from bookings where id = ${bookingId}`;
  if (!b || b.status !== 'completed') return;
  const [rules] = await tx<{ enabled: boolean; pointsPerSar: string; expiryDays: number | null }[]>`select enabled, points_per_sar, expiry_days from loyalty_rules limit 1`;
  if (!rules?.enabled) return;
  const points = Math.floor(((b.paidMinor - b.refundedMinor) / 100) * Number(rules.pointsPerSar));
  if (points <= 0) return;
  const a = await account(tx, b.tenantId, b.tenantCustomerId);
  const ins = await tx`insert into points_entries (tenant_id, account_id, kind, points, ref_type, ref_id, reason, expires_at)
                       values (${b.tenantId}, ${a.id}, 'earn', ${points}, 'booking', ${bookingId}, 'completed visit',
                               ${rules.expiryDays ? new Date(Date.now() + rules.expiryDays * 86400000) : null})
                       on conflict do nothing returning id`;
  if (ins.length) await tx`update loyalty_accounts set balance = balance + ${points} where id = ${a.id}`;
}

/** Reverse earned points after a refund (policy: reverse_on_refund). Never drives the balance negative silently. */
export async function reverseForRefund(tx: Tx, bookingId: string) {
  const [e] = await tx<{ accountId: string; points: number; tenantId: string }[]>`
    select account_id, points, tenant_id from points_entries where ref_type = 'booking' and ref_id = ${bookingId} and kind = 'earn'`;
  if (!e) return;
  const [rules] = await tx<{ reverseOnRefund: boolean }[]>`select reverse_on_refund from loyalty_rules limit 1`;
  if (!rules?.reverseOnRefund) return;
  const [acc] = await tx<{ balance: number }[]>`select balance from loyalty_accounts where id = ${e.accountId} for update`;
  const take = Math.min(acc.balance, e.points);
  if (take <= 0) return;
  const ins = await tx`insert into points_entries (tenant_id, account_id, kind, points, ref_type, ref_id, reason)
                       values (${e.tenantId}, ${e.accountId}, 'reverse', ${-take}, 'booking', ${bookingId}, 'refund reversal') on conflict do nothing returning id`;
  if (ins.length) await tx`update loyalty_accounts set balance = balance - ${take} where id = ${e.accountId}`;
}

export async function redeemPoints(tx: Tx, ctx: TenantContext, tenantCustomerId: string, rewardId: string, ref: { bookingId?: string; orderId?: string }) {
  const [rw] = await tx<{ id: string; pointsCost: number; rewardKind: string; rewardValue: number; status: string }[]>`select * from loyalty_rewards where id = ${rewardId}`;
  if (!rw || rw.status !== 'active') throw notFound('reward');
  const a = await account(tx, ctx.tenant.id, tenantCustomerId);
  const [locked] = await tx<{ balance: number }[]>`select balance from loyalty_accounts where id = ${a.id} for update`;
  if (locked.balance < rw.pointsCost) throw new AppError('validation', 'errors.points_insufficient', { balance: locked.balance });
  const [pe] = await tx<{ id: string }[]>`insert into points_entries (tenant_id, account_id, kind, points, ref_type, ref_id, reason, actor_user_id)
    values (${ctx.tenant.id}, ${a.id}, 'redeem', ${-rw.pointsCost}, 'reward', ${rw.id}, 'reward redemption', ${ctx.user.userId}) returning id`;
  await tx`update loyalty_accounts set balance = balance - ${rw.pointsCost} where id = ${a.id}`;
  await tx`insert into reward_redemptions (tenant_id, tenant_customer_id, reward_id, points_entry_id, booking_id, order_id, discount_minor)
           values (${ctx.tenant.id}, ${tenantCustomerId}, ${rw.id}, ${pe.id}, ${ref.bookingId ?? null}, ${ref.orderId ?? null}, ${rw.rewardKind === 'discount_fixed' ? rw.rewardValue : 0})`;
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: 'loyalty.redeemed', targetType: 'reward', targetId: rw.id });
  return { pointsSpent: rw.pointsCost, balance: locked.balance - rw.pointsCost };
}

export async function adjustPoints(tx: Tx, ctx: TenantContext, tenantCustomerId: string, points: number, reason: string) {
  if (!reason.trim() || points === 0) throw new AppError('validation', 'errors.reason_required');
  const a = await account(tx, ctx.tenant.id, tenantCustomerId);
  const [locked] = await tx<{ balance: number }[]>`select balance from loyalty_accounts where id = ${a.id} for update`;
  if (locked.balance + points < 0) throw new AppError('validation', 'errors.points_insufficient');
  await tx`insert into points_entries (tenant_id, account_id, kind, points, reason, actor_user_id) values (${ctx.tenant.id}, ${a.id}, 'adjust', ${points}, ${reason}, ${ctx.user.userId})`;
  await tx`update loyalty_accounts set balance = balance + ${points} where id = ${a.id}`;
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: 'loyalty.adjusted', targetType: 'tenant_customer', targetId: tenantCustomerId, reason, metadata: { points } });
}
