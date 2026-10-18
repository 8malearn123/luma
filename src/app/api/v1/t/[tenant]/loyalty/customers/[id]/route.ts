import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { customerLedger } from '@/server/services/loyalty';

export const GET = api.tenant<{ id: string }>(['loyalty.manage', 'customers.view'], async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  return tx(c.t, async (db) => {
    const [cust] = await db`select id from tenant_customers where id = ${c.params.id}`;
    if (!cust) throw notFound();
    return customerLedger(db, c.params.id);
  });
});
