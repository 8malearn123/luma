import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { planInput, upsertPlan } from '@/server/services/memberships';

export const POST = api.tenant('loyalty.manage', async (c) => {
  const b = await c.json(planInput);
  return tx(c.t, (db) => upsertPlan(db, c.t, b));
});
