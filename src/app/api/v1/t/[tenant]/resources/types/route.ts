import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { createResourceType } from '@/server/services/catalog';

export const POST = api.tenant('catalog.manage', async (c) => {
  const { name } = await c.json(z.object({ name: z.string().trim().min(1).max(80) }));
  return tx(c.t, (db) => createResourceType(db, c.t, name));
}, { idempotent: true });
