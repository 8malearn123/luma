import { api } from '@/server/http/handler';
import { checkoutCart, checkoutInput } from '@/server/commerce/orders';
import { startOrderPayment } from '@/server/payments/service';
import { customerTenantRelationship, publicTenant, runPublic } from '@/server/booking/customer';
import { AppError } from '@/server/errors';

/**
 * Converts the customer's cart into an order (server re-prices; the client
 * sends only the subtotal it showed, so a price change is surfaced for
 * approval) and starts the online payment when paying now.
 */
export const POST = api.user<{ slug: string }>(
  async (c) => {
    const t = await publicTenant(c.params.slug);
    const input = await c.json(checkoutInput);
    const key = c.req.headers.get('idempotency-key')!;
    return runPublic(t, c.user.userId, async (tx) => {
      const [cart] = await tx<{ id: string }[]>`select id from carts where user_id = ${c.user.userId} and status = 'open' and expires_at > now() order by created_at desc limit 1`;
      if (!cart) throw new AppError('validation', 'errors.cart_empty');
      const tcId = await customerTenantRelationship(tx, t.id, c.user.userId, c.user.displayName);
      const o = await checkoutCart(tx, t.id, { userId: c.user.userId, tenantCustomerId: tcId, analyticsSession: c.req.cookies.get('luma_sid')?.value ?? null }, cart.id, input);
      if (o.terms === 'full' && o.totalMinor > 0) {
        const p = await startOrderPayment(tx, c.user.userId, o.orderId, key);
        return { ...o, payment: p };
      }
      return { ...o, payment: null };
    });
  },
  { idempotent: true, rateLimit: [20, 60] },
);
