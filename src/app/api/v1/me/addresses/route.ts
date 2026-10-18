import { api } from '@/server/http/handler';
import { withUser } from '@/server/db';
import { addressInput, listAddresses, saveAddress } from '@/server/commerce/delivery';

export const GET = api.user(async (c) => ({ items: await withUser(c.user.userId, (tx) => listAddresses(tx, c.user.userId)) }));

export const POST = api.user(async (c) => {
  const b = await c.json(addressInput);
  return withUser(c.user.userId, (tx) => saveAddress(tx, c.user.userId, b));
}, { idempotent: true });
