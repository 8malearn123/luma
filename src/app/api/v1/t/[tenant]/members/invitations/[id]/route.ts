import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { revokeInvitation } from '@/server/dashboard/members';

export const DELETE = api.tenant<{ id: string }>('team.manage', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  await tx(c.t, (db) => revokeInvitation(db, c.t, c.params.id));
  return { ok: true };
});
