import { api, pageQuery } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { getRules, listRewards, topAccounts } from '@/server/services/loyalty';
import { requireGrowthFeature, searchTenantCustomers } from '@/server/services/growth';

export const GET = api.tenant('loyalty.manage', async (c) => {
  const q = c.query(pageQuery);
  return tx(c.t, async (db) => {
    await requireGrowthFeature(db, c.t, 'loyalty.enabled');
    const [rules, rewards, accounts, customers] = await Promise.all([getRules(db), listRewards(db), topAccounts(db), searchTenantCustomers(db, q.q)]);
    return { rules, rewards, accounts, customers };
  });
});
