import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { movementInput, movements, recordMovement } from '@/server/commerce/inventory';

export const GET = api.tenant<{ id: string }>('inventory.manage', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  return { items: await tx(c.t, (db) => movements(db, c.params.id)) };
});
export const POST = api.tenant<{ id: string }>('inventory.manage', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  const b = await c.json(movementInput);
  if (!c.t.caps.has('finance.view')) b.unitCostMinor = null;
  return tx(c.t, (db) => recordMovement(db, c.t, c.params.id, b));
}, { idempotent: true });
