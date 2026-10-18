import { api } from '@/server/http/handler';
import { grantPlatformRole, listPlatformStaff, staffGrantInput } from '@/server/platform/service';

export const GET = api.platform('platform.users.manage', async (c) => ({ items: await listPlatformStaff(c.p) }));
export const POST = api.platform('platform.users.manage', async (c) => grantPlatformRole(c.p, await c.json(staffGrantInput)));
