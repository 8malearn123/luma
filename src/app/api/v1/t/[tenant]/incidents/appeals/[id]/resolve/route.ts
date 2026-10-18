import { z } from 'zod';
import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { resolveAppealAsTenant } from '@/server/policy/service';

export const POST = api.tenant<{ id: string }>('incidents.review', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  const b = await c.json(z.object({ outcome: z.enum(['upheld', 'overturned']), note: z.string().trim().min(5).max(1000) }));
  await resolveAppealAsTenant(c.t, c.params.id, b.outcome, b.note);
  return { ok: true };
});
