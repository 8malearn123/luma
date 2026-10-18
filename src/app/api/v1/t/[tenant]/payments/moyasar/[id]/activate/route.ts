import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { activateMoyasar } from '@/server/payments/connect';
import { requireRecentStepUp } from '@/server/auth/service';

export const POST = api.tenant<{ id: string }>('payments.configure', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound('payment_account');
  requireRecentStepUp(c.user);
  return tx(c.t, (db) => activateMoyasar(db, c.t, c.params.id));
}, { idempotent: true });
