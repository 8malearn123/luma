import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { giftCardHistory } from '@/server/services/giftcards';

export const GET = api.tenant<{ id: string }>('loyalty.manage', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  return tx(c.t, (db) => giftCardHistory(db, c.params.id));
});
