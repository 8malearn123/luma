import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { declineOffer } from '@/server/services/waitlist';
import { withStorefront } from '@/server/services/growth-public';

export const POST = api.user<{ slug: string; id: string }>(async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  await withStorefront(c.params.slug, c.user.userId, (tx) => declineOffer(tx, c.user.userId, c.params.id));
  return { ok: true };
});
