import { z } from 'zod';
import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { redeemPoints } from '@/server/services/loyalty';
import { requireGrowthFeature } from '@/server/services/growth';

export const POST = api.tenant<{ id: string }>(
  ['loyalty.manage', 'payments.collect'],
  async (c) => {
    if (!uuid.safeParse(c.params.id).success) throw notFound();
    const b = await c.json(z.object({ rewardId: z.string().uuid(), bookingId: z.string().uuid().optional(), orderId: z.string().uuid().optional() }));
    return tx(c.t, async (db) => {
      await requireGrowthFeature(db, c.t, 'loyalty.enabled');
      return redeemPoints(db, c.t, c.params.id, b.rewardId, { bookingId: b.bookingId, orderId: b.orderId });
    });
  },
  { idempotent: true },
);
