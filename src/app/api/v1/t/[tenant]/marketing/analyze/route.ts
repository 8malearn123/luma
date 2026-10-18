import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { entitlements, requireFeature } from '@/server/tenancy/plan';
import { requestAnalysis, runJobInline } from '@/server/marketing/analysis';

/** Queue a weekly/monthly analysis (idempotent per period); runNow executes it in-request when no worker is running. */
export const POST = api.tenant(
  'marketing.manage',
  async (c) => {
    const b = await c.json(z.object({ horizon: z.enum(['weekly', 'monthly']), runNow: z.boolean().default(true), force: z.boolean().default(false), parentPlanId: z.string().uuid().nullable().optional() }));
    const job = await tx(c.t, async (db) => {
      requireFeature(await entitlements(db, c.t.tenant.id), 'marketing.enabled');
      return requestAnalysis(db, c.t.tenant.id, c.user.userId, b.horizon, { force: b.force, parentPlanId: b.parentPlanId });
    });
    if (b.runNow && job.status === 'queued') {
      try {
        const result = await runJobInline(c.t.tenant.id, job.id, c.user.userId);
        return { jobId: job.id, status: 'succeeded', result };
      } catch {
        return { jobId: job.id, status: 'failed' };
      }
    }
    return { jobId: job.id, status: job.status, alreadyExists: !job.created };
  },
  { rateLimit: [20, 3600] },
);
