import type { Tx } from '../db';

/**
 * Store analytics — definitions (also shown in the UI):
 *  - Eligible event: not a bot, not internal (builder/preview/member).
 *  - Session: distinct pseudonymous session id among eligible *browsing* events
 *    (page_view, service_view, product_view, booking_start, checkout_start, search,
 *    availability_miss). Server-side conversion events do not create sessions.
 *  - Visitor: distinct pseudonymous visitor id (sessions without one are counted
 *    in "visitors unknown").
 *  - Conversion rate = eligible sessions containing ≥1 conversion
 *    (booking_confirmed or order_paid with that session) ÷ eligible sessions.
 *  - Bookings per session = confirmed bookings attributed to sessions ÷ sessions;
 *    it can exceed 1. Conversions without a session are reported as unattributed.
 *  - Sources: utm_source, else referrer host, else "direct/unknown".
 */
const BROWSING = ['page_view', 'service_view', 'product_view', 'booking_start', 'checkout_start', 'search', 'availability_miss'];

export interface StoreMetrics {
  period: { from: string; to: string };
  sessions: number;
  visitors: number;
  sessionsWithoutVisitor: number;
  convertingSessions: number;
  conversionRate: number | null;
  attributedBookings: number;
  bookingsPerSession: number | null;
  unattributedConversions: number;
  sources: { source: string; sessions: number }[];
  devices: { device: string; sessions: number }[];
  topServiceViews: { serviceId: string; name: string | null; views: number }[];
  topProductViews: { productId: string; name: string | null; views: number }[];
  excluded: { internal: number; bots: number };
  definitions: string;
}

export async function storeMetrics(tx: Tx, from: Date, to: Date): Promise<StoreMetrics> {
  const [s] = await tx<{ sessions: number; visitors: number; noVisitor: number }[]>`
    select count(distinct session_hash)::int as sessions, count(distinct visitor_hash)::int as visitors,
           count(distinct session_hash) filter (where visitor_hash is null)::int as no_visitor
    from analytics_events where at >= ${from} and at < ${to} and not is_bot and not is_internal and type = any(${BROWSING})`;
  const [c] = await tx<{ converting: number; bookings: number; unattributed: number }[]>`
    with sess as (select distinct session_hash from analytics_events
                  where at >= ${from} and at < ${to} and not is_bot and not is_internal and type = any(${BROWSING}))
    select
      (select count(distinct e.session_hash) from analytics_events e join sess using (session_hash)
        where e.at >= ${from} and e.at < ${to} and e.type in ('booking_confirmed','order_paid'))::int as converting,
      (select count(*) from analytics_events e join sess using (session_hash)
        where e.at >= ${from} and e.at < ${to} and e.type = 'booking_confirmed')::int as bookings,
      (select count(*) from analytics_events e where e.at >= ${from} and e.at < ${to} and e.type in ('booking_confirmed','order_paid')
        and not exists (select 1 from sess where sess.session_hash = e.session_hash))::int as unattributed`;
  const sources = await tx<{ source: string; sessions: number }[]>`
    select coalesce(utm_source, referrer_host, 'direct/unknown') as source, count(distinct session_hash)::int as sessions
    from analytics_events where at >= ${from} and at < ${to} and not is_bot and not is_internal and type = any(${BROWSING})
    group by 1 order by 2 desc limit 10`;
  const devices = await tx<{ device: string; sessions: number }[]>`
    select device, count(distinct session_hash)::int as sessions from analytics_events
    where at >= ${from} and at < ${to} and not is_bot and not is_internal and type = any(${BROWSING}) group by 1 order by 2 desc`;
  const svc = await tx<{ serviceId: string; name: string | null; views: number }[]>`
    select e.entity_id as service_id, s.name, count(*)::int as views from analytics_events e left join services s on s.id = e.entity_id
    where e.at >= ${from} and e.at < ${to} and not e.is_bot and not e.is_internal and e.type = 'service_view' and e.entity_id is not null
    group by 1, 2 order by 3 desc limit 10`;
  const prod = await tx<{ productId: string; name: string | null; views: number }[]>`
    select e.entity_id as product_id, p.name, count(*)::int as views from analytics_events e left join products p on p.id = e.entity_id
    where e.at >= ${from} and e.at < ${to} and not e.is_bot and not e.is_internal and e.type = 'product_view' and e.entity_id is not null
    group by 1, 2 order by 3 desc limit 10`;
  const [ex] = await tx<{ internal: number; bots: number }[]>`
    select count(*) filter (where is_internal)::int as internal, count(*) filter (where is_bot)::int as bots
    from analytics_events where at >= ${from} and at < ${to}`;
  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    sessions: s.sessions,
    visitors: s.visitors,
    sessionsWithoutVisitor: s.noVisitor,
    convertingSessions: c.converting,
    conversionRate: s.sessions > 0 ? c.converting / s.sessions : null,
    attributedBookings: c.bookings,
    bookingsPerSession: s.sessions > 0 ? c.bookings / s.sessions : null,
    unattributedConversions: c.unattributed,
    sources,
    devices,
    topServiceViews: svc,
    topProductViews: prod,
    excluded: ex,
    definitions: 'analytics.definitions',
  };
}

