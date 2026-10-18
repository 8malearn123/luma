import { createHash } from 'node:crypto';
import type { Tx } from '../db';
import { addDays, utcToWall, wallToUtc } from '@/lib/tz';
import { serviceDemand } from '../analytics/metrics';
import { computeOccupancy } from '../analytics/occupancy';

/**
 * Metric snapshot (spec §29 step 2): every number Loom may use, computed by
 * trusted queries for one tenant and period, with data_as_of and a hash.
 * `index` is a flat key → number map used to validate any number a model
 * produces. Contains aggregates only — no customer names, phones or ids.
 */
export interface Snapshot {
  id?: string;
  tenantId: string;
  kind: 'marketing';
  period: { from: string; to: string; days: number };
  dataAsOf: string;
  business: { type: string; city: string | null; timezone: string; currency: string; locale: 'ar' | 'en'; branches: number; ageDays: number };
  history: { completedVisits90d: number; firstCompletedAt: string | null; reviews: number };
  services: {
    key: string;
    serviceId: string;
    name: string;
    category: string | null;
    priceMinor: number;
    durationMin: number;
    materialCostMinor: number | null;
    demand: { views: number; starts: number; confirmed: number; completed: number; cancelled: number; noShows: number; waitlist: number; availabilityMisses: number };
    rating: number | null;
    reviewCount: number;
    cadenceDays: number | null;
    overdueConsenting: number;
    repeatCustomers: number;
  }[];
  occupancy: { total: number | null; availableMin: number; bookedMin: number; byWeekday: { weekday: number; occupancy: number | null; freeMin: number }[] } | null;
  customers: { active90d: number; withMarketingConsent: number };
  costs: { servicesWithCost: number; servicesTotal: number; complete: boolean };
  loyaltyEnabled: boolean;
  preferences: { goals: string[]; monthlyBudgetMinor: number | null; maxDiscountBps: number; channels: string[]; tone: string | null; avoidTopics: string[]; photoResources: string | null };
  pastCampaigns: { channel: string; status: string; recipients: number; attributedBookings: number }[];
  index: Record<string, number>;
  hash: string;
}

const median = (a: number[]) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

