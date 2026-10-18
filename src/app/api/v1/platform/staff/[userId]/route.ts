import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { revokePlatformRole } from '@/server/platform/service';

export const DELETE = api.platform<{ userId: string }>('platform.users.manage', async (c) => {
  if (!uuid.safeParse(c.params.userId).success) throw notFound();
  await revokePlatformRole(c.p, c.params.userId);
  return { ok: true };
});
