import { api, uuid } from '@/server/http/handler';
import { revokeSession } from '@/server/auth/service';
import { sql } from '@/server/db';
import { notFound } from '@/server/errors';

export const DELETE = api.user<{ id: string }>(async (c) => {
  const id = uuid.safeParse(c.params.id);
  if (!id.success) throw notFound();
  const [s] = await sql()`select id from sessions where id = ${id.data} and user_id = ${c.user.userId}`;
  if (!s) throw notFound();
  await revokeSession(id.data, 'user_revoked');
  return { ok: true };
});
