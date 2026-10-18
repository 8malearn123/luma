import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { staffPerformance } from '@/server/analytics/performance';
import { wallToUtc, addDays } from '@/lib/tz';

const q = z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), days: z.coerce.number().int().min(7).max(184).default(90), branchId: z.string().uuid().optional() });

/** Indicators only; composite shown when every component has enough data. Owner/managers with analytics.view. */
export const GET = api.tenant(['analytics.view'], async (c) => {
  const p = c.query(q);
  const tz = c.t.tenant.timezone;
  return tx(c.t, async (db) => {
    const [b] = p.branchId ? [{ id: p.branchId }] : await db<{ id: string }[]>`select id from branches where status = 'active' order by is_primary desc limit 1`;
    if (!b) return { staff: [] };
    const staff = await staffPerformance(db, c.t.tenant.id, b.id, p.from, p.days, wallToUtc(p.from, '00:00', tz), wallToUtc(addDays(p.from, p.days), '00:00', tz));
    const canRevenue = c.t.caps.has('finance.view');
    return { staff: staff.map((s) => (canRevenue ? s : { ...s, revenuePerHourVsSpecialty: { ...s.revenuePerHourVsSpecialty, value: null } })) };
  });
});
