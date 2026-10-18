import { api } from '@/server/http/handler';
import { platformReviewQueue } from '@/server/policy/service';

export const GET = api.platform('platform.policy.review', async (c) => ({ items: await platformReviewQueue(c.p) }));
