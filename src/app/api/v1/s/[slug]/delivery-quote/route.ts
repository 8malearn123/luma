import { z } from 'zod';
import { api } from '@/server/http/handler';
import { publicTenant, runPublic } from '@/server/booking/customer';
import { listAddresses, quoteDelivery } from '@/server/commerce/delivery';
import { notFound } from '@/server/errors';

/** Delivery fee for one of the customer's own addresses (server-computed; shown before approval). */
export const GET = api.user<{ slug: string }>(async (c) => {
  const q = c.query(z.object({ addressId: z.string().uuid(), subtotalMinor: z.coerce.number().int().min(0).max(100_000_000) }));
  const t = await publicTenant(c.params.slug);
  return runPublic(t, c.user.userId, async (tx) => {
    const a = (await listAddresses(tx, c.user.userId)).find((x) => x.id === q.addressId);
    if (!a) throw notFound('address');
    return quoteDelivery(tx, a, q.subtotalMinor);
  });
});
