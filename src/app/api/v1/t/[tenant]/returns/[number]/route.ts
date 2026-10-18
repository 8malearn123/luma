import { api } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { getReturn } from '@/server/commerce/returns';

const NUM = /^RET-\d{6,}$/;

export const GET = api.tenant<{ number: string }>(['orders.manage', 'refunds.issue'], async (c) => {
  if (!NUM.test(c.params.number)) throw notFound('return');
  return tx(c.t, (db) => getReturn(db, c.params.number));
});
