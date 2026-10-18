import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { listNotifications, markRead } from '@/server/services/notifications';

export const GET = api.tenant(null, async (c) => {
  const q = c.query(z.object({ before: z.string().datetime({ offset: true }).optional() }));
  return tx(c.t, (db) => listNotifications(db, c.user.userId, { before: q.before ? new Date(q.before) : undefined }));
});

export const POST = api.tenant(null, async (c) => {
  const b = await c.json(z.object({ ids: z.union([z.array(z.string().uuid()).max(100), z.literal('all')]) }));
  await tx(c.t, (db) => markRead(db, c.user.userId, b.ids));
  return { ok: true };
});
