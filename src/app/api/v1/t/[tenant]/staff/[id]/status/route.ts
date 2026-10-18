import { z } from 'zod';
import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { setStaffStatus } from '@/server/services/team';

/** Deactivating/archiving keeps history; returns future bookings that need action (never auto-cancelled). */
export const POST = api.tenant<{ id: string }>('staff.manage', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  const { status } = await c.json(z.object({ status: z.enum(['active', 'inactive', 'archived']) }));
  return tx(c.t, (db) => setStaffStatus(db, c.t, c.params.id, status));
});
