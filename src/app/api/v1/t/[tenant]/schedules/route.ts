import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { getWeeklyHours, setWeeklyHours } from '@/server/services/team';
import { weeklyHoursInput } from '@/lib/validation/team';

export const GET = api.tenant(['schedule.manage', 'staff.manage', 'hr.manage'], async (c) => {
  const q = c.query(z.object({ branchId: z.string().uuid(), staffId: z.string().uuid().optional() }));
  return tx(c.t, (db) => getWeeklyHours(db, q.branchId, q.staffId ?? null));
});

export const PUT = api.tenant('schedule.manage', async (c) => {
  const body = await c.json(weeklyHoursInput);
  await tx(c.t, (db) => setWeeklyHours(db, c.t, body));
  return { ok: true };
});
