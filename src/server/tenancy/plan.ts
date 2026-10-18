import type { Tx } from '../db';
import { AppError } from '../errors';

/**
 * Plan entitlements, enforced server-side. Feature keys:
 *   <area>.enabled  boolean features
 *   <area>.max      countable limits (limit_value NULL = unlimited)
 */
export const FEATURE_KEYS = [
  'branches.max',
  'staff.max',
  'services.max',
  'products.enabled',
  'custom_pages.max',
  'marketing.enabled',
  'ai.monthly_runs',
  'loyalty.enabled',
  'giftcards.enabled',
  'memberships.enabled',
  'waitlist.enabled',
  'group_sessions.enabled',
  'branding.remove_powered_by',
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export interface Entitlements {
  planCode: string | null;
  subscriptionStatus: string | null;
  /** live = can take new bookings/orders */
  live: boolean;
  features: Map<string, { enabled: boolean; limit: number | null }>;
}

export async function entitlements(tx: Tx, tenantId: string): Promise<Entitlements> {
  const [sub] = await tx<{ status: string; planId: string; code: string; graceUntil: Date | null; trialEndsAt: Date | null }[]>`
    select s.status, s.plan_id, p.code, s.grace_until, s.trial_ends_at
    from subscriptions s join plans p on p.id = s.plan_id
    where s.tenant_id = ${tenantId} and s.status in ('trialing','active','past_due','paused')
    order by s.created_at desc limit 1`;
  const features = new Map<string, { enabled: boolean; limit: number | null }>();
  if (sub) {
    const rows = await tx<{ featureKey: string; enabled: boolean; limitValue: number | null }[]>`
      select feature_key, enabled, limit_value from plan_features where plan_id = ${sub.planId}`;
    for (const r of rows) features.set(r.featureKey, { enabled: r.enabled, limit: r.limitValue });
  }
  const now = Date.now();
  const live =
    !!sub &&
    (sub.status === 'active' ||
      (sub.status === 'trialing' && (!sub.trialEndsAt || +sub.trialEndsAt > now)) ||
      (sub.status === 'past_due' && !!sub.graceUntil && +sub.graceUntil > now));
  return { planCode: sub?.code ?? null, subscriptionStatus: sub?.status ?? null, live, features };
}

export function featureEnabled(e: Entitlements, key: FeatureKey): boolean {
  const f = e.features.get(key);
  return !!f && f.enabled;
}

export function requireFeature(e: Entitlements, key: FeatureKey) {
  if (!featureEnabled(e, key)) throw new AppError('plan_limit', 'errors.plan_feature', { feature: key });
}

/** Throws when creating one more item would exceed the plan limit. Existing data is never deleted. */
export function requireBelowLimit(e: Entitlements, key: FeatureKey, currentCount: number) {
  const f = e.features.get(key);
  if (!f || !f.enabled) throw new AppError('plan_limit', 'errors.plan_feature', { feature: key });
  if (f.limit !== null && currentCount >= f.limit) {
    throw new AppError('plan_limit', 'errors.plan_limit', { feature: key, limit: f.limit });
  }
}

export function requireLive(e: Entitlements) {
  if (!e.live) throw new AppError('forbidden', 'errors.subscription_inactive');
}
