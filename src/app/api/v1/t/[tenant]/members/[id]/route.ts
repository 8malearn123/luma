import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { memberPatch, updateMember } from '@/server/dashboard/members';

export const PATCH = api.tenant<{ id: string }>('team.manage', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  const b = await c.json(memberPatch);
  await tx(c.t, (db) => updateMember(db, c.t, c.params.id, b));
  return { ok: true };
});
