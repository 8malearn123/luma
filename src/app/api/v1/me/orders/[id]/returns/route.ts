import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { withTenant, withUser } from '@/server/db';
import { requestReturn, returnRequestInput } from '@/server/commerce/returns';

/** Customer return request: the order is located through her own orders, then handled in that business's scope. */
export const POST = api.user<{ id: string }>(async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound('order');
  const b = await c.json(returnRequestInput);
  const [o] = await withUser(c.user.userId, (tx) => tx<{ tenantId: string }[]>`select tenant_id from orders where id = ${c.params.id} and customer_user_id = ${c.user.userId}`);
  if (!o) throw notFound('order');
  return withTenant({ tenantId: o.tenantId, userId: c.user.userId }, (tx) => requestReturn(tx, o.tenantId, c.user.userId, c.params.id, b));
}, { idempotent: true, rateLimit: [10, 3600] });
