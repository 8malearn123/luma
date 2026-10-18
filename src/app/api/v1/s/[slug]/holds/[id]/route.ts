import { z } from 'zod';
import { api } from '@/server/http/handler';
import { getBookingFor, transition } from '@/server/booking/service';
import { customerActor, publicTenant, runPublic } from '@/server/booking/customer';
import { notFound } from '@/server/errors';

const id = z.string().uuid();

/** The customer's own hold (status, countdown, totals). */
export const GET = api.user<{ slug: string; id: string }>(async (c) => {
  if (!id.safeParse(c.params.id).success) throw notFound();
  const t = await publicTenant(c.params.slug);
  return runPublic(t, c.user.userId, async (tx) => {
    const d = await getBookingFor(tx, customerActor(c.user.userId, t.id), c.params.id);
    const b = d.booking;
    if (b.tenantId !== t.id) throw notFound(); // RLS also shows her bookings at other businesses
    return {
      bookingId: b.id, number: b.number, status: b.status, financialStatus: b.financialStatus, holdExpiresAt: b.holdExpiresAt,
      totalMinor: b.totalMinor, paidMinor: b.paidMinor, depositDueMinor: b.depositDueMinor, paymentTerms: b.paymentTerms,
      startsAt: b.startsAt, endsAt: b.endsAt, items: d.items, allowed: d.allowed,
      explanationKey: b.termsSnapshot.terms?.customerExplanationKey ?? null,
    };
  });
});

/** Release / cancel the customer's own hold. */
export const DELETE = api.user<{ slug: string; id: string }>(async (c) => {
  if (!id.safeParse(c.params.id).success) throw notFound();
  const t = await publicTenant(c.params.slug);
  return runPublic(t, c.user.userId, (tx) => transition(tx, customerActor(c.user.userId, t.id), c.params.id, 'cancelled', { reason: 'customer released hold' }));
});
