import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { planInput, upsertPlan } from '@/server/platform/service';

export const PUT = api.platform<{ id: string }>('platform.plans.manage', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  return upsertPlan(c.p, await c.json(planInput), c.params.id);
});
