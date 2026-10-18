import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { commerceSettings, commerceSettingsInput, listZones, updateCommerceSettings } from '@/server/commerce/delivery';

export const GET = api.tenant(['tenant.settings.manage', 'orders.manage'], async (c) =>
  tx(c.t, async (db) => ({ settings: await commerceSettings(db), zones: await listZones(db), branches: await db`select id, name, city from branches where status = 'active' order by is_primary desc, name` })),
);

export const PUT = api.tenant('tenant.settings.manage', async (c) => {
  const b = await c.json(commerceSettingsInput);
  await tx(c.t, (db) => updateCommerceSettings(db, c.t, b));
  return { ok: true };
});
