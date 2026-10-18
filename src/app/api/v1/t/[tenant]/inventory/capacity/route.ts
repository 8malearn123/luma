import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { capacityEstimate } from '@/server/commerce/inventory';

export const GET = api.tenant('inventory.manage', async (c) => {
  const q = c.query(z.object({ serviceId: z.string().uuid(), branchId: z.string().uuid() }));
  return tx(c.t, (db) => capacityEstimate(db, q.serviceId, q.branchId));
});
