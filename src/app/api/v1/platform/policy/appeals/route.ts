import { api } from '@/server/http/handler';
import { listPlatformAppeals } from '@/server/policy/service';

export const GET = api.platform('platform.policy.review', async (c) => ({ items: await listPlatformAppeals(c.p) }));
