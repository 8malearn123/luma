import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { ruleInput, upsertRule } from '@/server/policy/service';

export const PUT = api.platform<{ id: string }>('platform.policy.review', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  return upsertRule(c.p, await c.json(ruleInput), c.params.id);
});
