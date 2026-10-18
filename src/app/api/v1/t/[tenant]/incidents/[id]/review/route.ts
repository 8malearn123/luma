import { z } from 'zod';
import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { reviewIncident } from '@/server/policy/service';

export const POST = api.tenant<{ id: string }>('incidents.review', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  const b = await c.json(z.object({ to: z.enum(['under_review', 'confirmed', 'rejected', 'corrected']), note: z.string().trim().min(5).max(1000) }));
  await tx(c.t, (db) => reviewIncident(db, c.t, c.params.id, b.to, b.note));
  return { ok: true };
});
