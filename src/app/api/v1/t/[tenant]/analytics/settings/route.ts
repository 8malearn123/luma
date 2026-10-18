import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { audit } from '@/server/audit';
import { getAnalyticsSettings } from '@/server/analytics/performance';

const w = z.number().min(0).max(1);
const body = z.object({
  performanceWeights: z.object({ satisfaction: w, repeat: w, punctuality: w, complaints: w, productivity: w }),
  minSampleVisits: z.number().int().min(1).max(1000),
  minSampleReviews: z.number().int().min(1).max(1000),
  shrinkageEnabled: z.boolean(),
});

export const GET = api.tenant('analytics.view', async (c) => tx(c.t, (db) => getAnalyticsSettings(db, c.t.tenant.id)));

export const PUT = api.tenant('tenant.settings.manage', async (c) => {
  const b = await c.json(body);
  return tx(c.t, async (db) => {
    await getAnalyticsSettings(db, c.t.tenant.id);
    await db`update analytics_settings set performance_weights = ${db.json(b.performanceWeights as never)}, weights_are_test_values = false,
             min_sample_visits = ${b.minSampleVisits}, min_sample_reviews = ${b.minSampleReviews}, shrinkage_enabled = ${b.shrinkageEnabled},
             updated_by = ${c.user.userId}, updated_at = now() where tenant_id = ${c.t.tenant.id}`;
    await audit(db, { actorUserId: c.user.userId, actorKind: c.t.actorKind, tenantId: c.t.tenant.id, action: 'analytics.settings_updated', requestId: c.requestId, metadata: b });
    return { ok: true };
  });
});
