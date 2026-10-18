import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { listCommissions } from '@/server/finance/reports';
import { periodQuery, resolvePeriod } from '@/server/dashboard/period';

export const GET = api.tenant('finance.view', async (c) => {
  const p = resolvePeriod(c.query(periodQuery), c.t.tenant.timezone);
  return { items: await tx(c.t, (db) => listCommissions(db, p.start, p.end)) };
});
