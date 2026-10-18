import { z } from 'zod';
import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { assertOrderInTenant } from '@/server/dashboard/bookings';
import { recordOnSitePayment } from '@/server/payments/service';

export const POST = api.tenant<{ id: string }>('payments.collect', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound('order');
  const b = await c.json(z.object({ amountMinor: z.number().int().min(1), method: z.enum(['cash', 'card_terminal']), reference: z.string().trim().min(1).max(80) }));
  return tx(c.t, async (db) => {
    await assertOrderInTenant(db, c.params.id);
    const r = await recordOnSitePayment(db, c.t, { orderId: c.params.id, ...b, idempotencyKey: c.req.headers.get('idempotency-key')! });
    // a pay-at-pickup order becomes 'paid' once fully settled
    await db`update orders set status = 'paid', hold_expires_at = null, version = version + 1 where id = ${c.params.id} and status = 'pending_payment' and paid_minor >= total_minor`;
    await db`update stock_reservations set expires_at = 'infinity' where order_id = ${c.params.id} and status = 'active' and exists (select 1 from orders where id = ${c.params.id} and status = 'paid')`;
    return r;
  });
}, { idempotent: true });
