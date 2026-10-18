import { z } from 'zod';
import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { assertBookingInTenant } from '@/server/dashboard/bookings';
import { getBookingFor } from '@/server/booking/service';
import { setInternalNote } from '@/server/dashboard/bookings';

const id = (s: string) => {
  if (!uuid.safeParse(s).success) throw notFound('booking');
  return s;
};

export const GET = api.tenant<{ id: string }>(['bookings.manage', 'bookings.view_assigned', 'bookings.view_financial'], async (c) =>
  tx(c.t, async (db) => {
    await assertBookingInTenant(db, c.params.id);
    const r = await getBookingFor(db, { kind: 'staff', ctx: c.t }, id(c.params.id));
    const payments = c.t.caps.has('bookings.manage') || c.t.caps.has('bookings.view_financial') || c.t.caps.has('payments.collect')
      ? await db`select id, kind, method, amount_minor, status, refunded_minor, provider, collection_ref, created_at from payments where booking_id = ${r.booking.id} order by created_at`
      : [];
    const b = r.booking as unknown as Record<string, unknown>;
    if (!c.t.caps.has('bookings.manage')) delete b.internalNote;
    return { ...r, payments };
  }),
);

export const PATCH = api.tenant<{ id: string }>('bookings.manage', async (c) => {
  const b = await c.json(z.object({ internalNote: z.string().max(2000) }));
  await tx(c.t, async (db) => {
    await assertBookingInTenant(db, c.params.id);
    return setInternalNote(db, c.t, id(c.params.id), b.internalNote);
  });
  return { ok: true };
});
