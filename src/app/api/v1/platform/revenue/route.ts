import { api } from '@/server/http/handler';
import { revenueOverview } from '@/server/platform/service';

export const GET = api.platform('platform.revenue.view', async (c) => revenueOverview(c.p));
