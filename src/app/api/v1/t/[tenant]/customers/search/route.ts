import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { searchTenantCustomers } from '@/server/dashboard/bookings';

/** Lookup restricted to this business's customer relationships. Never searches LUMA accounts. */
export const GET = api.tenant('bookings.manage', async (c) => {
  const q = c.query(z.object({ q: z.string().trim().min(2).max(80) }));
  return { items: await tx(c.t, (db) => searchTenantCustomers(db, q.q)) };
}, { rateLimit: [120, 60] });
