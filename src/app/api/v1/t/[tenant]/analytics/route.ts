import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { storeMetrics, serviceDemand } from '@/server/analytics/metrics';
import { computeOccupancy } from '@/server/analytics/occupancy';
import { wallToUtc, addDays } from '@/lib/tz';

const q = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), days: z.coerce.number().int().min(1).max(92).default(28), branchId: z.string().uuid().optional() });

export const GET = api.tenant('analytics.view', async (c) => {
  const p = c.query(q);
  const tz = c.t.tenant.timezone;
  const from = wallToUtc(p.from, '00:00', tz);
  const to = wallToUtc(addDays(p.from, p.days), '00:00', tz);
  return tx(c.t, async (db) => {
    const [b] = p.branchId ? [{ id: p.branchId }] : await db<{ id: string }[]>`select id from branches where status = 'active' order by is_primary desc limit 1`;
    const [metrics, demand, occupancy] = await Promise.all([storeMetrics(db, from, to), serviceDemand(db, from, to), b ? computeOccupancy(db, b.id, p.from, p.days) : null]);
    const canCosts = c.t.caps.has('finance.view');
    return {
      metrics,
      demand: demand.map((d) => ({ ...d, materialCostMinor: canCosts ? d.materialCostMinor : undefined })),
      occupancy,
    };
  });
});
