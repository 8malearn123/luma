import { z } from 'zod';
import type { Tx } from '../db';
import { AppError, notFound } from '../errors';
import { entitlements, requireLive } from '../tenancy/plan';
import { addDays, utcToWall, wallToUtc, weekdayOf } from '@/lib/tz';
import { covers, intersect, MIN, normalize, subtract, totalMinutes, type Interval } from './intervals';
import { planItineraries, type Itinerary, type PlanItem } from './planner';

/**
 * Availability engine (data layer). Steps, matching the specification:
 *  1. validate tenant/branch/service status and subscription (public mode)
 *  2. durations (variant/staff-specific), add-ons and buffers
 *  3. qualified staff at the branch + required resources
 *  4. working hours ∩ branch hours, with date overrides, minus breaks,
 *     approved leave, blocked time, confirmed allocations and unexpired holds
 *  5. timezone, minimum notice, booking window, slot increment
 *  6. only feasible options are returned — never who/what occupies a time
 *  7. "any specialist": earliest first, then the declared allocation rule
 *  8. results are advisory; holds and confirmations re-verify inside a txn
 */
export const itemRequest = z.object({
  serviceId: z.string().uuid(),
  variantId: z.string().uuid().nullable().optional(),
  addonIds: z.array(z.string().uuid()).max(10).default([]),
  staffId: z.string().uuid().nullable().optional(), // null/undefined = any qualified specialist
});
export type ItemRequest = z.infer<typeof itemRequest>;

export const availabilityQuery = z.object({
  branchId: z.string().uuid(),
  items: z.array(itemRequest).min(1).max(5),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  days: z.number().int().min(1).max(14).default(7),
});

export interface Policy {
  slotIncrementMin: number;
  minNoticeMin: number;
  maxAdvanceDays: number;
  holdMinutes: number;
  anyStaffRule: 'earliest_then_least_booked' | 'earliest_then_weight';
  maxGapMin: number;
  noShowGraceMin: number;
  cancellationWindowHours: number;
}

export interface ResolvedItem {
  key: number;
  serviceId: string;
  serviceName: string;
  serviceNameEn: string | null;
  variantId: string | null;
  variantName: string | null;
  addons: { id: string; name: string; priceMinor: number; durationMin: number }[];
  bufferBeforeMin: number;
  bufferAfterMin: number;
  /** per qualified staff: price and duration (incl. add-ons) */
  candidates: { staffId: string; staffName: string; publicName: string; priceMinor: number; basePriceMinor: number; durationMin: number }[];
  resourceNeeds: { resourceTypeId: string; quantity: number; resourceIds: string[] }[];
  minNoticeMin: number | null;
  maxAdvanceDays: number | null;
  groupCapacity: number | null;
}

export interface EngineContext {
  tenantId: string;
  branchId: string;
  timezone: string;
  policy: Policy;
  items: ResolvedItem[];
  staff: Map<string, { name: string; publicVisible: boolean; weight: number; sort: number }>;
}

type Mode = 'public' | 'internal';

export async function loadPolicy(tx: Tx): Promise<Policy & { version: number; raw: Record<string, unknown> }> {
  const [p] = await tx<(Policy & { version: number })[]>`select * from booking_policies limit 1`;
  if (!p) throw new AppError('unavailable', 'errors.booking_not_configured');
  return { ...p, raw: p as unknown as Record<string, unknown> };
}

