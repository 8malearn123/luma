import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tenantDetail } from '@/server/platform/service';

export const GET = api.platform<{ id: string }>('platform.tenants.view', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  return tenantDetail(c.p, c.params.id);
});
