import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { upsertPackage } from '@/server/services/catalog';
import { packageInput } from '@/lib/validation/catalog';

export const PUT = api.tenant<{ id: string }>('catalog.manage', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  const body = await c.json(packageInput);
  return tx(c.t, (db) => upsertPackage(db, c.t, body, c.params.id));
});
