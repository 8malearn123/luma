import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { setRules } from '@/server/services/loyalty';
import { requireGrowthFeature } from '@/server/services/growth';

const body = z.object({
  enabled: z.boolean(),
  pointsPerSar: z.number().min(0).max(100),
  expiryDays: z.number().int().min(30).max(1095).nullable(),
  tiers: z.array(z.object({ name: z.string().trim().min(1).max(40), minPoints: z.number().int().min(0) })).max(6),
  reverseOnRefund: z.boolean(),
});

export const PUT = api.tenant('loyalty.manage', async (c) => {
  const b = await c.json(body);
  await tx(c.t, async (db) => {
    await requireGrowthFeature(db, c.t, 'loyalty.enabled');
    await setRules(db, c.t, b);
  });
  return { ok: true };
});
