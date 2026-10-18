import type { Tx } from '../db';
import { computeOccupancy } from './occupancy';

/**
 * Employee performance indicators — shown SEPARATELY first, each with its sample
 * size; a composite score only when every component meets the minimum sample.
 * Never ranks on raw revenue across differently priced specialties: productivity
 * is utilization (booked minutes per available minute) and revenue per hour is
 * shown only relative to peers of the same specialty.
 *
 * Satisfaction uses Bayesian shrinkage toward the business mean when enabled:
 *   adjusted = (n·mean_staff + k·mean_business) / (n + k)
 * AI may explain these numbers and suggest development; it never makes
 * employment, pay or dismissal decisions.
 */
export interface Indicator {
  value: number | null;
  sample: number;
  sufficient: boolean;
  method: string;
}

export interface StaffPerformance {
  staffId: string;
  name: string;
  specialty: string | null;
  visits: Indicator;
  satisfaction: Indicator & { raw: number | null };
  reviewCount: number;
  repeatRate: Indicator;
  punctuality: Indicator & { avgDelayMin: number | null };
  lowRatings: Indicator;
  utilization: Indicator;
  revenuePerHourVsSpecialty: Indicator;
  composite: { value: number | null; sufficient: boolean; weights: Record<string, number>; weightsAreTestValues: boolean };
  notTracked: string[];
}

export async function getAnalyticsSettings(tx: Tx, tenantId: string) {
  const [s] = await tx<{ performanceWeights: Record<string, number>; weightsAreTestValues: boolean; minSampleVisits: number; minSampleReviews: number; shrinkageEnabled: boolean; shrinkagePriorWeight: number }[]>`
    select * from analytics_settings where tenant_id = ${tenantId}`;
  if (s) return s;
  const [created] = await tx<typeof s[]>`insert into analytics_settings (tenant_id) values (${tenantId}) on conflict do nothing returning *`;
  return created ?? (await tx<typeof s[]>`select * from analytics_settings where tenant_id = ${tenantId}`)[0];
}

