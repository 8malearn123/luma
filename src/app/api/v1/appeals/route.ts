import { api } from '@/server/http/handler';
import { appealInput, customerPolicyView, submitAppeal } from '@/server/policy/service';

/** The signed-in customer's own decisions/incidents (explanations only) and appeals. */
export const GET = api.user(async (c) => customerPolicyView(c.user.userId));
export const POST = api.user(async (c) => submitAppeal(c.user.userId, await c.json(appealInput)), { idempotent: true, rateLimit: [10, 3600] });
