import { z } from 'zod';
import { api } from '@/server/http/handler';
import { forbidden } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { clock, correctAttendance, listAttendance } from '@/server/services/team';

export const GET = api.tenant(['hr.manage', 'hr.self'], async (c) => {
  const q = c.query(z.object({ staffId: z.string().uuid().optional(), from: z.string().datetime({ offset: true }), to: z.string().datetime({ offset: true }) }));
  const manager = c.t.caps.has('hr.manage');
  const staffId = manager ? (q.staffId ?? null) : c.t.staffProfileId;
  if (!manager && !staffId) throw forbidden();
  return { items: await tx(c.t, (db) => listAttendance(db, { staffId, from: new Date(q.from), to: new Date(q.to) })) };
});

/** {kind} = own clock in/out; {staffId, kind, at, note} = manager correction (append-only). */
export const POST = api.tenant(['hr.manage', 'hr.self'], async (c) => {
  const b = await c.json(
    z.union([
      z.object({ staffId: z.string().uuid(), kind: z.enum(['clock_in', 'clock_out']), at: z.string().datetime({ offset: true }), note: z.string().trim().min(3).max(300), correctsId: z.string().uuid().nullable().optional() }),
      z.object({ kind: z.enum(['clock_in', 'clock_out']) }),
    ]),
  );
  if ('staffId' in b) return tx(c.t, (db) => correctAttendance(db, c.t, b));
  return tx(c.t, (db) => clock(db, c.t, b.kind));
}, { idempotent: true });