export async function staffPerformance(tx: Tx, tenantId: string, branchId: string, fromDate: string, days: number, from: Date, to: Date): Promise<StaffPerformance[]> {
  const cfg = await getAnalyticsSettings(tx, tenantId);
  const occ = await computeOccupancy(tx, branchId, fromDate, days);
  const rows = await tx<{
    staffId: string; name: string; specialty: string | null; visits: number; revenueMinor: number; punctualSample: number; onTime: number;
    avgDelay: number | null; customers: number; repeatCustomers: number;
  }[]>`
    select sp.id as staff_id, sp.display_name as name, sp.specialty,
      count(i.id) filter (where b.status = 'completed')::int as visits,
      coalesce(sum(i.price_minor + i.addons_minor) filter (where b.status = 'completed'), 0)::bigint as revenue_minor,
      count(i.id) filter (where b.status = 'completed' and i.actual_start_at is not null)::int as punctual_sample,
      count(i.id) filter (where b.status = 'completed' and i.actual_start_at is not null and i.actual_start_at <= i.starts_at + interval '5 minutes')::int as on_time,
      avg(extract(epoch from (i.actual_start_at - i.starts_at)) / 60) filter (where b.status = 'completed' and i.actual_start_at is not null) as avg_delay,
      count(distinct b.tenant_customer_id) filter (where b.status = 'completed')::int as customers,
      count(distinct b.tenant_customer_id) filter (where b.status = 'completed' and exists (
        select 1 from bookings b2 where b2.tenant_customer_id = b.tenant_customer_id and b2.id <> b.id
          and b2.starts_at > b.starts_at and b2.status in ('confirmed','checked_in','in_service','completed')))::int as repeat_customers
    from staff_profiles sp
    join staff_branch_assignments a on a.staff_id = sp.id and a.branch_id = ${branchId}
    left join booking_items i on i.staff_id = sp.id and i.status = 'active' and i.starts_at >= ${from} and i.starts_at < ${to}
    left join bookings b on b.id = i.booking_id
    where sp.status <> 'archived'
    group by sp.id, sp.display_name, sp.specialty`;
  const reviews = await tx<{ staffId: string; n: number; avg: number | null; low: number }[]>`
    select staff_id, count(*)::int as n, avg(rating)::float as avg, count(*) filter (where rating <= 2)::int as low
    from reviews where staff_id is not null and status = 'published' and created_at >= ${from} and created_at < ${to} group by staff_id`;
  const [biz] = await tx<{ avg: number | null }[]>`select avg(rating)::float as avg from reviews where status = 'published'`;

  // revenue per available hour, compared within specialty
  const rph = new Map<string, number | null>();
  for (const r of rows) {
    const o = occ.staff.find((x) => x.staffId === r.staffId);
    rph.set(r.staffId, o && o.availableMin > 0 ? Number(r.revenueMinor) / (o.availableMin / 60) : null);
  }
  const bySpecialty = new Map<string, number[]>();
  for (const r of rows) {
    const v = rph.get(r.staffId);
    if (v == null) continue;
    const k = (r.specialty ?? '').trim().toLowerCase() || '—';
    bySpecialty.set(k, [...(bySpecialty.get(k) ?? []), v]);
  }
  const median = (a: number[]) => {
    const s = [...a].sort((x, y) => x - y);
    return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
  };

  const minV = cfg.minSampleVisits;
  const minR = cfg.minSampleReviews;
  return rows.map((r) => {
    const rv = reviews.find((x) => x.staffId === r.staffId);
    const n = rv?.n ?? 0;
    const rawSat = rv?.avg ?? null;
    const k = cfg.shrinkageEnabled ? cfg.shrinkagePriorWeight : 0;
    const sat = rawSat != null && biz.avg != null ? (n * rawSat + k * biz.avg) / (n + k) : rawSat;
    const o = occ.staff.find((x) => x.staffId === r.staffId);
    const peers = bySpecialty.get((r.specialty ?? '').trim().toLowerCase() || '—') ?? [];
    const med = median(peers);
    const mine = rph.get(r.staffId);
    const ind = (value: number | null, sample: number, min: number, method: string): Indicator => ({ value: sample >= min ? value : null, sample, sufficient: sample >= min && value != null, method });
    const satisfaction = { ...ind(sat, n, minR, cfg.shrinkageEnabled ? 'analytics.method_satisfaction_shrunk' : 'analytics.method_satisfaction'), raw: n >= minR ? rawSat : null };
    const repeatRate = ind(r.customers ? r.repeatCustomers / r.customers : null, r.customers, minV, 'analytics.method_repeat');
    const punctuality = { ...ind(r.punctualSample ? r.onTime / r.punctualSample : null, r.punctualSample, minV, 'analytics.method_punctuality'), avgDelayMin: r.punctualSample >= minV && r.avgDelay != null ? Math.round(Number(r.avgDelay) * 10) / 10 : null };
    const lowRatings = ind(n ? (rv?.low ?? 0) / n : null, n, minR, 'analytics.method_low_ratings');
    const utilization = ind(o?.occupancy ?? null, o?.availableMin ? Math.round(o.availableMin / 60) : 0, 8, 'analytics.method_utilization');
    const relRev = ind(mine != null && med ? mine / med : null, peers.length >= 2 ? r.visits : 0, minV, 'analytics.method_revenue_relative');
    const w = cfg.performanceWeights;
    const comps: [number | null, number][] = [
      [satisfaction.value != null ? (satisfaction.value - 1) / 4 : null, w.satisfaction ?? 0],
      [repeatRate.value, w.repeat ?? 0],
      [punctuality.value, w.punctuality ?? 0],
      [lowRatings.value != null ? 1 - lowRatings.value : null, w.complaints ?? 0],
      [utilization.value, w.productivity ?? 0],
    ];
    const allOk = comps.every(([v, wt]) => wt === 0 || v != null);
    const wsum = comps.reduce((acc, [, wt]) => acc + wt, 0);
    const composite = allOk && wsum > 0 ? comps.reduce((acc, [v, wt]) => acc + (v ?? 0) * wt, 0) / wsum : null;
    return {
      staffId: r.staffId,
      name: r.name,
      specialty: r.specialty,
      visits: { value: r.visits, sample: r.visits, sufficient: r.visits >= minV, method: 'analytics.method_visits' },
      satisfaction,
      reviewCount: n,
      repeatRate,
      punctuality,
      lowRatings,
      utilization,
      revenuePerHourVsSpecialty: relRev,
      composite: { value: composite, sufficient: composite != null, weights: w, weightsAreTestValues: cfg.weightsAreTestValues },
      notTracked: ['rework'],
    };
  });
}
