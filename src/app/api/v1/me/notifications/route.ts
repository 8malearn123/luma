import { z } from 'zod';
import { api } from '@/server/http/handler';
import { withUser } from '@/server/db';
import { listNotifications, markRead } from '@/server/services/notifications';

export const GET = api.user(async (c) => {
  const q = c.query(z.object({ before: z.string().datetime({ offset: true }).optional(), limit: z.coerce.number().int().min(1).max(50).default(20) }));
  return withUser(c.user.userId, (tx) => listNotifications(tx, c.user.userId, { before: q.before ? new Date(q.before) : undefined, limit: q.limit }));
});

export const POST = api.user(async (c) => {
  const b = await c.json(z.object({ ids: z.union([z.literal('all'), z.array(z.string().uuid()).max(100)]) }));
  await withUser(c.user.userId, (tx) => markRead(tx, c.user.userId, b.ids));
  return { ok: true };
});
