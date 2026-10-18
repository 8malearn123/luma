import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { cancelEntry } from '@/server/services/waitlist';
import { withStorefront } from '@/server/services/growth-public';

export const DELETE = api.user<{ slug: string; id: string }>(async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  await withStorefront(c.params.slug, c.user.userId, (tx) => cancelEntry(tx, c.user.userId, c.params.id));
  return { ok: true };
});
