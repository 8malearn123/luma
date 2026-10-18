import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { couponInput, createCoupon, listCoupons } from '@/server/services/coupons';
import { requireGrowthFeature } from '@/server/services/growth';

export const GET = api.tenant('loyalty.manage', async (c) =>
  tx(c.t, async (db) => {
    await requireGrowthFeature(db, c.t, 'loyalty.enabled');
    return { items: await listCoupons(db) };
  }),
);

export const POST = api.tenant('loyalty.manage', async (c) => {
  const b = await c.json(couponInput);
  return tx(c.t, async (db) => {
    await requireGrowthFeature(db, c.t, 'loyalty.enabled');
    return createCoupon(db, c.t, { ...b, code: b.code.toUpperCase() });
  });
});
