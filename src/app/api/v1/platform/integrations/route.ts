import { api } from '@/server/http/handler';
import { integrationsStatus } from '@/server/platform/service';

export const GET = api.platform('platform.integrations.view', async (c) => integrationsStatus(c.p));
