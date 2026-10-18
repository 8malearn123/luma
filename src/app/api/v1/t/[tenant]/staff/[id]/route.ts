import { z } from 'zod';
import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { getStaff, updateStaff } from '@/server/services/team';
import { staffInput } from '@/lib/validation/team';

export const GET = api.tenant<{ id: string }>(['staff.manage', 'schedule.manage', 'hr.manage'], async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  return { staff: await tx(c.t, (db) => getStaff(db, c.params.id)) };
});

export const PUT = api.tenant<{ id: string }>('staff.manage', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  const { expectedVersion, ...input } = await c.json(staffInput.extend({ expectedVersion: z.number().int().min(1) }));
  return tx(c.t, (db) => updateStaff(db, c.t, c.params.id, input, expectedVersion));
});
