import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { archiveZone, upsertZone, zoneInput } from '@/server/commerce/delivery';

export const PUT = api.tenant<{ id: string }>('tenant.settings.manage', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound('delivery_zone');
  const b = await c.json(zoneInput);
  return tx(c.t, (db) => upsertZone(db, c.t, b, c.params.id));
});

export const DELETE = api.tenant<{ id: string }>('tenant.settings.manage', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound('delivery_zone');
  await tx(c.t, (db) => archiveZone(db, c.t, c.params.id));
  return { ok: true };
});
