import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { testMoyasar } from '@/server/payments/connect';

export const POST = api.tenant<{ id: string }>('payments.configure', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound('payment_account');
  return tx(c.t, (db) => testMoyasar(db, c.t, c.params.id));
}, { rateLimit: [10, 600] });
