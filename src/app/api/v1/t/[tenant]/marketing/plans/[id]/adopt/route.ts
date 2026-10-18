import { z } from 'zod';
import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { adoptVersion } from '@/server/marketing/plans';

export const POST = api.tenant<{ id: string }>('campaign.approve', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  const b = await c.json(z.object({ version: z.number().int().min(1) }));
  await tx(c.t, (db) => adoptVersion(db, c.t, c.params.id, b.version));
  return { ok: true };
});
