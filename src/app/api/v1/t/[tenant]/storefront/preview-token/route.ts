import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { createPreviewToken, revokePreviewTokens } from '@/server/storefront/publish';

export const POST = api.tenant('storefront.edit', async (c) => {
  const b = await c.json(z.object({ hours: z.number().int().min(1).max(168).default(24) }));
  return tx(c.t, (db) => createPreviewToken(db, c.t, b.hours));
}, { rateLimit: [30, 3600] });

export const DELETE = api.tenant('storefront.edit', async (c) => {
  await tx(c.t, (db) => revokePreviewTokens(db, c.t));
  return { ok: true };
});
