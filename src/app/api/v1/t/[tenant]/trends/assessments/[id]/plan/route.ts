import { z } from 'zod';
import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { addAssessmentToPlan } from '@/server/marketing/trends';

export const POST = api.tenant<{ id: string }>('marketing.manage', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  const b = await c.json(z.object({ planId: z.string().uuid() }));
  return tx(c.t, (db) => addAssessmentToPlan(db, c.t, c.params.id, b.planId));
});
