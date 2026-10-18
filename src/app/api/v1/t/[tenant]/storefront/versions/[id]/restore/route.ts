import { z } from 'zod';
import { api, uuid } from '@/server/http/handler';
import { AppError, notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { restoreVersion } from '@/server/storefront/publish';

/** Restore an old version into the draft; `republish: true` = rollback (needs storefront.publish). */
export const POST = api.tenant<{ id: string }>('storefront.edit', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  const b = await c.json(z.object({ expectedVersion: z.number().int(), republish: z.boolean().default(false) }));
  if (b.republish && !c.t.caps.has('storefront.publish')) throw new AppError('forbidden', 'errors.forbidden');
  return tx(c.t, (db) => restoreVersion(db, c.t, c.params.id, b.expectedVersion, b.republish));
}, { idempotent: true });
