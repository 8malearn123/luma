import { api } from '@/server/http/handler';
import { listSessions, revokeAllSessions } from '@/server/auth/service';

export const GET = api.user(async (c) => {
  const items = await listSessions(c.user.userId);
  return { items: items.map((s) => ({ ...s, current: s.id === c.user.sessionId })) };
});

/** Sign out every other device. */
export const DELETE = api.user(async (c) => {
  await revokeAllSessions(c.user.userId, 'revoke_others', c.user.sessionId);
  return { ok: true };
});
