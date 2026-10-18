import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { cancelEntry } from '@/server/services/waitlist';

export const DELETE = api.tenant<{ id: string }>('waitlist.manage', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  await tx(c.t, (db) => cancelEntry(db, c.t.tenant.id, null, c.params.id, c.t));
  return { ok: true };
});
