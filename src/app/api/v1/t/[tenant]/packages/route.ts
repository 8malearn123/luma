import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { listPackages, upsertPackage } from '@/server/services/catalog';
import { packageInput } from '@/lib/validation/catalog';

export const GET = api.tenant(['catalog.manage', 'bookings.manage'], async (c) => ({ items: await tx(c.t, (db) => listPackages(db)) }));

export const POST = api.tenant('catalog.manage', async (c) => {
  const body = await c.json(packageInput);
  return tx(c.t, (db) => upsertPackage(db, c.t, body));
}, { idempotent: true });
