import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { archiveBranch, branchInput, upsertBranch } from '@/server/dashboard/settings';

export const PATCH = api.tenant<{ id: string }>('tenant.settings.manage', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  const b = await c.json(branchInput);
  return tx(c.t, (db) => upsertBranch(db, c.t, b, c.params.id));
});
export const DELETE = api.tenant<{ id: string }>('tenant.settings.manage', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  await tx(c.t, (db) => archiveBranch(db, c.t, c.params.id));
  return { ok: true };
});
