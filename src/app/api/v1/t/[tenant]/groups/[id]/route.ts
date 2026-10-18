import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { sessionParticipants } from '@/server/services/groups';

export const GET = api.tenant<{ id: string }>(['schedule.manage', 'bookings.manage'], async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  return tx(c.t, async (db) => ({ participants: await sessionParticipants(db, c.params.id) }));
});
