import { z } from 'zod';
import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { setCouponStatus } from '@/server/services/coupons';

export const PATCH = api.tenant<{ id: string }>('loyalty.manage', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  const b = await c.json(z.object({ status: z.enum(['active', 'paused', 'archived']) }));
  await tx(c.t, (db) => setCouponStatus(db, c.t, c.params.id, b.status));
  return { ok: true };
});