/** Resolve services → items with qualified staff, pricing and resources. */
export async function resolveItems(tx: Tx, tenantId: string, branchId: string, reqs: ItemRequest[], mode: Mode): Promise<EngineContext> {
  const [tenant] = await tx<{ timezone: string; status: string }[]>`select timezone, status from tenants where id = ${tenantId}`;
  const [branch] = await tx<{ id: string; timezone: string | null; status: string }[]>`select id, timezone, status from branches where id = ${branchId}`;
  if (!tenant || !branch || branch.status !== 'active') throw notFound('branch');
  if (mode === 'public') {
    if (tenant.status !== 'active') throw new AppError('unavailable', 'errors.store_not_accepting');
    requireLive(await entitlements(tx, tenantId));
  }
  const policy = await loadPolicy(tx);
  const serviceIds = [...new Set(reqs.map((r) => r.serviceId))];
  const services = await tx<{
    id: string; name: string; nameEn: string | null; priceMinor: number; durationMin: number; bufferBeforeMin: number; bufferAfterMin: number;
    status: string; isVisible: boolean; internalBookingWhenHidden: boolean; branchId: string | null; minNoticeMin: number | null;
    maxAdvanceDays: number | null; groupCapacity: number | null; categoryStatus: string | null;
  }[]>`
    select s.*, c.status as category_status from services s left join categories c on c.tenant_id = s.tenant_id and c.id = s.category_id
    where s.id = any(${serviceIds}::uuid[])`;
  const byId = new Map(services.map((s) => [s.id, s]));
  const staffRows = await tx<{ id: string; displayName: string; publicVisible: boolean; allocationWeight: number; sort: number; serviceId: string }[]>`
    select sp.id, sp.display_name, sp.public_visible, sp.allocation_weight, sp.sort, ss.service_id
    from service_staff ss
    join staff_profiles sp on sp.tenant_id = ss.tenant_id and sp.id = ss.staff_id and sp.status = 'active'
    join staff_branch_assignments a on a.tenant_id = sp.tenant_id and a.staff_id = sp.id and a.branch_id = ${branchId}
    where ss.service_id = any(${serviceIds}::uuid[])`;
  const rules = await tx<{ serviceId: string; variantId: string | null; staffId: string | null; priceMinor: number | null; durationMin: number | null }[]>`
    select service_id, variant_id, staff_id, price_minor, duration_min from service_price_rules where service_id = any(${serviceIds}::uuid[])`;
  const variants = await tx<{ id: string; serviceId: string; name: string; priceMinor: number; durationMin: number }[]>`
    select id, service_id, name, price_minor, duration_min from service_variants where service_id = any(${serviceIds}::uuid[]) and status = 'active'`;
  const addons = await tx<{ id: string; serviceId: string; name: string; priceMinor: number; durationMin: number }[]>`
    select id, service_id, name, price_minor, duration_min from service_addons where service_id = any(${serviceIds}::uuid[]) and status = 'active'`;
  const reqRes = await tx<{ serviceId: string; resourceTypeId: string; quantity: number }[]>`
    select service_id, resource_type_id, quantity from service_resource_requirements where service_id = any(${serviceIds}::uuid[])`;
  const resources = await tx<{ id: string; resourceTypeId: string }[]>`
    select id, resource_type_id from resources where branch_id = ${branchId} and status = 'active' order by name, id`;

  const staff = new Map<string, { name: string; publicVisible: boolean; weight: number; sort: number }>();
  const items: ResolvedItem[] = reqs.map((r, key) => {
    const s = byId.get(r.serviceId);
    if (!s) throw notFound('service');
    if (s.status !== 'active') throw new AppError('validation', 'errors.service_inactive', { serviceId: s.id });
    if (s.branchId && s.branchId !== branchId) throw new AppError('validation', 'errors.service_not_at_branch');
    const hidden = !s.isVisible || s.categoryStatus === 'hidden' || s.categoryStatus === 'archived';
    if (hidden && (mode === 'public' || !s.internalBookingWhenHidden)) throw notFound('service');
    if (s.groupCapacity) throw new AppError('validation', 'errors.group_service_use_sessions');
    const v = r.variantId ? variants.find((x) => x.id === r.variantId && x.serviceId === s.id) : null;
    if (r.variantId && !v) throw new AppError('validation', 'errors.invalid_reference');
    const ads = r.addonIds.map((id) => {
      const a = addons.find((x) => x.id === id && x.serviceId === s.id);
      if (!a) throw new AppError('validation', 'errors.invalid_reference');
      return { id: a.id, name: a.name, priceMinor: a.priceMinor, durationMin: a.durationMin };
    });
    const addMin = ads.reduce((n, a) => n + a.durationMin, 0);
    const addPrice = ads.reduce((n, a) => n + a.priceMinor, 0);
    const qualified = staffRows.filter((x) => x.serviceId === s.id);
    if (r.staffId && !qualified.some((q) => q.id === r.staffId)) throw new AppError('validation', 'errors.staff_not_qualified');
    const candidates = qualified
      .filter((q) => !r.staffId || q.id === r.staffId)
      .map((q) => {
        staff.set(q.id, { name: q.displayName, publicVisible: q.publicVisible, weight: q.allocationWeight, sort: q.sort });
        let price = v ? v.priceMinor : s.priceMinor;
        let dur = v ? v.durationMin : s.durationMin;
        const score = (x: (typeof rules)[number]) =>
          (x.variantId ? (x.variantId === (v?.id ?? null) ? 1 : -99) : 0) + (x.staffId ? (x.staffId === q.id ? 2 : -99) : 0);
        for (const rule of rules.filter((x) => x.serviceId === s.id && score(x) > 0).sort((a, b) => score(a) - score(b))) {
          if (rule.priceMinor != null) price = rule.priceMinor;
          if (rule.durationMin != null) dur = rule.durationMin;
        }
        return { staffId: q.id, staffName: q.displayName, publicName: q.publicVisible ? q.displayName : '', basePriceMinor: price, priceMinor: price + addPrice, durationMin: dur + addMin };
      });
    const needs = reqRes
      .filter((x) => x.serviceId === s.id)
      .map((x) => ({ resourceTypeId: x.resourceTypeId, quantity: x.quantity, resourceIds: resources.filter((rr) => rr.resourceTypeId === x.resourceTypeId).map((rr) => rr.id) }));
    return {
      key,
      serviceId: s.id,
      serviceName: s.name,
      serviceNameEn: s.nameEn,
      variantId: v?.id ?? null,
      variantName: v?.name ?? null,
      addons: ads,
      bufferBeforeMin: s.bufferBeforeMin,
      bufferAfterMin: s.bufferAfterMin,
      candidates,
      resourceNeeds: needs,
      minNoticeMin: s.minNoticeMin,
      maxAdvanceDays: s.maxAdvanceDays,
      groupCapacity: s.groupCapacity,
    };
  });
  return { tenantId, branchId, timezone: branch.timezone ?? tenant.timezone, policy, items, staff };
}

