import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { createStaff, listStaff } from '@/server/services/team';
import { staffInput } from '@/lib/validation/team';

export const GET = api.tenant(['staff.manage', 'schedule.manage', 'hr.manage', 'bookings.manage'], async (c) => {
  const q = c.query(z.object({ archived: z.enum(['0', '1']).default('0') }));
  return { items: await tx(c.t, (db) => listStaff(db, { includeArchived: q.archived === '1' })) };
});

export const POST = api.tenant('staff.manage', async (c) => {
  const body = await c.json(staffInput);
  return tx(c.t, (db) => createStaff(db, c.t, body));
}, { idempotent: true });
