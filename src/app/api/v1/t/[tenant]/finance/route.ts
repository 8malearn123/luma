import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { financeReport } from '@/server/finance/reports';
import { periodQuery, resolvePeriod } from '@/server/dashboard/period';

/** Costs, profit and financial summaries — finance.view only (receptionists get 403). */
export const GET = api.tenant('finance.view', async (c) => {
  const p = resolvePeriod(c.query(periodQuery), c.t.tenant.timezone);
  return tx(c.t, (db) => financeReport(db, p.start, p.end, c.t.tenant.timezone));
});
