import { z } from 'zod';
import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { decideCustomization } from '@/server/marketing/customize';

export const POST = api.tenant<{ id: string }>('storefront.edit', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  const b = await c.json(z.object({ decision: z.enum(['accept', 'reject']) }));
  return tx(c.t, (db) => decideCustomization(db, c.t, c.params.id, b.decision));
});
