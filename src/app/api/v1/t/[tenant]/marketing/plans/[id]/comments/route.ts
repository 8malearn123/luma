import { z } from 'zod';
import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { addComment } from '@/server/marketing/plans';

export const POST = api.tenant<{ id: string }>('marketing.view', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  const b = await c.json(z.object({ body: z.string().trim().min(1).max(2000) }));
  await tx(c.t, (db) => addComment(db, c.t, c.params.id, b.body));
  return { ok: true };
});
