import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { createProduct, listProducts, productInput } from '@/server/dashboard/products';

export const GET = api.tenant(['catalog.manage', 'orders.manage', 'inventory.manage'], async (c) => {
  const q = c.query(z.object({ q: z.string().trim().max(80).optional(), status: z.enum(['active', 'inactive', 'archived']).optional(), offset: z.coerce.number().int().min(0).default(0) }));
  return tx(c.t, (db) => listProducts(db, { ...q, showCost: c.t.caps.has('finance.view') }));
});

export const POST = api.tenant('catalog.manage', async (c) => {
  const b = await c.json(productInput);
  if (b.costMinor != null && !c.t.caps.has('finance.view')) b.costMinor = null; // costs are confidential
  return tx(c.t, (db) => createProduct(db, c.t, b));
}, { idempotent: true });
