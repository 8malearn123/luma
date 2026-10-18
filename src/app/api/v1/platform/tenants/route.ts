import { api } from '@/server/http/handler';
import { listTenants, tenantListQuery } from '@/server/platform/service';

export const GET = api.platform('platform.tenants.view', async (c) => listTenants(c.p, c.query(tenantListQuery)));
