import { z } from 'zod';
import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { assertOrderInTenant } from '@/server/dashboard/bookings';
import { transitionOrder } from '@/server/commerce/orders';

export const POST = api.tenant<{ id: string }>('orders.manage', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound('order');
  const b = await c.json(z.object({ to: z.enum(['paid', 'preparing', 'ready', 'collected', 'cancelled']), reason: z.string().trim().max(500).optional() }));
  return tx(c.t, async (db) => {
    await assertOrderInTenant(db, c.params.id);
    return transitionOrder(db, c.t, c.params.id, b.to, b.reason);
  });
}, { idempotent: true });
