import { api } from '@/server/http/handler';
import { createPlatformDecision, listPlatformDecisions, platformDecisionInput } from '@/server/policy/service';

export const GET = api.platform('platform.policy.review', async (c) => ({ items: await listPlatformDecisions(c.p) }));
export const POST = api.platform('platform.policy.review', async (c) => createPlatformDecision(c.p, await c.json(platformDecisionInput)), { idempotent: true });
