import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { assertOrderInTenant } from '@/server/dashboard/bookings';
import { deliveryUpdateInput, updateDelivery } from '@/server/commerce/delivery';

export const POST = api.tenant<{ id: string }>('orders.manage', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound('order');
  const b = await c.json(deliveryUpdateInput);
  return tx(c.t, async (db) => {
    await assertOrderInTenant(db, c.params.id);
    return updateDelivery(db, c.t, c.params.id, b);
  });
}, { idempotent: true });
