import { api } from '@/server/http/handler';
import { createSupportGrant, listSupportGrants, supportGrantInput } from '@/server/platform/service';

export const GET = api.platform('platform.support.access', async (c) => ({ items: await listSupportGrants(c.p) }));
export const POST = api.platform('platform.support.access', async (c) => createSupportGrant(c.p, await c.json(supportGrantInput)), { idempotent: true });
