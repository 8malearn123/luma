import { api } from '@/server/http/handler';
import { listPlans, planInput, upsertPlan } from '@/server/platform/service';

export const GET = api.platform('platform.plans.manage', async () => ({ items: await listPlans(true) }));
export const POST = api.platform('platform.plans.manage', async (c) => upsertPlan(c.p, await c.json(planInput)));
