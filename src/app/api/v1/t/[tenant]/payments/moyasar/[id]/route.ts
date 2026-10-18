import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { removeMoyasarDraft } from '@/server/payments/connect';

export const DELETE = api.tenant<{ id: string }>('payments.configure', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound('payment_account');
  await tx(c.t, (db) => removeMoyasarDraft(db, c.t, c.params.id));
  return { ok: true };
});
