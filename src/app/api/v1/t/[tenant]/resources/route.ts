import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { createResource, listResources } from '@/server/services/catalog';

export const GET = api.tenant(['catalog.manage', 'schedule.manage'], async (c) => tx(c.t, (db) => listResources(db)));

export const POST = api.tenant('catalog.manage', async (c) => {
  const b = await c.json(z.object({ name: z.string().trim().min(1).max(80), branchId: z.string().uuid(), resourceTypeId: z.string().uuid() }));
  return tx(c.t, (db) => createResource(db, c.t, b));
}, { idempotent: true });
