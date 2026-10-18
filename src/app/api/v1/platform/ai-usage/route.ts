import { api } from '@/server/http/handler';
import { aiUsageOverview } from '@/server/platform/service';

export const GET = api.platform('platform.ai_usage.view', async (c) => aiUsageOverview(c.p));
