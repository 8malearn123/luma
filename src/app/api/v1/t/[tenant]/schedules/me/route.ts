import { z } from 'zod';
import { api } from '@/server/http/handler';
import { forbidden } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { ownSchedule } from '@/server/services/team';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const GET = api.tenant('schedule.self', async (c) => {
  if (!c.t.staffProfileId) throw forbidden();
  const q = c.query(z.object({ from: date, to: date }));
  return tx(c.t, (db) => ownSchedule(db, c.t.staffProfileId!, q.from, q.to));
});
