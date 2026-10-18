import { z } from 'zod';
import { api } from '@/server/http/handler';
import { confirmHold } from '@/server/booking/service';
import { customerActor, publicTenant, runPublic } from '@/server/booking/customer';
import { notFound } from '@/server/errors';

/** Confirm a hold whose terms need no online payment (on-site). Online terms are confirmed only by a verified payment. */
export const POST = api.user<{ slug: string; id: string }>(
  async (c) => {
    if (!z.string().uuid().safeParse(c.params.id).success) throw notFound();
    const t = await publicTenant(c.params.slug);
    return runPublic(t, c.user.userId, (tx) => confirmHold(tx, customerActor(c.user.userId, t.id), c.params.id));
  },
  { idempotent: true },
);
