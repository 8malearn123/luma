import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { createGroupSession, listSessions, sessionInput } from '@/server/services/groups';
import { requireGrowthFeature } from '@/server/services/growth';

export const GET = api.tenant(['schedule.manage', 'bookings.manage', 'loyalty.manage'], async (c) =>
  tx(c.t, async (db) => {
    await requireGrowthFeature(db, c.t, 'group_sessions.enabled');
    const services = await db`select id, name, group_capacity, price_minor, duration_min from services where group_capacity is not null and status = 'active' order by name`;
    const staff = await db`select ss.service_id, sp.id, sp.display_name from service_staff ss join staff_profiles sp on sp.id = ss.staff_id where sp.status = 'active'`;
    const branches = await db`select id, name from branches where status = 'active' order by is_primary desc, name`;
    return { sessions: await listSessions(db), services, staff, branches };
  }),
);

export const POST = api.tenant(['schedule.manage', 'catalog.manage'], async (c) => {
  const b = await c.json(sessionInput);
  return tx(c.t, (db) => createGroupSession(db, c.t, b));
});
