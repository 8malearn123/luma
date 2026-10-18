import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { assertBookingInTenant } from '@/server/dashboard/bookings';
import { reschedule, rescheduleInput } from '@/server/booking/service';

export const POST = api.tenant<{ id: string }>('bookings.manage', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound('booking');
  const b = await c.json(rescheduleInput);
  return tx(c.t, async (db) => {
    await assertBookingInTenant(db, c.params.id);
    return reschedule(db, { kind: 'staff', ctx: c.t }, c.params.id, b);
  });
}, { idempotent: true });
