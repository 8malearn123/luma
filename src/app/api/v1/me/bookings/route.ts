import { z } from 'zod';
import { api } from '@/server/http/handler';
import { myBookings } from '@/server/booking/customer';

/** All of the customer's bookings across businesses (only her own rows, via RLS customer_self_read). */
export const GET = api.user(async (c) => {
  const { scope } = c.query(z.object({ scope: z.enum(['upcoming', 'past', 'all']).default('all') }));
  return { items: await myBookings(c.user.userId, { scope }) };
});
