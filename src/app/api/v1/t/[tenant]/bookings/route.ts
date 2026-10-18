import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { listBookings, listQuery, tenantCustomerUser } from '@/server/dashboard/bookings';
import { createHold, holdInput, transition } from '@/server/booking/service';

export const GET = api.tenant(['bookings.manage', 'bookings.view_assigned', 'bookings.view_financial'], async (c) => {
  const q = c.query(listQuery);
  return tx(c.t, (db) => listBookings(db, c.t, q));
});

/** Staff-created booking for a business customer (receptionist flow). Server recomputes price & terms. */
export const POST = api.tenant(
  'bookings.manage',
  async (c) => {
    const b = await c.json(holdInput.extend({ tenantCustomerId: z.string().uuid(), confirmNow: z.boolean().default(true), source: z.enum(['staff', 'walk_in']).default('staff') }));
    return tx(c.t, async (db) => {
      const cust = await tenantCustomerUser(db, b.tenantCustomerId);
      const actor = { kind: 'staff' as const, ctx: c.t };
      const hold = await createHold(db, actor, { ...b, tenantCustomerId: cust.id, customerUserId: cust.userId, source: b.source });
      if (b.confirmNow && (hold.termsKind === 'on_site' || hold.termsKind === 'manual_approval')) {
        await transition(db, actor, hold.bookingId, 'confirmed');
        return { ...hold, status: 'confirmed' };
      }
      return hold;
    });
  },
  { idempotent: true },
);
