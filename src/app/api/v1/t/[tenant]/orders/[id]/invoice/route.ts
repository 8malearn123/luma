import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { assertOrderInTenant } from '@/server/dashboard/bookings';
import { issueInvoice } from '@/server/finance/invoices';

export const POST = api.tenant<{ id: string }>(['orders.manage', 'finance.view'], async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound('order');
  return tx(c.t, async (db) => {
    await assertOrderInTenant(db, c.params.id);
    return issueInvoice(db, c.t, { orderId: c.params.id });
  });
}, { idempotent: true });
