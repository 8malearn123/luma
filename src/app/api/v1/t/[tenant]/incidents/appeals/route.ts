import { api } from '@/server/http/handler';
import { listTenantAppeals } from '@/server/policy/service';

export const GET = api.tenant('incidents.review', async (c) => ({ items: await listTenantAppeals(c.t) }));
