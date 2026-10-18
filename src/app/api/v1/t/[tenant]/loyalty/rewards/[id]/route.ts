import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { archiveReward, upsertReward } from '@/server/services/loyalty';
import { rewardBody } from '@/server/services/growth';

export const PATCH = api.tenant<{ id: string }>('loyalty.manage', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  const b = await c.json(rewardBody);
  return tx(c.t, (db) => upsertReward(db, c.t, b, c.params.id));
});

export const DELETE = api.tenant<{ id: string }>('loyalty.manage', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  await tx(c.t, (db) => archiveReward(db, c.t, c.params.id));
  return { ok: true };
});
