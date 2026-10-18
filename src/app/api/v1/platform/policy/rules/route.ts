import { api } from '@/server/http/handler';
import { listRules, ruleInput, upsertRule } from '@/server/policy/service';

export const GET = api.platform('platform.policy.review', async (c) => ({ items: await listRules(c.p) }));
export const POST = api.platform('platform.policy.review', async (c) => upsertRule(c.p, await c.json(ruleInput)));
