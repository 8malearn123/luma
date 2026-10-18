import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { getRecipe, recipeInput, setRecipe } from '@/server/commerce/inventory';

export const GET = api.tenant<{ serviceId: string }>('inventory.manage', async (c) => {
  if (!uuid.safeParse(c.params.serviceId).success) throw notFound();
  return { lines: await tx(c.t, (db) => getRecipe(db, c.params.serviceId)) };
});
export const PUT = api.tenant<{ serviceId: string }>('inventory.manage', async (c) => {
  const b = await c.json(recipeInput.omit({ serviceId: true }));
  if (!uuid.safeParse(c.params.serviceId).success) throw notFound();
  await tx(c.t, (db) => setRecipe(db, c.t, { ...b, serviceId: c.params.serviceId }));
  return { ok: true };
});
