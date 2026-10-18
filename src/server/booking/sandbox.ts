import { withSystem } from '../db';
import { isProduction } from '../env';

/**
 * Sandbox checkout lookup by opaque payment id, verifying the signed-in user is
 * the payment's customer. System scope is needed because the tenant is not
 * known from the URL; the ownership check below confines the result.
 */
export async function sandboxPaymentForCustomer(userId: string, paymentId: string) {
  if (isProduction() || !/^[0-9a-f-]{36}$/i.test(paymentId)) return null;
  const [p] = await withSystem('sandbox checkout lookup', (tx) => tx<{
    id: string; amountMinor: number; currency: string; status: string; purpose: string; bookingId: string | null; orderId: string | null;
    tenantName: string; reference: string | null;
  }[]>`
    select p.id, p.amount_minor, p.currency, p.status, p.purpose, p.booking_id, p.order_id, t.name as tenant_name,
           coalesce(b.number, o.number) as reference
    from payments p join tenants t on t.id = p.tenant_id
    left join bookings b on b.id = p.booking_id left join orders o on o.id = p.order_id
    where p.id = ${paymentId} and p.provider = 'sandbox' and coalesce(b.customer_user_id, o.customer_user_id) = ${userId}`);
  if (!p) return null;
  const returnPath = p.bookingId ? `/account/bookings/${p.bookingId}?payment=${p.id}` : `/account/orders/${p.orderId}?payment=${p.id}`;
  return { ...p, returnPath };
}
