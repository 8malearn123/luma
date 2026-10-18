import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { assertBookingInTenant } from '@/server/dashboard/bookings';
import { issueInvoice } from '@/server/finance/invoices';

export const POST = api.tenant<{ id: string }>(['payments.collect', 'finance.view'], async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound('booking');
  return tx(c.t, async (db) => {
    await assertBookingInTenant(db, c.params.id);
    return issueInvoice(db, c.t, { bookingId: c.params.id });
  });
}, { idempotent: true });
