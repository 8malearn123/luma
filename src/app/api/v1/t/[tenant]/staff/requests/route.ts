import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { createStaffRequest, listStaffRequests } from '@/server/services/team';

export const GET = api.tenant(['hr.manage', 'hr.self'], async (c) => {
  const own = !c.t.caps.has('hr.manage');
  return { items: await tx(c.t, (db) => listStaffRequests(db, own ? (c.t.staffProfileId ?? '00000000-0000-0000-0000-000000000000') : null)) };
});

export const POST = api.tenant('hr.self', async (c) => {
  const b = await c.json(z.object({ kind: z.enum(['schedule_change', 'advance', 'equipment', 'other']), details: z.string().trim().min(3).max(2000) }));
  return tx(c.t, (db) => createStaffRequest(db, c.t, b));
}, { idempotent: true });
