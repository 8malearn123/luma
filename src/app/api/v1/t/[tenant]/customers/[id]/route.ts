import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { customerPatch, getCustomer, updateCustomer } from '@/server/dashboard/customers';

const id = (s: string) => {
  if (!uuid.safeParse(s).success) throw notFound('customer');
  return s;
};
export const GET = api.tenant<{ id: string }>('customers.view', async (c) => tx(c.t, (db) => getCustomer(db, c.t, id(c.params.id))));
export const PATCH = api.tenant<{ id: string }>('customers.view', async (c) => {
  const b = await c.json(customerPatch);
  await tx(c.t, (db) => updateCustomer(db, c.t, id(c.params.id), b));
  return { ok: true };
});
