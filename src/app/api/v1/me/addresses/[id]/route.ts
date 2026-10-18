import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { withUser } from '@/server/db';
import { addressInput, deleteAddress, saveAddress } from '@/server/commerce/delivery';

export const PUT = api.user<{ id: string }>(async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound('address');
  const b = await c.json(addressInput);
  return withUser(c.user.userId, (tx) => saveAddress(tx, c.user.userId, b, c.params.id));
});

export const DELETE = api.user<{ id: string }>(async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound('address');
  await withUser(c.user.userId, (tx) => deleteAddress(tx, c.user.userId, c.params.id));
  return { ok: true };
});
