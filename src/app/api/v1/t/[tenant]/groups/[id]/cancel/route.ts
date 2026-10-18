import { z } from 'zod';
import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { cancelGroupSession } from '@/server/services/groups';

export const POST = api.tenant<{ id: string }>('schedule.manage', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  const b = await c.json(z.object({ reason: z.string().trim().min(3).max(300) }));
  await tx(c.t, (db) => cancelGroupSession(db, c.t, c.params.id, b.reason));
  return { ok: true };
});
