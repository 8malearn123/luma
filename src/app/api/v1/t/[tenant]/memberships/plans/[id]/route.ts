import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { archivePlan, planInput, upsertPlan } from '@/server/services/memberships';

export const PATCH = api.tenant<{ id: string }>('loyalty.manage', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  const b = await c.json(planInput);
  return tx(c.t, (db) => upsertPlan(db, c.t, b, c.params.id));
});

export const DELETE = api.tenant<{ id: string }>('loyalty.manage', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  await tx(c.t, (db) => archivePlan(db, c.t, c.params.id));
  return { ok: true };
});
