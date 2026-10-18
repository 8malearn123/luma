import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { reorderServices } from '@/server/services/catalog';

export const POST = api.tenant('catalog.manage', async (c) => {
  const { ids } = await c.json(z.object({ ids: z.array(z.string().uuid()).max(500) }));
  await tx(c.t, (db) => reorderServices(db, ids));
  return { ok: true };
});
