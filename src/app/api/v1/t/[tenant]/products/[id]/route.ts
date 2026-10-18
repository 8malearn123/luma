import { z } from 'zod';
import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { getProduct, productInput, setProductStatus, updateProduct } from '@/server/dashboard/products';

const id = (s: string) => {
  if (!uuid.safeParse(s).success) throw notFound('product');
  return s;
};
export const GET = api.tenant<{ id: string }>(['catalog.manage', 'orders.manage', 'inventory.manage'], async (c) =>
  tx(c.t, (db) => getProduct(db, id(c.params.id), c.t.caps.has('finance.view'))),
);
export const PUT = api.tenant<{ id: string }>('catalog.manage', async (c) => {
  const b = await c.json(productInput.extend({ expectedVersion: z.number().int() }));
  return tx(c.t, async (db) => {
    if (!c.t.caps.has('finance.view')) {
      // keep the existing confidential cost untouched for users who cannot see it
      const [cur] = await db<{ costMinor: number | null }[]>`select cost_minor from products where id = ${id(c.params.id)}`;
      b.costMinor = cur?.costMinor ?? null;
    }
    return updateProduct(db, c.t, id(c.params.id), b, b.expectedVersion);
  });
});
export const PATCH = api.tenant<{ id: string }>('catalog.manage', async (c) => {
  const b = await c.json(z.object({ status: z.enum(['active', 'inactive', 'archived']) }));
  await tx(c.t, (db) => setProductStatus(db, c.t, id(c.params.id), b.status));
  return { ok: true };
});
