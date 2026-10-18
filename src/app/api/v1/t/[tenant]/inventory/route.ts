import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { createItem, itemInput, listItems } from '@/server/commerce/inventory';

export const GET = api.tenant('inventory.manage', async (c) => {
  const q = c.query(z.object({ branchId: z.string().uuid().optional(), usage: z.enum(['retail', 'material', 'both']).optional(), low: z.enum(['1']).optional() }));
  return { items: await tx(c.t, (db) => listItems(db, { branchId: q.branchId, usage: q.usage, lowOnly: q.low === '1', showCost: c.t.caps.has('finance.view') })) };
});
export const POST = api.tenant('inventory.manage', async (c) => {
  const b = await c.json(itemInput);
  if (!c.t.caps.has('finance.view')) b.unitCostMinor = null;
  return tx(c.t, (db) => createItem(db, c.t, b));
}, { idempotent: true });
