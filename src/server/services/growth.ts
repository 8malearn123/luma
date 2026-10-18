import { z } from 'zod';
import type { Tx } from '../db';
import type { TenantContext } from '../tenancy/context';
import { entitlements, requireFeature, type FeatureKey } from '../tenancy/plan';

/** Server-side plan gate for growth endpoints (menus hiding a section is not enough). */
export async function requireGrowthFeature(tx: Tx, ctx: TenantContext, key: FeatureKey) {
  requireFeature(await entitlements(tx, ctx.tenant.id), key);
}

/** Minimal customer picker for growth screens (only this business's relationships). */
export async function searchTenantCustomers(tx: Tx, q: string | undefined) {
  const like = q ? `%${q.replace(/[%_\\]/g, (m) => `\\${m}`)}%` : null;
  return tx<{ id: string; displayName: string; phone: string | null }[]>`
    select id, display_name, phone from tenant_customers
    where archived_at is null and (${like}::text is null or display_name ilike ${like} or phone ilike ${like})
    order by display_name limit 20`;
}

export const rewardBody = z.object({
  name: z.string().trim().min(1).max(120),
  pointsCost: z.number().int().min(1).max(1_000_000),
  rewardKind: z.enum(['discount_fixed', 'discount_percent', 'free_service']),
  rewardValue: z.number().int().min(0).max(100_000_000),
  serviceId: z.string().uuid().nullable().default(null),
});
