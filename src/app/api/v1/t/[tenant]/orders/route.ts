import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { listOrders } from '@/server/dashboard/products';

export const GET = api.tenant(['orders.manage', 'finance.view'], async (c) => {
  const q = c.query(z.object({ status: z.string().regex(/^[a-z_]+$/).optional(), q: z.string().max(80).optional(), offset: z.coerce.number().int().min(0).default(0) }));
  return tx(c.t, (db) => listOrders(db, q));
});
