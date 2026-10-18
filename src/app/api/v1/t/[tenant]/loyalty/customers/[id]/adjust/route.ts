import { z } from 'zod';
import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { adjustPoints } from '@/server/services/loyalty';
import { requireGrowthFeature } from '@/server/services/growth';

export const POST = api.tenant<{ id: string }>(
  'loyalty.manage',
  async (c) => {
    if (!uuid.safeParse(c.params.id).success) throw notFound();
    const b = await c.json(z.object({ points: z.number().int().min(-100000).max(100000), reason: z.string().trim().min(3).max(200) }));
    await tx(c.t, async (db) => {
      await requireGrowthFeature(db, c.t, 'loyalty.enabled');
      await adjustPoints(db, c.t, c.params.id, b.points, b.reason);
    });
    return { ok: true };
  },
  { idempotent: true },
);