interface FreeMaps {
  staffFree: Map<string, Interval[]>;
  resourceFree: Map<string, Interval[]>;
  bookedMinutes: Map<string, number>; // `${staffId}|${day}`
}

/** Free time per staff/resource over [fromDate, fromDate+days) local dates. */
export async function computeFree(
  tx: Tx,
  ec: EngineContext,
  fromDate: string,
  days: number,
  opts: { excludeBookingId?: string | null; now?: Date } = {},
): Promise<FreeMaps> {
  const tz = ec.timezone;
  const staffIds = [...ec.staff.keys()];
  const resourceIds = [...new Set(ec.items.flatMap((i) => i.resourceNeeds.flatMap((n) => n.resourceIds)))];
  const winStart = wallToUtc(fromDate, '00:00', tz);
  const winEnd = wallToUtc(addDays(fromDate, days), '00:00', tz);
  const toDate = addDays(fromDate, days - 1);
  const now = opts.now ?? new Date();

  const [hours, overrides, breaks, leave, blocked, allocs] = await Promise.all([
    tx<{ staffId: string | null; weekday: number; startTime: string; endTime: string }[]>`
      select staff_id, weekday, to_char(start_time,'HH24:MI') as start_time, to_char(end_time,'HH24:MI') as end_time from working_hours
      where branch_id = ${ec.branchId} and (staff_id is null or staff_id = any(${staffIds}::uuid[]))`,
    tx<{ staffId: string | null; onDate: string; kind: string; startTime: string | null; endTime: string | null }[]>`
      select staff_id, to_char(on_date,'YYYY-MM-DD') as on_date, kind, to_char(start_time,'HH24:MI') as start_time, to_char(end_time,'HH24:MI') as end_time
      from shift_overrides where branch_id = ${ec.branchId} and on_date between ${fromDate} and ${toDate}
        and (staff_id is null or staff_id = any(${staffIds}::uuid[]))`,
    tx<{ staffId: string; weekday: number | null; onDate: string | null; startTime: string; endTime: string }[]>`
      select staff_id, weekday, to_char(on_date,'YYYY-MM-DD') as on_date, to_char(start_time,'HH24:MI') as start_time, to_char(end_time,'HH24:MI') as end_time
      from breaks where staff_id = any(${staffIds}::uuid[]) and (on_date is null or on_date between ${fromDate} and ${toDate})`,
    tx<{ staffId: string; startsAt: Date; endsAt: Date }[]>`
      select staff_id, starts_at, ends_at from leave_requests
      where staff_id = any(${staffIds}::uuid[]) and status = 'approved' and starts_at < ${winEnd} and ends_at > ${winStart}`,
    tx<{ staffId: string | null; resourceId: string | null; s: Date; e: Date }[]>`
      select staff_id, resource_id, lower(during) as s, upper(during) as e from blocked_times
      where (staff_id = any(${staffIds}::uuid[]) or resource_id = any(${resourceIds}::uuid[])) and during && tstzrange(${winStart}, ${winEnd})`,
    tx<{ staffId: string | null; resourceId: string | null; s: Date; e: Date; bookingId: string | null }[]>`
      select staff_id, resource_id, lower(during) as s, upper(during) as e, booking_id from booking_allocations
      where active and (expires_at is null or expires_at > ${now})
        and (staff_id = any(${staffIds}::uuid[]) or resource_id = any(${resourceIds}::uuid[]))
        and during && tstzrange(${winStart}, ${winEnd})
        and (${opts.excludeBookingId ?? null}::uuid is null or booking_id is distinct from ${opts.excludeBookingId ?? null}::uuid)`,
  ]);

  const branchHasHours = hours.some((h) => h.staffId === null);
  const toIv = (date: string, s: string, e: string): Interval => [+wallToUtc(date, s, tz), +wallToUtc(date, e, tz)];

  const branchDay = (date: string): Interval[] | null => {
    const o = overrides.find((x) => x.staffId === null && x.onDate === date);
    if (o?.kind === 'closed') return [];
    if (o?.kind === 'custom') return [toIv(date, o.startTime!, o.endTime!)];
    if (!branchHasHours) return null; // no branch hours configured → staff hours alone decide
    const wd = weekdayOf(date);
    return normalize(hours.filter((h) => h.staffId === null && h.weekday === wd).map((h) => toIv(date, h.startTime, h.endTime)));
  };

  const staffFree = new Map<string, Interval[]>();
  const resourceFree = new Map<string, Interval[]>();
  const bookedMinutes = new Map<string, number>();
  const dates = Array.from({ length: days }, (_, i) => addDays(fromDate, i));

  for (const sid of staffIds) {
    let free: Interval[] = [];
    for (const date of dates) {
      const b = branchDay(date);
      if (b && !b.length) continue;
      const o = overrides.find((x) => x.staffId === sid && x.onDate === date);
      let sh: Interval[];
      if (o?.kind === 'closed') continue;
      if (o?.kind === 'custom') sh = [toIv(date, o.startTime!, o.endTime!)];
      else {
        const wd = weekdayOf(date);
        sh = normalize(hours.filter((h) => h.staffId === sid && h.weekday === wd).map((h) => toIv(date, h.startTime, h.endTime)));
      }
      if (b) sh = intersect(sh, b);
      const wd = weekdayOf(date);
      const br = breaks.filter((x) => x.staffId === sid && (x.weekday === wd || x.onDate === date)).map((x) => toIv(date, x.startTime, x.endTime));
      free.push(...subtract(sh, br));
    }
    free = normalize(free);
    const busy: Interval[] = [
      ...leave.filter((l) => l.staffId === sid).map((l) => [+l.startsAt, +l.endsAt] as Interval),
      ...blocked.filter((x) => x.staffId === sid).map((x) => [+x.s, +x.e] as Interval),
      ...allocs.filter((x) => x.staffId === sid).map((x) => [+x.s, +x.e] as Interval),
    ];
    staffFree.set(sid, subtract(free, busy));
    for (const a of allocs.filter((x) => x.staffId === sid)) {
      const day = utcToWall(a.s, tz).date;
      const k = `${sid}|${day}`;
      bookedMinutes.set(k, (bookedMinutes.get(k) ?? 0) + totalMinutes([[+a.s, +a.e]]));
    }
  }
  for (const rid of resourceIds) {
    const open: Interval[] = [];
    for (const date of dates) {
      const b = branchDay(date);
      if (b === null) open.push([+wallToUtc(date, '00:00', tz), +wallToUtc(addDays(date, 1), '00:00', tz)]);
      else open.push(...b);
    }
    const busy = [
      ...blocked.filter((x) => x.resourceId === rid).map((x) => [+x.s, +x.e] as Interval),
      ...allocs.filter((x) => x.resourceId === rid).map((x) => [+x.s, +x.e] as Interval),
    ];
    resourceFree.set(rid, subtract(normalize(open), busy));
  }
  return { staffFree, resourceFree, bookedMinutes };
}

