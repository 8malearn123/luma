import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { upsertReward } from '@/server/services/loyalty';
import { requireGrowthFeature, rewardBody } from '@/server/services/growth';

export const POST = api.tenant('loyalty.manage', async (c) => {
  const b = await c.json(rewardBody);
  return tx(c.t, async (db) => {
    await requireGrowthFeature(db, c.t, 'loyalty.enabled');
    return upsertReward(db, c.t, b);
  });
});
