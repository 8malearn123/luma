import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { setTenantStatus, statusChangeInput } from '@/server/platform/service';

export const POST = api.platform<{ id: string }>('platform.tenants.manage', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  return setTenantStatus(c.p, c.params.id, await c.json(statusChangeInput));
});
