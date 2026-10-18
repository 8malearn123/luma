import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { requestPlatformReview } from '@/server/policy/service';

export const POST = api.tenant<{ id: string }>(['incidents.submit', 'incidents.review'], async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  await tx(c.t, (db) => requestPlatformReview(db, c.t, c.params.id));
  return { ok: true };
});
