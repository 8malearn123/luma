import { z } from 'zod';
import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { setServiceStatus } from '@/server/services/catalog';

/** inactive = no new bookings; archived = retired (history kept). Visibility is a separate flag. */
export const POST = api.tenant<{ id: string }>('catalog.manage', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  const { status } = await c.json(z.object({ status: z.enum(['active', 'inactive', 'archived']) }));
  await tx(c.t, (db) => setServiceStatus(db, c.t, c.params.id, status));
  return { ok: true };
});
