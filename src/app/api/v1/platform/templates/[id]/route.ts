import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { templateInput, upsertTemplate } from '@/server/platform/service';

export const PUT = api.platform<{ id: string }>('platform.templates.manage', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  return upsertTemplate(c.p, await c.json(templateInput), c.params.id);
});
