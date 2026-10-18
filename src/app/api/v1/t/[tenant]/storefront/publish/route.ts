import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { publishDraft } from '@/server/storefront/publish';

export const POST = api.tenant('storefront.publish', async (c) => {
  const b = await c.json(z.object({ expectedVersion: z.number().int(), note: z.string().max(200).optional() }));
  return tx(c.t, (db) => publishDraft(db, c.t, b.expectedVersion, b.note));
}, { idempotent: true });
