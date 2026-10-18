import { api } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { decideReturn, decisionInput } from '@/server/commerce/returns';

const NUM = /^RET-\d{6,}$/;

export const POST = api.tenant<{ number: string }>('orders.manage', async (c) => {
  if (!NUM.test(c.params.number)) throw notFound('return');
  const b = await c.json(decisionInput);
  return tx(c.t, (db) => decideReturn(db, c.t, c.params.number, b));
}, { idempotent: true });
