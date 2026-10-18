import { z } from 'zod';
import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { endCommissionRule } from '@/server/services/team';

/** Rules are never edited in place (earned entries snapshot them); they are ended and replaced. */
export const POST = api.tenant<{ id: string }>(['finance.view', 'staff.manage'], async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  const b = await c.json(z.object({ effectiveTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }));
  await tx(c.t, (db) => endCommissionRule(db, c.t, c.params.id, b.effectiveTo));
  return { ok: true };
});
