import { z } from 'zod';
import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { decideStaffRequest } from '@/server/services/team';

export const POST = api.tenant<{ id: string }>(['hr.manage', 'hr.self'], async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  const b = await c.json(z.object({ decision: z.enum(['approved', 'rejected', 'cancelled']), note: z.string().max(500).optional() }));
  await tx(c.t, (db) => decideStaffRequest(db, c.t, c.params.id, b.decision, b.note));
  return { ok: true };
});
