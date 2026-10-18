import { z } from 'zod';
import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { voidGiftCard } from '@/server/services/giftcards';

export const POST = api.tenant<{ id: string }>('loyalty.manage', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  const b = await c.json(z.object({ reason: z.string().trim().min(3).max(200) }));
  await tx(c.t, (db) => voidGiftCard(db, c.t, c.params.id, b.reason));
  return { ok: true };
});
