import { z } from 'zod';
import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { assertBookingInTenant } from '@/server/dashboard/bookings';
import { transition } from '@/server/booking/service';

export const POST = api.tenant<{ id: string }>(['bookings.manage', 'bookings.view_assigned'], async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound('booking');
  const b = await c.json(z.object({ to: z.enum(['confirmed', 'checked_in', 'in_service', 'completed', 'cancelled', 'no_show']), reason: z.string().trim().max(500).optional() }));
  return tx(c.t, async (db) => {
    await assertBookingInTenant(db, c.params.id);
    return transition(db, { kind: 'staff', ctx: c.t }, c.params.id, b.to, { reason: b.reason });
  });
}, { idempotent: true });
