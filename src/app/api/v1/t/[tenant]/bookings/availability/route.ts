import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { availabilityQuery, findAvailability } from '@/server/booking/availability';

/** Internal-mode availability (hidden services allowed per policy). Read-only; POST only because the query is structured. */
export const POST = api.tenant('bookings.manage', async (c) => {
  const q = await c.json(availabilityQuery);
  const r = await tx(c.t, (db) => findAvailability(db, c.t.tenant.id, q, 'internal'));
  return { timezone: r.timezone, days: r.days, reason: r.reason, items: r.engine.items.map((i) => ({ serviceId: i.serviceId, name: i.serviceName, candidates: i.candidates.map((x) => ({ staffId: x.staffId, staffName: x.staffName, priceMinor: x.priceMinor, durationMin: x.durationMin })) })) };
}, { rateLimit: [240, 60] });
