import { z } from 'zod';
import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { assertBookingInTenant } from '@/server/dashboard/bookings';
import { recordOnSitePayment } from '@/server/payments/service';

/** On-site collection: authorized staff, method + reference required, never above the outstanding amount. */
export const POST = api.tenant<{ id: string }>('payments.collect', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound('booking');
  const b = await c.json(z.object({ amountMinor: z.number().int().min(1), method: z.enum(['cash', 'card_terminal']), reference: z.string().trim().min(1).max(80) }));
  return tx(c.t, async (db) => {
    await assertBookingInTenant(db, c.params.id);
    return recordOnSitePayment(db, c.t, { bookingId: c.params.id, ...b, idempotencyKey: c.req.headers.get('idempotency-key')! });
  });
}, { idempotent: true });
