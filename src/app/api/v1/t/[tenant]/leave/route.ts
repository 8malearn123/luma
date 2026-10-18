import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { listLeave, requestLeave } from '@/server/services/team';
import { leaveInput } from '@/lib/validation/team';

export const GET = api.tenant(['hr.manage', 'hr.self'], async (c) => {
  const q = c.query(z.object({ status: z.enum(['pending', 'approved', 'rejected', 'cancelled']).optional(), staffId: z.string().uuid().optional() }));
  const own = !c.t.caps.has('hr.manage');
  const staffId = own ? (c.t.staffProfileId ?? '00000000-0000-0000-0000-000000000000') : q.staffId;
  return { items: await tx(c.t, (db) => listLeave(db, { staffId, status: q.status })) };
});

/** Self-service (hr.self, own profile only) or on behalf of staff (hr.manage). Returns conflicting bookings. */
export const POST = api.tenant(['hr.manage', 'hr.self'], async (c) => {
  const body = await c.json(leaveInput);
  return tx(c.t, (db) => requestLeave(db, c.t, body));
}, { idempotent: true });