/**
 * Demand signals per service, kept separate (a view is not a booking):
 * views, booking starts, confirmed/completed bookings, cancellations, waitlist
 * entries and "no availability found" events.
 */
export async function serviceDemand(tx: Tx, from: Date, to: Date) {
  return tx<{
    serviceId: string; name: string; priceMinor: number; materialCostMinor: number | null; views: number; starts: number;
    confirmed: number; completed: number; cancelled: number; noShows: number; waitlist: number; availabilityMisses: number;
    avgRating: number | null; reviewCount: number;
  }[]>`
    select s.id as service_id, s.name, s.price_minor, s.material_cost_minor,
      (select count(*) from analytics_events e where e.entity_id = s.id and e.type = 'service_view' and not e.is_bot and not e.is_internal and e.at >= ${from} and e.at < ${to})::int as views,
      (select count(*) from analytics_events e where e.entity_id = s.id and e.type = 'booking_start' and not e.is_bot and not e.is_internal and e.at >= ${from} and e.at < ${to})::int as starts,
      (select count(*) from booking_items i join bookings b on b.id = i.booking_id where i.service_id = s.id and i.status = 'active' and b.status in ('confirmed','checked_in','in_service','completed') and b.starts_at >= ${from} and b.starts_at < ${to})::int as confirmed,
      (select count(*) from booking_items i join bookings b on b.id = i.booking_id where i.service_id = s.id and i.status = 'active' and b.status = 'completed' and b.starts_at >= ${from} and b.starts_at < ${to})::int as completed,
      (select count(*) from booking_items i join bookings b on b.id = i.booking_id where i.service_id = s.id and b.status = 'cancelled' and b.starts_at >= ${from} and b.starts_at < ${to})::int as cancelled,
      (select count(*) from booking_items i join bookings b on b.id = i.booking_id where i.service_id = s.id and b.status = 'no_show' and b.starts_at >= ${from} and b.starts_at < ${to})::int as no_shows,
      (select count(*) from waitlist_entries w where w.service_id = s.id and w.created_at >= ${from} and w.created_at < ${to})::int as waitlist,
      (select count(*) from analytics_events e where e.entity_id = s.id and e.type = 'availability_miss' and not e.is_bot and not e.is_internal and e.at >= ${from} and e.at < ${to})::int as availability_misses,
      (select avg(r.rating)::float from reviews r join booking_items i on i.booking_id = r.booking_id where i.service_id = s.id and r.status = 'published') as avg_rating,
      (select count(distinct r.id) from reviews r join booking_items i on i.booking_id = r.booking_id where i.service_id = s.id and r.status = 'published')::int as review_count
    from services s where s.status = 'active' order by s.sort, s.name`;
}
