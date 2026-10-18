import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { lookupBalance } from '@/server/services/giftcards';

/** POST (not GET) so codes never land in URLs, logs or browser history. */
export const POST = api.tenant(['loyalty.manage', 'payments.collect'], async (c) => {
  const b = await c.json(z.object({ code: z.string().trim().min(16).max(24) }));
  return tx(c.t, (db) => lookupBalance(db, b.code, `${c.t.tenant.id}:${c.user.userId}`));
});
