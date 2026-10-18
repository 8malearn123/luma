import type { Tx } from '../db';
import { addDays, wallToUtc, weekdayOf } from '@/lib/tz';
import { intersect, normalize, subtract, totalMinutes, type Interval } from '../booking/intervals';

/**
 * occupancy = booked service minutes ÷ available working minutes, over the
 * same staff, branch and period.
 *   available = staff hours ∩ branch hours (with date overrides) − breaks − approved leave
 *   booked    = staff allocations of confirmed/checked-in/in-service/completed
 *               bookings (incl. buffers), intersected with available time
 * Holds, cancellations, no-shows and expired bookings are not "booked".
 */
export interface StaffOccupancy {
  staffId: string;
  availableMin: number;
  bookedMin: number;
  occupancy: number | null; // null when no available time
}

export async function computeOccupancy(tx: Tx, branchId: string, fromDate: string, days: number): Promise<{ timezone: string; staff: StaffOccupancy[]; byWeekday: { weekday: number; availableMin: number; bookedMin: number }[]; total: StaffOccupancy }> {
  const [b] = await tx<{ tz: string }[]>`select coalesce(b.timezone, t.timezone) as tz from branches b join tenants t on t.id = b.tenant_id where b.id = ${branchId}`;
  const tz = b?.tz ?? 'Asia/Riyadh';
  const toDate = addDays(fromDate, days - 1);
  const winStart = wallToUtc(fromDate, '00:00', tz);
  const winEnd = wallToUtc(addDays(fromDate, days), '00:00', tz);
  const staff = await tx<{ id: string }[]>`
    select s.id from staff_profiles s join staff_branch_assignments a on a.staff_id = s.id and a.branch_id = ${branchId} where s.status <> 'archived'`;
  const ids = staff.map((s) => s.id);
  const [hours, overrides, breaks, leave, allocs] = await Promise.all([
    tx<{ staffId: string | null; weekday: number; s: string; e: string }[]>`select staff_id, weekday, to_char(start_time,'HH24:MI') as s, to_char(end_time,'HH24:MI') as e from working_hours where branch_id = ${branchId}`,
    tx<{ staffId: string | null; d: string; kind: string; s: string | null; e: string | null }[]>`select staff_id, to_char(on_date,'YYYY-MM-DD') as d, kind, to_char(start_time,'HH24:MI') as s, to_char(end_time,'HH24:MI') as e from shift_overrides where branch_id = ${branchId} and on_date between ${fromDate} and ${toDate}`,
    tx<{ staffId: string; weekday: number | null; d: string | null; s: string; e: string }[]>`select staff_id, weekday, to_char(on_date,'YYYY-MM-DD') as d, to_char(start_time,'HH24:MI') as s, to_char(end_time,'HH24:MI') as e from breaks where staff_id = any(${ids}::uuid[])`,
    tx<{ staffId: string; s: Date; e: Date }[]>`select staff_id, starts_at as s, ends_at as e from leave_requests where staff_id = any(${ids}::uuid[]) and status = 'approved' and starts_at < ${winEnd} and ends_at > ${winStart}`,
    tx<{ staffId: string; s: Date; e: Date }[]>`
      select a.staff_id, lower(a.during) as s, upper(a.during) as e from booking_allocations a join bookings bk on bk.id = a.booking_id
      where a.staff_id = any(${ids}::uuid[]) and a.active and bk.status in ('confirmed','checked_in','in_service','completed')
        and a.during && tstzrange(${winStart}, ${winEnd})`,
  ]);
  const iv = (d: string, s: string, e: string): Interval => [+wallToUtc(d, s, tz), +wallToUtc(d, e, tz)];
  const hasBranchHours = hours.some((h) => h.staffId === null);
  const out: StaffOccupancy[] = [];
  const byWeekday = Array.from({ length: 7 }, (_, weekday) => ({ weekday, availableMin: 0, bookedMin: 0 }));
  for (const sid of ids) {
    const leaveIv = leave.filter((l) => l.staffId === sid).map((l) => [+l.s, +l.e] as Interval);
    const allocIv = normalize(allocs.filter((a) => a.staffId === sid).map((a) => [+a.s, +a.e] as Interval));
    let a = 0;
    let bk = 0;
    for (let i = 0; i < days; i++) {
      const d = addDays(fromDate, i);
      const wd = weekdayOf(d);
      const bo = overrides.find((o) => o.staffId === null && o.d === d);
      let branch: Interval[] | null = !hasBranchHours ? null : normalize(hours.filter((h) => h.staffId === null && h.weekday === wd).map((h) => iv(d, h.s, h.e)));
      if (bo?.kind === 'closed') branch = [];
      if (bo?.kind === 'custom') branch = [iv(d, bo.s!, bo.e!)];
      const so = overrides.find((o) => o.staffId === sid && o.d === d);
      let mine = normalize(hours.filter((h) => h.staffId === sid && h.weekday === wd).map((h) => iv(d, h.s, h.e)));
      if (so?.kind === 'closed') mine = [];
      if (so?.kind === 'custom') mine = [iv(d, so.s!, so.e!)];
      if (branch) mine = intersect(mine, branch);
      mine = subtract(mine, breaks.filter((x) => x.staffId === sid && (x.weekday === wd || x.d === d)).map((x) => iv(d, x.s, x.e)));
      mine = subtract(mine, leaveIv);
      const dayAvail = Math.round(totalMinutes(mine));
      const dayBooked = Math.round(totalMinutes(intersect(mine, allocIv)));
      a += dayAvail;
      bk += dayBooked;
      byWeekday[wd].availableMin += dayAvail;
      byWeekday[wd].bookedMin += dayBooked;
    }
    out.push({ staffId: sid, availableMin: a, bookedMin: bk, occupancy: a > 0 ? bk / a : null });
  }
  const ta = out.reduce((n, s) => n + s.availableMin, 0);
  const tb = out.reduce((n, s) => n + s.bookedMin, 0);
  return { timezone: tz, staff: out, byWeekday, total: { staffId: 'all', availableMin: ta, bookedMin: tb, occupancy: ta > 0 ? tb / ta : null } };
}
