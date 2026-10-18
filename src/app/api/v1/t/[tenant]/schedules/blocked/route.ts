import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { addBlockedTime, listBlocked } from '@/server/services/team';
import { blockedTimeInput } from '@/lib/validation/team';

export const GET = api.tenant(['schedule.manage', 'hr.manage'], async (c) => {
  const q = c.query(z.object({ staffId: z.string().uuid().optional(), from: z.string().datetime({ offset: true }), to: z.string().datetime({ offset: true }) }));
  return { items: await tx(c.t, (db) => listBlocked(db, q.staffId ?? null, new Date(q.from), new Date(q.to))) };
});

export const POST = api.tenant('schedule.manage', async (c) => {
  const body = await c.json(blockedTimeInput);
  return tx(c.t, (db) => addBlockedTime(db, c.t, body));
}, { idempotent: true });
