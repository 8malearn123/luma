import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { searchTenantCustomers } from '@/server/services/growth';

/** Customer picker for growth screens: only this business's own relationships, max 20 rows. */
export const GET = api.tenant(['loyalty.manage', 'bookings.manage', 'payments.collect'], async (c) => {
  const q = c.query(z.object({ q: z.string().trim().max(60).optional() }));
  return tx(c.t, async (db) => ({ items: await searchTenantCustomers(db, q.q) }));
});
