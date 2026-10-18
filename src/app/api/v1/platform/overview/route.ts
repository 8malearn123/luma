import { api } from '@/server/http/handler';
import { platformOverview } from '@/server/platform/service';

export const GET = api.platform('platform.tenants.view', async (c) => platformOverview(c.p));
