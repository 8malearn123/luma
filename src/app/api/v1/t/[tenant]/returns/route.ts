import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { listReturns } from '@/server/commerce/returns';

export const GET = api.tenant(['orders.manage', 'refunds.issue'], async (c) => {
  const q = c.query(z.object({ status: z.enum(['requested', 'approved', 'rejected', 'received', 'completed', 'cancelled']).optional() }));
  return { items: await tx(c.t, (db) => listReturns(db, { status: q.status })) };
});
