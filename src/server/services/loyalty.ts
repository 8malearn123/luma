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
    values (${tenantId}, ${tenantCustomerId}, (select user_id from tenant_customers where tenant_id = ${tenantId} and id = ${tenantCustomerId}))
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

// ─────────────────────────────────────────────────────────────
// Rules, rewards, balances (dashboard)
// Scope: tenant-specific only. Platform-wide redemption across businesses is
// NOT supported (separate product decision required).
// ─────────────────────────────────────────────────────────────
export interface LoyaltyRulesInput {
  enabled: boolean;
  pointsPerSar: number;
  expiryDays: number | null;
  tiers: { name: string; minPoints: number }[];
  reverseOnRefund: boolean;
}

export async function getRules(tx: Tx) {
  const [r] = await tx<{ enabled: boolean; pointsPerSar: string; expiryDays: number | null; tiers: { name: string; minPoints: number }[]; reverseOnRefund: boolean }[]>`
    select enabled, points_per_sar, expiry_days, tiers, reverse_on_refund from loyalty_rules limit 1`;
  return r ? { ...r, pointsPerSar: Number(r.pointsPerSar) } : { enabled: false, pointsPerSar: 1, expiryDays: null, tiers: [], reverseOnRefund: true };
}

export async function setRules(tx: Tx, ctx: TenantContext, input: LoyaltyRulesInput) {
  await tx`insert into loyalty_rules (tenant_id, enabled, points_per_sar, expiry_days, tiers, reverse_on_refund, updated_at)
           values (${ctx.tenant.id}, ${input.enabled}, ${input.pointsPerSar}, ${input.expiryDays}, ${tx.json(input.tiers as never)}, ${input.reverseOnRefund}, now())
           on conflict (tenant_id) do update set enabled = excluded.enabled, points_per_sar = excluded.points_per_sar, expiry_days = excluded.expiry_days,
             tiers = excluded.tiers, reverse_on_refund = excluded.reverse_on_refund, updated_at = now()`;
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: 'loyalty.rules_updated', requestId: ctx.requestId, metadata: { ...input, tiers: input.tiers.length } });
}

export async function listRewards(tx: Tx) {
  return tx`select r.id, r.name, r.points_cost, r.reward_kind, r.reward_value, r.service_id, r.status, s.name as service_name
            from loyalty_rewards r left join services s on s.id = r.service_id where r.status <> 'archived' order by r.points_cost`;
}

export async function upsertReward(
  tx: Tx,
  ctx: TenantContext,
  input: { name: string; pointsCost: number; rewardKind: 'discount_fixed' | 'discount_percent' | 'free_service'; rewardValue: number; serviceId: string | null },
  id?: string,
) {
  if (input.rewardKind === 'discount_percent' && input.rewardValue > 10000) throw new AppError('validation', 'errors.validation');
  if (input.rewardKind === 'free_service' && !input.serviceId) throw new AppError('validation', 'errors.validation');
  if (id) {
    const r = await tx`update loyalty_rewards set name = ${input.name}, points_cost = ${input.pointsCost}, reward_kind = ${input.rewardKind},
                       reward_value = ${input.rewardValue}, service_id = ${input.serviceId} where id = ${id} returning id`;
    if (!r.length) throw notFound('reward');
  } else {
    const [r] = await tx<{ id: string }[]>`insert into loyalty_rewards (tenant_id, name, points_cost, reward_kind, reward_value, service_id)
      values (${ctx.tenant.id}, ${input.name}, ${input.pointsCost}, ${input.rewardKind}, ${input.rewardValue}, ${input.serviceId}) returning id`;
    id = r.id;
  }
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: 'loyalty.reward_saved', targetType: 'reward', targetId: id, requestId: ctx.requestId });
  return { id };
}

export async function archiveReward(tx: Tx, ctx: TenantContext, id: string) {
  const r = await tx`update loyalty_rewards set status = 'archived' where id = ${id} returning id`;
  if (!r.length) throw notFound('reward');
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: 'loyalty.reward_archived', targetType: 'reward', targetId: id, requestId: ctx.requestId });
}

/** Balance + ledger history for one customer (the balance is derived, never edited directly). */
export async function customerLedger(tx: Tx, tenantCustomerId: string) {
  const [a] = await tx<{ id: string; balance: number }[]>`select id, balance from loyalty_accounts where tenant_customer_id = ${tenantCustomerId}`;
  if (!a) return { balance: 0, entries: [], tier: null as string | null };
  const entries = await tx`select id, kind, points, ref_type, reason, expires_at, created_at from points_entries where account_id = ${a.id} order by created_at desc limit 200`;
  const rules = await getRules(tx);
  const tier = [...rules.tiers].sort((x, y) => y.minPoints - x.minPoints).find((t) => a.balance >= t.minPoints)?.name ?? null;
  return { balance: a.balance, entries, tier };
}

export async function topAccounts(tx: Tx, limit = 50) {
  return tx`select a.tenant_customer_id, c.display_name, a.balance,
              (select max(created_at) from points_entries e where e.account_id = a.id) as last_activity
            from loyalty_accounts a join tenant_customers c on c.id = a.tenant_customer_id
            order by a.balance desc limit ${limit}`;
}

/**
 * Expire earned points past their expiry (approximate FIFO: each expired earn
 * entry expires at most its own points and never more than the balance).
 * Idempotent: one 'expire' entry per earn entry.
 */
export async function expirePoints(tx: Tx) {
  const due = await tx<{ id: string; tenantId: string; accountId: string; points: number }[]>`
    select e.id, e.tenant_id, e.account_id, e.points from points_entries e
    where e.kind = 'earn' and e.expires_at is not null and e.expires_at <= now()
      and not exists (select 1 from points_entries x where x.kind = 'expire' and x.ref_type = 'points_entry' and x.ref_id = e.id)
      and exists (select 1 from loyalty_accounts a where a.id = e.account_id and a.balance > 0)
    order by e.expires_at limit 500`;
  let n = 0;
  for (const e of due) {
    const [acc] = await tx<{ balance: number }[]>`select balance from loyalty_accounts where id = ${e.accountId} for update`;
    const take = Math.min(acc.balance, e.points);
    if (take > 0) {
      await tx`insert into points_entries (tenant_id, account_id, kind, points, ref_type, ref_id, reason)
               values (${e.tenantId}, ${e.accountId}, 'expire', ${-take}, 'points_entry', ${e.id}, 'points expired')`;
      await tx`update loyalty_accounts set balance = balance - ${take} where id = ${e.accountId}`;
      n++;
    }
  }
  return { expired: n };
}