function rankFn(ec: EngineContext, booked: Map<string, number>) {
  const ids = [...ec.staff.keys()];
  const cache = new Map<string, Map<string, number>>();
  return (staffId: string, day: string) => {
    let m = cache.get(day);
    if (!m) {
      const sorted = [...ids].sort((a, b) => {
        const sa = ec.staff.get(a)!;
        const sb = ec.staff.get(b)!;
        if (ec.policy.anyStaffRule === 'earliest_then_weight') {
          if (sb.weight !== sa.weight) return sb.weight - sa.weight;
        } else {
          const d = (booked.get(`${a}|${day}`) ?? 0) - (booked.get(`${b}|${day}`) ?? 0);
          if (d) return d;
        }
        return sa.sort - sb.sort || a.localeCompare(b);
      });
      m = new Map(sorted.map((id, i) => [id, i]));
      cache.set(day, m);
    }
    return m.get(staffId) ?? 999;
  };
}

export interface SlotOption {
  startsAt: string;
  endsAt: string;
  totalGapMin: number;
  totalDurationMin: number;
  totalPriceMinor: number;
  items: { key: number; serviceId: string; staffId: string; staffName: string; startsAt: string; endsAt: string; priceMinor: number; durationMin: number }[];
}

export interface AvailabilityResult {
  timezone: string;
  days: { date: string; slots: SlotOption[] }[];
  reason?: 'no_qualified_staff' | 'no_slots';
}

