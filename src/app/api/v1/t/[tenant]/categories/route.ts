import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { createCategory, listCategories } from '@/server/services/catalog';
import { categoryInput } from '@/lib/validation/catalog';

export const GET = api.tenant(['catalog.manage', 'bookings.manage'], async (c) => {
  const q = c.query(z.object({ kind: z.enum(['service', 'product']).default('service'), archived: z.enum(['0', '1']).default('0') }));
  return { items: await tx(c.t, (db) => listCategories(db, q.kind, q.archived === '1')) };
});

export const POST = api.tenant('catalog.manage', async (c) => {
  const body = await c.json(categoryInput);
  return tx(c.t, (db) => createCategory(db, c.t, body));
}, { idempotent: true });
