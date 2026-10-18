import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { reorderCategories } from '@/server/services/catalog';

export const POST = api.tenant('catalog.manage', async (c) => {
  const { ids } = await c.json(z.object({ ids: z.array(z.string().uuid()).max(200) }));
  await tx(c.t, (db) => reorderCategories(db, ids));
  return { ok: true };
});