function windowFor(ec: EngineContext, now: Date) {
  const notice = Math.max(ec.policy.minNoticeMin, ...ec.items.map((i) => i.minNoticeMin ?? 0));
  const advance = Math.min(ec.policy.maxAdvanceDays, ...ec.items.map((i) => i.maxAdvanceDays ?? 365));
  return { earliest: +now + notice * MIN, latest: +now + advance * 1440 * MIN };
}

export async function findAvailability(
  tx: Tx,
  tenantId: string,
  q: z.infer<typeof availabilityQuery>,
  mode: Mode,
  opts: { now?: Date; excludeBookingId?: string | null; maxPerDay?: number } = {},
): Promise<AvailabilityResult & { engine: EngineContext }> {
  const now = opts.now ?? new Date();
  const ec = await resolveItems(tx, tenantId, q.branchId, q.items, mode);
  if (ec.items.some((i) => i.candidates.length === 0)) return { timezone: ec.timezone, days: [], reason: 'no_qualified_staff', engine: ec };
  const free = await computeFree(tx, ec, q.from, q.days, { excludeBookingId: opts.excludeBookingId, now });
  const { earliest, latest } = windowFor(ec, now);
  const inc = ec.policy.slotIncrementMin;
  const days: AvailabilityResult['days'] = [];
  for (let d = 0; d < q.days; d++) {
    const date = addDays(q.from, d);
    const dayStart = +wallToUtc(date, '00:00', ec.timezone);
    const dayEnd = +wallToUtc(addDays(date, 1), '00:00', ec.timezone);
    const starts: number[] = [];
    for (let t = dayStart; t < dayEnd; t += inc * MIN) if (t >= earliest && t <= latest) starts.push(t);
    const plan = planItineraries({
      items: ec.items.map<PlanItem>((i) => ({ key: i.key, serviceId: i.serviceId, candidates: i.candidates, bufferBeforeMin: i.bufferBeforeMin, bufferAfterMin: i.bufferAfterMin, resourceNeeds: i.resourceNeeds })),
      staffFree: free.staffFree,
      resourceFree: free.resourceFree,
      candidateStarts: starts,
      incrementMin: inc,
      maxGapMin: ec.items.length > 1 ? ec.policy.maxGapMin : 0,
      staffRank: rankFn(ec, free.bookedMinutes),
      dayKeyOf: (t) => utcToWall(new Date(t), ec.timezone).date,
      maxResults: opts.maxPerDay ?? 200,
    });
    days.push({ date, slots: plan.map((it) => toSlot(ec, it, mode)) });
  }
  const any = days.some((d) => d.slots.length);
  return { timezone: ec.timezone, days, reason: any ? undefined : 'no_slots', engine: ec };
}

function toSlot(ec: EngineContext, it: Itinerary, mode: Mode): SlotOption {
  return {
    startsAt: new Date(it.startsAt).toISOString(),
    endsAt: new Date(it.endsAt).toISOString(),
    totalGapMin: it.totalGapMin,
    totalDurationMin: Math.round((it.endsAt - it.startsAt) / MIN),
    totalPriceMinor: it.items.reduce((n, x) => n + x.priceMinor, 0),
    items: it.items.map((x) => {
      const st = ec.staff.get(x.staffId)!;
      return {
        key: x.key,
        serviceId: x.serviceId,
        staffId: x.staffId,
        staffName: mode === 'public' && !st.publicVisible ? '' : st.name,
        startsAt: new Date(x.startsAt).toISOString(),
        endsAt: new Date(x.endsAt).toISOString(),
        priceMinor: x.priceMinor,
        durationMin: x.durationMin,
      };
    }),
  };
}

