import { z } from 'zod';
import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { updateResource } from '@/server/services/catalog';

export const PATCH = api.tenant<{ id: string }>('catalog.manage', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  const b = await c.json(z.object({ name: z.string().trim().min(1).max(80).optional(), status: z.enum(['active', 'archived']).optional() }));
  await tx(c.t, (db) => updateResource(db, c.t, c.params.id, b));
  return { ok: true };
});
