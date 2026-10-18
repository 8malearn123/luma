import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { listMemberships, listPlans } from '@/server/services/memberships';
import { requireGrowthFeature } from '@/server/services/growth';

export const GET = api.tenant('loyalty.manage', async (c) =>
  tx(c.t, async (db) => {
    await requireGrowthFeature(db, c.t, 'memberships.enabled');
    const [plans, memberships] = await Promise.all([listPlans(db), listMemberships(db)]);
    return { plans, memberships };
  }),
);