export interface ChosenItem {
  serviceId: string;
  variantId?: string | null;
  addonIds?: string[];
  staffId: string;
  startsAt: string;
}

/**
 * Exact re-verification of a chosen itinerary (used when creating a hold and
 * when rescheduling). Returns the planned items with occupancy and resources,
 * or throws slot_unavailable.
 */
export async function verifyItinerary(
  tx: Tx,
  tenantId: string,
  branchId: string,
  chosen: ChosenItem[],
  mode: Mode,
  opts: { now?: Date; excludeBookingId?: string | null } = {},
) {
  const now = opts.now ?? new Date();
  const ec = await resolveItems(
    tx,
    tenantId,
    branchId,
    chosen.map((c) => ({ serviceId: c.serviceId, variantId: c.variantId ?? null, addonIds: c.addonIds ?? [], staffId: c.staffId })),
    mode,
  );
  const first = new Date(chosen[0].startsAt);
  const localFirst = utcToWall(first, ec.timezone).date;
  const lastStart = new Date(chosen[chosen.length - 1].startsAt);
  const span = Math.max(1, Math.round((+wallToUtc(utcToWall(lastStart, ec.timezone).date, '00:00', ec.timezone) - +wallToUtc(localFirst, '00:00', ec.timezone)) / 86400000) + 2);
  const free = await computeFree(tx, ec, localFirst, Math.min(span, 3), { excludeBookingId: opts.excludeBookingId, now });
  const { earliest, latest } = windowFor(ec, now);
  if (+first < earliest || +first > latest) throw new AppError('slot_unavailable', 'errors.slot_outside_window');
  const inc = ec.policy.slotIncrementMin;
  const dayStart = +wallToUtc(localFirst, '00:00', ec.timezone);
  if ((+first - dayStart) % (inc * MIN) !== 0) throw new AppError('slot_unavailable', 'errors.slot_unavailable');

  const planned: { item: ResolvedItem; staffId: string; startsAt: number; endsAt: number; occStart: number; occEnd: number; priceMinor: number; basePriceMinor: number; durationMin: number; resourceIds: string[] }[] = [];
  let prevEnd = +first;
  for (let i = 0; i < chosen.length; i++) {
    const item = ec.items[i];
    const cand = item.candidates.find((c) => c.staffId === chosen[i].staffId);
    if (!cand) throw new AppError('slot_unavailable', 'errors.staff_not_qualified');
    const s = +new Date(chosen[i].startsAt);
    if (i === 0 ? s !== +first : s < prevEnd || s - prevEnd > ec.policy.maxGapMin * MIN) throw new AppError('slot_unavailable', 'errors.itinerary_invalid');
    const e = s + cand.durationMin * MIN;
    const os = s - item.bufferBeforeMin * MIN;
    const oe = e + item.bufferAfterMin * MIN;
    const sf = free.staffFree.get(cand.staffId) ?? [];
    if (!covers(sf, os, oe)) throw new AppError('slot_unavailable', 'errors.slot_unavailable');
    if (planned.some((p) => p.staffId === cand.staffId && os < p.occEnd && p.occStart < oe)) throw new AppError('slot_unavailable', 'errors.slot_unavailable');
    const resIds: string[] = [];
    for (const need of item.resourceNeeds) {
      let got = 0;
      for (const rid of need.resourceIds) {
        if (got >= need.quantity) break;
        if (resIds.includes(rid) || !covers(free.resourceFree.get(rid) ?? [], os, oe)) continue;
        if (planned.some((p) => p.resourceIds.includes(rid) && os < p.occEnd && p.occStart < oe)) continue;
        resIds.push(rid);
        got++;
      }
      if (got < need.quantity) throw new AppError('slot_unavailable', 'errors.resource_unavailable');
    }
    planned.push({ item, staffId: cand.staffId, startsAt: s, endsAt: e, occStart: os, occEnd: oe, priceMinor: cand.priceMinor, basePriceMinor: cand.basePriceMinor, durationMin: cand.durationMin, resourceIds: resIds });
    prevEnd = e;
  }
  return { ec, planned };
}

