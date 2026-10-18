import { z } from 'zod';
import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { decidePriceChange } from '@/server/services/catalog';

/** Approve/reject a proposed price. Confirmed bookings keep their snapshot regardless. */
export const POST = api.tenant<{ id: string }>('catalog.price.approve', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  const { approve } = await c.json(z.object({ approve: z.boolean() }));
  await tx(c.t, (db) => decidePriceChange(db, c.t, c.params.id, approve));
  return { ok: true };
});
