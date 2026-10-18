import { api } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { withTenant, withUser } from '@/server/db';
import { cancelMyReturn } from '@/server/commerce/returns';

export const POST = api.user<{ number: string }>(async (c) => {
  if (!/^RET-\d{6,}$/.test(c.params.number)) throw notFound('return');
  // returns.customer_self_read applies in the cross-tenant scope only
  const rows = await withUser(c.user.userId, (tx) => tx<{ tenantId: string }[]>`select distinct tenant_id from returns where request_number = ${c.params.number} and customer_user_id = ${c.user.userId}`);
  if (rows.length !== 1) throw notFound('return');
  await withTenant({ tenantId: rows[0].tenantId, userId: c.user.userId }, (tx) => cancelMyReturn(tx, c.user.userId, c.params.number));
  return { ok: true };
});
