import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { listZones, upsertZone, zoneInput } from '@/server/commerce/delivery';

export const GET = api.tenant(['tenant.settings.manage', 'orders.manage'], async (c) => ({ items: await tx(c.t, (db) => listZones(db)) }));

export const POST = api.tenant('tenant.settings.manage', async (c) => {
  const b = await c.json(zoneInput);
  return tx(c.t, (db) => upsertZone(db, c.t, b));
}, { idempotent: true });
