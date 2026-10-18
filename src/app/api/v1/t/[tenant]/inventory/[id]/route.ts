import { z } from 'zod';
import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { updateItem } from '@/server/commerce/inventory';

export const PATCH = api.tenant<{ id: string }>('inventory.manage', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  const b = await c.json(z.object({ name: z.string().trim().min(1).max(160).optional(), lowStockThreshold: z.number().min(0).nullable().optional(), unitCostMinor: z.number().int().min(0).nullable().optional(), status: z.enum(['active', 'archived']).optional() }));
  if (!c.t.caps.has('finance.view')) delete b.unitCostMinor;
  await tx(c.t, (db) => updateItem(db, c.t, c.params.id, b));
  return { ok: true };
});
