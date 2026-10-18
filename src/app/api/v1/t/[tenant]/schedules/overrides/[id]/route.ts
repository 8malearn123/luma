import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { removeOverride } from '@/server/services/team';

export const DELETE = api.tenant<{ id: string }>('schedule.manage', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  await tx(c.t, (db) => removeOverride(db, c.t, c.params.id));
  return { ok: true };
});
