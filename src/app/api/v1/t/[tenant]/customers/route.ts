import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { listCustomers } from '@/server/dashboard/customers';
import { createWalkInCustomer, walkInInput } from '@/server/dashboard/bookings';

export const GET = api.tenant('customers.view', async (c) => {
  const q = c.query(z.object({ q: z.string().trim().max(80).optional(), tag: z.string().max(30).optional(), offset: z.coerce.number().int().min(0).default(0) }));
  return tx(c.t, (db) => listCustomers(db, q));
});

/** Business-local customer without a LUMA account (walk-in / phone booking). */
export const POST = api.tenant('bookings.manage', async (c) => {
  const b = await c.json(walkInInput);
  return tx(c.t, (db) => createWalkInCustomer(db, c.t, b));
}, { idempotent: true });
