import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { decidePalette } from '@/server/services/onboarding';

/** Explicit owner decision on the logo-derived palette. */
export const POST = api.tenant('tenant.settings.manage', async (c) => {
  const b = await c.json(z.object({ accept: z.boolean(), expectedVersion: z.number().int() }));
  return { session: await tx(c.t, (db) => decidePalette(db, c.t, b.accept, b.expectedVersion)) };
});
