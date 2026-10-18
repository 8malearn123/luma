import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { listPayments } from '@/server/finance/reports';
import { periodQuery, resolvePeriod } from '@/server/dashboard/period';

export const GET = api.tenant(['finance.view', 'refunds.issue'], async (c) => {
  const p = resolvePeriod(c.query(periodQuery), c.t.tenant.timezone);
  return { items: await tx(c.t, (db) => listPayments(db, p.start, p.end)) };
});
