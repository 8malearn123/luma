import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { assertOrderInTenant } from '@/server/dashboard/bookings';
import { returnRequestInput, staffReturn } from '@/server/commerce/returns';

/** Staff-recorded return (in store), approved on creation. */
export const POST = api.tenant<{ id: string }>('orders.manage', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound('order');
  const b = await c.json(returnRequestInput);
  return tx(c.t, async (db) => {
    await assertOrderInTenant(db, c.params.id);
    return staffReturn(db, c.t, c.params.id, b);
  });
}, { idempotent: true });
