import { z } from 'zod';
import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { transitionPlan } from '@/server/marketing/plans';

export const POST = api.tenant<{ id: string }>(['marketing.manage', 'campaign.approve'], async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  const b = await c.json(z.object({ to: z.enum(['proposed', 'under_review', 'approved', 'in_progress', 'completed', 'deferred', 'rejected']) }));
  await tx(c.t, (db) => transitionPlan(db, c.t, c.params.id, b.to));
  return { ok: true };
});
