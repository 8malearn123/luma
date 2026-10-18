import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { addOverride, listOverrides } from '@/server/services/team';
import { overrideInput } from '@/lib/validation/team';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const GET = api.tenant(['schedule.manage', 'hr.manage'], async (c) => {
  const q = c.query(z.object({ branchId: z.string().uuid(), from: date, to: date }));
  return { items: await tx(c.t, (db) => listOverrides(db, q.branchId, q.from, q.to)) };
});

export const POST = api.tenant('schedule.manage', async (c) => {
  const body = await c.json(overrideInput);
  return tx(c.t, (db) => addOverride(db, c.t, body));
}, { idempotent: true });