export async function buildSnapshot(tx: Tx, tenantId: string, fromDate: string, days: number, now = new Date()): Promise<Snapshot> {
  const [t] = await tx<{ businessType: string; city: string | null; timezone: string; currency: string; defaultLocale: 'ar' | 'en'; createdAt: Date }[]>`
    select business_type, city, timezone, currency, default_locale, created_at from tenants where id = ${tenantId}`;
  const tz = t.timezone;
  const from = wallToUtc(fromDate, '00:00', tz);
  const to = wallToUtc(addDays(fromDate, days), '00:00', tz);
  const since90 = new Date(+now - 90 * 86400000);
  const [{ branches }] = await tx<{ branches: number }[]>`select count(*)::int as branches from branches where status = 'active'`;
  const [hist] = await tx<{ visits: number; first: Date | null; reviews: number }[]>`
    select (select count(*) from bookings where status = 'completed' and starts_at >= ${since90})::int as visits,
           (select min(starts_at) from bookings where status = 'completed') as first,
           (select count(*) from reviews where status = 'published')::int as reviews`;
  const demand = await serviceDemand(tx, from, to);
  const cats = await tx<{ id: string; category: string | null }[]>`select s.id, c.name as category from services s left join categories c on c.id = s.category_id`;
  const durations = await tx<{ id: string; durationMin: number }[]>`select id, duration_min from services`;

  // service-specific visit cadence: median days between consecutive completed visits of the same customer for that service
  const gaps = await tx<{ serviceId: string; gapDays: number }[]>`
    select service_id, extract(epoch from (starts_at - prev)) / 86400 as gap_days from (
      select i.service_id, b.starts_at, lag(b.starts_at) over (partition by i.service_id, b.tenant_customer_id order by b.starts_at) as prev
      from booking_items i join bookings b on b.id = i.booking_id where b.status = 'completed' and i.status = 'active') x
    where prev is not null`;
  const lastVisits = await tx<{ serviceId: string; tenantCustomerId: string; last: Date; consent: boolean }[]>`
    select i.service_id, b.tenant_customer_id, max(b.starts_at) as last,
      coalesce((select c.status = 'granted' from customer_consents c where c.tenant_customer_id = b.tenant_customer_id and c.purpose = 'marketing'
                order by c.recorded_at desc limit 1), false) as consent
    from booking_items i join bookings b on b.id = i.booking_id where b.status = 'completed' and i.status = 'active'
    group by i.service_id, b.tenant_customer_id`;

  const [branch] = await tx<{ id: string }[]>`select id from branches where status = 'active' order by is_primary desc limit 1`;
  const occ = branch ? await computeOccupancy(tx, branch.id, fromDate, days) : null;
  const [cust] = await tx<{ active: number; consenting: number }[]>`
    select (select count(distinct tenant_customer_id) from bookings where status = 'completed' and starts_at >= ${since90})::int as active,
           (select count(distinct tc.id) from tenant_customers tc where coalesce((select c.status = 'granted' from customer_consents c where c.tenant_customer_id = tc.id and c.purpose = 'marketing' order by c.recorded_at desc limit 1), false))::int as consenting`;
  const [prefs] = await tx<{ goals: string[]; monthlyBudgetMinor: number | null; maxDiscountBps: number; channels: string[]; tone: string | null; avoidTopics: string[]; photoResources: string | null }[]>`
    select goals, monthly_budget_minor, max_discount_bps, channels, tone, avoid_topics, photo_resources from marketing_preferences limit 1`;
  const [loy] = await tx<{ enabled: boolean }[]>`select enabled from loyalty_rules limit 1`;
  const past = await tx<{ channel: string; status: string; recipients: number; attributedBookings: number }[]>`
    select c.channel, c.status, (select count(*) from campaign_recipients r where r.campaign_id = c.id and r.arm = 'treatment')::int as recipients,
      (select count(*) from campaign_events e where e.campaign_id = c.id and e.kind = 'booking_attributed')::int as attributed_bookings
    from campaigns c where c.status in ('sent','completed') order by c.created_at desc limit 10`;

  const services = demand.map((d, i) => {
    const g = gaps.filter((x) => x.serviceId === d.serviceId).map((x) => Number(x.gapDays));
    const cadence = g.length >= 5 ? Math.round(median(g)!) : null;
    const lv = lastVisits.filter((x) => x.serviceId === d.serviceId);
    const overdue = cadence ? lv.filter((x) => x.consent && +now - +x.last > cadence * 1.5 * 86400000).length : 0;
    return {
      key: `svc_${i + 1}`,
      serviceId: d.serviceId,
      name: d.name,
      category: cats.find((c) => c.id === d.serviceId)?.category ?? null,
      priceMinor: d.priceMinor,
      durationMin: durations.find((x) => x.id === d.serviceId)?.durationMin ?? 0,
      materialCostMinor: d.materialCostMinor,
      demand: { views: d.views, starts: d.starts, confirmed: d.confirmed, completed: d.completed, cancelled: d.cancelled, noShows: d.noShows, waitlist: d.waitlist, availabilityMisses: d.availabilityMisses },
      rating: d.avgRating != null ? Math.round(d.avgRating * 100) / 100 : null,
      reviewCount: d.reviewCount,
      cadenceDays: cadence,
      overdueConsenting: overdue,
      repeatCustomers: new Set(gaps.filter((x) => x.serviceId === d.serviceId)).size,
    };
  });

  const occupancy = occ
    ? {
        total: occ.total.occupancy != null ? Math.round(occ.total.occupancy * 1000) / 1000 : null,
        availableMin: occ.total.availableMin,
        bookedMin: occ.total.bookedMin,
        byWeekday: occ.byWeekday.map((w) => ({ weekday: w.weekday, occupancy: w.availableMin ? Math.round((w.bookedMin / w.availableMin) * 1000) / 1000 : null, freeMin: w.availableMin - w.bookedMin })),
      }
    : null;
  const withCost = services.filter((s) => s.materialCostMinor != null).length;

  const index: Record<string, number> = {};
  const put = (k: string, v: number | null | undefined) => {
    if (typeof v === 'number' && Number.isFinite(v)) index[k] = v;
  };
  put('period.days', days);
  put('history.completed_visits_90d', hist.visits);
  put('history.reviews', hist.reviews);
  put('customers.active_90d', cust.active);
  put('customers.with_marketing_consent', cust.consenting);
  put('occupancy.total', occupancy?.total);
  put('occupancy.available_min', occupancy?.availableMin);
  put('occupancy.booked_min', occupancy?.bookedMin);
  for (const w of occupancy?.byWeekday ?? []) {
    put(`occupancy.weekday_${w.weekday}`, w.occupancy);
    put(`occupancy.weekday_${w.weekday}_free_min`, w.freeMin);
  }
  for (const s of services) {
    put(`${s.key}.price_minor`, s.priceMinor);
    put(`${s.key}.price_sar`, s.priceMinor / 100);
    put(`${s.key}.duration_min`, s.durationMin);
    put(`${s.key}.material_cost_minor`, s.materialCostMinor);
    for (const [k, v] of Object.entries(s.demand)) put(`${s.key}.${k}`, v);
    put(`${s.key}.rating`, s.rating);
    put(`${s.key}.review_count`, s.reviewCount);
    put(`${s.key}.cadence_days`, s.cadenceDays);
    put(`${s.key}.overdue_consenting`, s.overdueConsenting);
  }
  put('preferences.max_discount_bps', prefs?.maxDiscountBps);
  put('preferences.max_discount_pct', prefs ? prefs.maxDiscountBps / 100 : null);
  put('preferences.monthly_budget_minor', prefs?.monthlyBudgetMinor);

  const body = {
    tenantId,
    kind: 'marketing' as const,
    period: { from: fromDate, to: addDays(fromDate, days - 1), days },
    dataAsOf: now.toISOString(),
    business: { type: t.businessType, city: t.city, timezone: tz, currency: t.currency, locale: t.defaultLocale, branches, ageDays: Math.floor((+now - +t.createdAt) / 86400000) },
    history: { completedVisits90d: hist.visits, firstCompletedAt: hist.first ? new Date(hist.first).toISOString() : null, reviews: hist.reviews },
    services,
    occupancy,
    customers: { active90d: cust.active, withMarketingConsent: cust.consenting },
    costs: { servicesWithCost: withCost, servicesTotal: services.length, complete: services.length > 0 && withCost === services.length },
    loyaltyEnabled: !!loy?.enabled,
    preferences: prefs ?? { goals: [], monthlyBudgetMinor: null, maxDiscountBps: 1500, channels: [], tone: null, avoidTopics: [], photoResources: null },
    pastCampaigns: past,
    index,
  };
  const hash = createHash('sha256').update(JSON.stringify({ ...body, dataAsOf: undefined })).digest('hex');
  return { ...body, hash };
}

export async function saveSnapshot(tx: Tx, s: Snapshot): Promise<string> {
  const [r] = await tx<{ id: string }[]>`
    insert into metric_snapshots (tenant_id, kind, period_start, period_end, data, data_hash, data_as_of)
    values (${s.tenantId}, 'marketing', ${s.period.from}, ${s.period.to}, ${tx.json(s as never)}, ${s.hash}, ${s.dataAsOf})
    returning id`;
  return r.id;
}

/** Local "today" for a tenant timezone. */
export const todayIn = (tz: string, d = new Date()) => utcToWall(d, tz).date;
