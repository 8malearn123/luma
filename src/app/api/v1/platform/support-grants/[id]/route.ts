import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { revokeSupportGrant } from '@/server/platform/service';

export const DELETE = api.platform<{ id: string }>('platform.support.access', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  await revokeSupportGrant(c.p, c.params.id);
  return { ok: true };
});
