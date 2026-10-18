import { pageT, requireTenant } from '@/server/http/page';
import { tx, type TenantContext } from '@/server/tenancy/context';
import { entitlements, featureEnabled, type FeatureKey } from '@/server/tenancy/plan';
import type { Capability } from '@/server/tenancy/capabilities';
import { EmptyState } from '../ui/forms';

/** Server-side gate for growth pages: membership → capability → plan feature. */
export async function growthGate(slug: string, caps: Capability[], feature: FeatureKey) {
  const ctx = await requireTenant(slug);
  const { t, locale } = await pageT(ctx.user);
  const allowed = caps.some((c) => ctx.caps.has(c));
  const ent = await tx(ctx, (db) => entitlements(db, ctx.tenant.id));
  const state: 'ok' | 'denied' | 'feature' = !allowed ? 'denied' : !featureEnabled(ent, feature) ? 'feature' : 'ok';
  return { ctx, t, locale, state, ent };
}

export function GateMessage({ state, t }: { state: 'denied' | 'feature'; t: (k: string) => string }) {
  return (
    <div className="card">
      <EmptyState icon="lock" title={state === 'denied' ? t('common.permission_denied') : t('growth.feature_off')} />
    </div>
  );
}

export type { TenantContext };
