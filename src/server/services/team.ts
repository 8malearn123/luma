import type { z } from 'zod';
import type { Tx } from '../db';
import { AppError, forbidden, notFound } from '../errors';
import { audit } from '../audit';
import { entitlements, requireBelowLimit } from '../tenancy/plan';
import type { TenantContext } from '../tenancy/context';
import { notifyTenantRoles } from './notifications';
import type { blockedTimeInput, leaveInput, overrideInput, selfProfileInput, staffInput, weeklyHoursInput } from '@/lib/validation/team';

const act = (ctx: TenantContext) => ({ actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, requestId: ctx.requestId });

export async function listStaff(tx: Tx, opts: { includeArchived?: boolean } = {}) {
  return tx`
    select s.id, s.display_name, s.display_name_en, s.specialty, s.status, s.public_visible, s.photo_asset_id, s.user_id, s.version,
      coalesce((select array_agg(branch_id) from staff_branch_assignments a where a.staff_id = s.id), '{}') as branch_ids,
      coalesce((select array_agg(service_id) from service_staff x where x.staff_id = s.id), '{}') as service_ids
    from staff_profiles s where ${opts.includeArchived ?? false} or s.status <> 'archived'
    order by s.sort, s.display_name`;
}

export async function getStaff(tx: Tx, id: string) {
  const [s] = await tx`
    select s.*, coalesce((select array_agg(branch_id) from staff_branch_assignments a where a.staff_id = s.id), '{}') as branch_ids,
      coalesce((select array_agg(service_id) from service_staff x where x.staff_id = s.id), '{}') as service_ids
    from staff_profiles s where s.id = ${id}`;
  if (!s) throw notFound('staff');
  return s;
}

async function writeAssignments(tx: Tx, ctx: TenantContext, staffId: string, input: z.infer<typeof staffInput>) {
  await tx`delete from staff_branch_assignments where staff_id = ${staffId}`;
  for (const b of new Set(input.branchIds)) await tx`insert into staff_branch_assignments (tenant_id, staff_id, branch_id) values (${ctx.tenant.id}, ${staffId}, ${b})`;
  await tx`delete from service_staff where staff_id = ${staffId}`;
  for (const s of new Set(input.serviceIds)) await tx`insert into service_staff (tenant_id, service_id, staff_id) values (${ctx.tenant.id}, ${s}, ${staffId})`;
}

export async function createStaff(tx: Tx, ctx: TenantContext, input: z.infer<typeof staffInput>) {
  const ent = await entitlements(tx, ctx.tenant.id);
  const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from staff_profiles where status = 'active'`;
  requireBelowLimit(ent, 'staff.max', n);
  const [s] = await tx<{ id: string }[]>`
    insert into staff_profiles (tenant_id, display_name, display_name_en, specialty, bio, photo_asset_id, public_visible, allocation_weight, sort)
    values (${ctx.tenant.id}, ${input.displayName}, ${input.displayNameEn ?? null}, ${input.specialty ?? null}, ${input.bio ?? null},
            ${input.photoAssetId ?? null}, ${input.publicVisible}, ${input.allocationWeight},
            (select coalesce(max(sort), 0) + 1 from staff_profiles))
    returning id`;
  await writeAssignments(tx, ctx, s.id, input);
  await audit(tx, { ...act(ctx), action: 'staff.created', targetType: 'staff', targetId: s.id });
  return s;
}

export async function updateStaff(tx: Tx, ctx: TenantContext, id: string, input: z.infer<typeof staffInput>, expectedVersion: number) {
  const [cur] = await tx<{ version: number }[]>`select version from staff_profiles where id = ${id} for update`;
  if (!cur) throw notFound('staff');
  if (cur.version !== expectedVersion) throw new AppError('version_conflict', 'errors.version_conflict');
  await tx`update staff_profiles set display_name = ${input.displayName}, display_name_en = ${input.displayNameEn ?? null},
           specialty = ${input.specialty ?? null}, bio = ${input.bio ?? null}, photo_asset_id = ${input.photoAssetId ?? null},
           public_visible = ${input.publicVisible}, allocation_weight = ${input.allocationWeight}, version = version + 1, updated_at = now()
           where id = ${id}`;
  await writeAssignments(tx, ctx, id, input);
  await audit(tx, { ...act(ctx), action: 'staff.updated', targetType: 'staff', targetId: id });
  return { version: cur.version + 1 };
}

/** A specialist edits only allowed fields of her OWN profile. */
export async function updateOwnProfile(tx: Tx, ctx: TenantContext, input: z.infer<typeof selfProfileInput>) {
  if (!ctx.staffProfileId || !ctx.caps.has('staff.self_profile')) throw forbidden();
  await tx`update staff_profiles set bio = coalesce(${input.bio ?? null}, bio), photo_asset_id = case when ${input.photoAssetId !== undefined} then ${input.photoAssetId ?? null}::uuid else photo_asset_id end,
           display_name_en = coalesce(${input.displayNameEn ?? null}, display_name_en), version = version + 1, updated_at = now()
           where id = ${ctx.staffProfileId}`;
  await audit(tx, { ...act(ctx), action: 'staff.self_updated', targetType: 'staff', targetId: ctx.staffProfileId });
}

/** Future, still-active bookings assigned to a staff member (for leave/deactivation impact). */
export async function futureAssignments(tx: Tx, staffId: string, from: Date = new Date(), to?: Date) {
  return tx<{ bookingId: string; number: string; startsAt: Date; serviceName: string; status: string }[]>`
    select b.id as booking_id, b.number, i.starts_at, i.service_name, b.status
    from booking_items i join bookings b on b.tenant_id = i.tenant_id and b.id = i.booking_id
    where i.staff_id = ${staffId} and i.status = 'active' and i.ends_at > ${from}
      and (${to ?? null}::timestamptz is null or i.starts_at < ${to ?? null}::timestamptz)
      and b.status in ('held','pending_payment','confirmed','checked_in')
    order by i.starts_at`;
}

/**
 * Deactivate/archive preserves all history. Future appointments are NOT
 * silently cancelled: management gets a notification listing them.
 */
export async function setStaffStatus(tx: Tx, ctx: TenantContext, id: string, status: 'active' | 'inactive' | 'archived') {
  const r = await tx`update staff_profiles set status = ${status}, version = version + 1, updated_at = now() where id = ${id} returning id`;
  if (!r.length) throw notFound('staff');
  let affected: { bookingId: string; number: string; startsAt: Date; serviceName: string; status: string }[] = [];
  if (status !== 'active') {
    affected = await futureAssignments(tx, id);
    if (affected.length) {
      await notifyTenantRoles(tx, ctx.tenant.id, ['owner', 'manager'], {
        type: 'staff.future_bookings_need_action',
        title: 'staff.notice_future_bookings',
        body: `${affected.length}`,
        targetPath: `/app/${ctx.tenant.slug}/bookings?staff=${id}&from=now`,
        dedupeKey: `staff-deact:${id}:${new Date().toISOString().slice(0, 10)}`,
      });
    }
  }
  await audit(tx, { ...act(ctx), action: `staff.${status}`, targetType: 'staff', targetId: id, metadata: { futureBookings: affected.length } });
  return { affectedBookings: affected };
}

// ── schedules ──
export async function getWeeklyHours(tx: Tx, branchId: string, staffId: string | null) {
  const hours = await tx<{ weekday: number; startTime: string; endTime: string }[]>`
    select weekday, to_char(start_time, 'HH24:MI') as start_time, to_char(end_time, 'HH24:MI') as end_time from working_hours
    where branch_id = ${branchId} and (staff_id is not distinct from ${staffId}::uuid) order by weekday, start_time`;
  const breaks = staffId
    ? await tx<{ weekday: number; startTime: string; endTime: string; label: string | null }[]>`
        select weekday, to_char(start_time, 'HH24:MI') as start_time, to_char(end_time, 'HH24:MI') as end_time, label
        from breaks where staff_id = ${staffId} and weekday is not null order by weekday, start_time`
    : [];
  return { hours, breaks };
}

function assertNoOverlap(ranges: { start: string; end: string }[]) {
  const s = [...ranges].sort((a, b) => a.start.localeCompare(b.start));
  for (let i = 0; i < s.length; i++) {
    if (s[i].end <= s[i].start) throw new AppError('validation', 'errors.time_range_invalid');
    if (i && s[i].start < s[i - 1].end) throw new AppError('validation', 'errors.time_range_overlap');
  }
}

export async function setWeeklyHours(tx: Tx, ctx: TenantContext, input: z.infer<typeof weeklyHoursInput>) {
  for (const d of input.days) assertNoOverlap(d.ranges);
  await tx`delete from working_hours where branch_id = ${input.branchId} and (staff_id is not distinct from ${input.staffId}::uuid)`;
  for (const d of input.days) {
    for (const r of d.ranges) {
      await tx`insert into working_hours (tenant_id, branch_id, staff_id, weekday, start_time, end_time)
               values (${ctx.tenant.id}, ${input.branchId}, ${input.staffId}, ${d.weekday}, ${r.start}, ${r.end})`;
    }
  }
  if (input.staffId) {
    await tx`delete from breaks where staff_id = ${input.staffId} and weekday is not null`;
    for (const b of input.breaks) {
      const day = input.days.find((d) => d.weekday === b.weekday);
      if (!day?.ranges.some((r) => b.start >= r.start && b.end <= r.end)) throw new AppError('validation', 'errors.break_outside_shift');
      await tx`insert into breaks (tenant_id, staff_id, weekday, start_time, end_time, label)
               values (${ctx.tenant.id}, ${input.staffId}, ${b.weekday}, ${b.start}, ${b.end}, ${b.label ?? null})`;
    }
  }
  await audit(tx, { ...act(ctx), action: 'schedule.weekly_set', targetType: input.staffId ? 'staff' : 'branch', targetId: input.staffId ?? input.branchId });
}

export async function addOverride(tx: Tx, ctx: TenantContext, input: z.infer<typeof overrideInput>) {
  if (input.kind === 'custom' && (!input.start || !input.end || input.end <= input.start)) throw new AppError('validation', 'errors.time_range_invalid');
  const [o] = await tx<{ id: string }[]>`
    insert into shift_overrides (tenant_id, branch_id, staff_id, on_date, kind, start_time, end_time, note, created_by)
    values (${ctx.tenant.id}, ${input.branchId}, ${input.staffId}, ${input.onDate}, ${input.kind},
            ${input.kind === 'custom' ? input.start! : null}, ${input.kind === 'custom' ? input.end! : null}, ${input.note ?? null}, ${ctx.user.userId})
    returning id`;
  await audit(tx, { ...act(ctx), action: 'schedule.override_added', targetType: 'override', targetId: o.id, metadata: { date: input.onDate, kind: input.kind } });
  return o;
}

export async function listOverrides(tx: Tx, branchId: string, from: string, to: string) {
  return tx`select id, staff_id, to_char(on_date, 'YYYY-MM-DD') as on_date, kind, to_char(start_time, 'HH24:MI') as start_time,
              to_char(end_time, 'HH24:MI') as end_time, note
            from shift_overrides where branch_id = ${branchId} and on_date between ${from} and ${to} order by on_date`;
}

export async function removeOverride(tx: Tx, ctx: TenantContext, id: string) {
  const r = await tx`delete from shift_overrides where id = ${id} returning id`;
  if (!r.length) throw notFound('override');
  await audit(tx, { ...act(ctx), action: 'schedule.override_removed', targetType: 'override', targetId: id });
}

export async function addBlockedTime(tx: Tx, ctx: TenantContext, input: z.infer<typeof blockedTimeInput>) {
  if (new Date(input.endsAt) <= new Date(input.startsAt)) throw new AppError('validation', 'errors.time_range_invalid');
  const [b] = await tx<{ id: string }[]>`
    insert into blocked_times (tenant_id, staff_id, during, reason, created_by)
    values (${ctx.tenant.id}, ${input.staffId}, tstzrange(${input.startsAt}, ${input.endsAt}, '[)'), ${input.reason ?? null}, ${ctx.user.userId})
    returning id`;
  await audit(tx, { ...act(ctx), action: 'schedule.blocked', targetType: 'staff', targetId: input.staffId });
  return b;
}

// ── leave ──
export async function requestLeave(tx: Tx, ctx: TenantContext, input: z.infer<typeof leaveInput>) {
  const self = ctx.staffProfileId === input.staffId;
  if (!self && !ctx.caps.has('hr.manage')) throw forbidden();
  if (self && !ctx.caps.has('hr.self') && !ctx.caps.has('hr.manage')) throw forbidden();
  if (new Date(input.endsAt) <= new Date(input.startsAt)) throw new AppError('validation', 'errors.time_range_invalid');
  const [l] = await tx<{ id: string }[]>`
    insert into leave_requests (tenant_id, staff_id, starts_at, ends_at, type, reason, requested_by)
    values (${ctx.tenant.id}, ${input.staffId}, ${input.startsAt}, ${input.endsAt}, ${input.type}, ${input.reason ?? null}, ${ctx.user.userId})
    returning id`;
  const conflicts = await futureAssignments(tx, input.staffId, new Date(input.startsAt), new Date(input.endsAt));
  if (self) {
    await notifyTenantRoles(tx, ctx.tenant.id, ['owner', 'manager'], {
      type: 'leave.requested',
      title: 'leave.notice_requested',
      targetPath: `/app/${ctx.tenant.slug}/team?tab=leave`,
      dedupeKey: `leave:${l.id}`,
    });
  }
  await audit(tx, { ...act(ctx), action: 'leave.requested', targetType: 'leave', targetId: l.id, metadata: { conflicts: conflicts.length } });
  return { id: l.id, conflicts };
}

/**
 * Approving leave does NOT auto-cancel customers' appointments: overlapping
 * bookings are returned and flagged so management can reassign/reschedule.
 * Pending leave never blocks availability; approved leave does.
 */
export async function decideLeave(tx: Tx, ctx: TenantContext, id: string, decision: 'approved' | 'rejected' | 'cancelled', note?: string) {
  const [l] = await tx<{ staffId: string; startsAt: Date; endsAt: Date; status: string; requestedBy: string | null }[]>`
    select staff_id, starts_at, ends_at, status, requested_by from leave_requests where id = ${id} for update`;
  if (!l) throw notFound('leave');
  if (decision === 'cancelled') {
    const own = ctx.staffProfileId === l.staffId;
    if (!own && !ctx.caps.has('hr.manage')) throw forbidden();
    if (l.status !== 'pending' && !(ctx.caps.has('hr.manage') && l.status === 'approved')) throw new AppError('invalid_transition', 'errors.invalid_transition');
  } else {
    if (!ctx.caps.has('hr.manage')) throw forbidden();
    if (l.status !== 'pending') throw new AppError('invalid_transition', 'errors.invalid_transition');
  }
  // serialize against concurrent holds on this staff member
  await tx`select id from staff_profiles where id = ${l.staffId} for update`;
  await tx`update leave_requests set status = ${decision}, reviewed_by = ${ctx.user.userId}, reviewed_at = now(), review_note = ${note ?? null} where id = ${id}`;
  const conflicts = decision === 'approved' ? await futureAssignments(tx, l.staffId, l.startsAt, l.endsAt) : [];
  if (l.requestedBy && l.requestedBy !== ctx.user.userId) {
    const { notifyUser } = await import('./notifications');
    await notifyUser(tx, l.requestedBy, ctx.tenant.id, { type: `leave.${decision}`, title: `leave.notice_${decision}`, targetPath: '/staff', dedupeKey: `leave-decision:${id}` });
  }
  await audit(tx, { ...act(ctx), action: `leave.${decision}`, targetType: 'leave', targetId: id, metadata: { conflicts: conflicts.length } });
  return { conflicts };
}

export async function listLeave(tx: Tx, opts: { staffId?: string; status?: string } = {}) {
  return tx`select l.id, l.staff_id, s.display_name as staff_name, l.starts_at, l.ends_at, l.type, l.status, l.reason, l.review_note, l.created_at
            from leave_requests l join staff_profiles s on s.id = l.staff_id
            where (${opts.staffId ?? null}::uuid is null or l.staff_id = ${opts.staffId ?? null}::uuid)
              and (${opts.status ?? null}::text is null or l.status = ${opts.status ?? null})
            order by l.starts_at desc limit 200`;
}

// ── attendance ──
export async function clock(tx: Tx, ctx: TenantContext, kind: 'clock_in' | 'clock_out', staffId?: string) {
  const target = staffId ?? ctx.staffProfileId;
  if (!target) throw forbidden();
  if (target !== ctx.staffProfileId && !ctx.caps.has('hr.manage')) throw forbidden();
  if (target === ctx.staffProfileId && !ctx.caps.has('hr.self')) throw forbidden();
  const [last] = await tx<{ kind: string }[]>`select kind from attendance_events where staff_id = ${target} order by at desc limit 1`;
  if (last?.kind === kind) throw new AppError('invalid_transition', kind === 'clock_in' ? 'errors.already_clocked_in' : 'errors.not_clocked_in');
  if (!last && kind === 'clock_out') throw new AppError('invalid_transition', 'errors.not_clocked_in');
  const [e] = await tx<{ id: string; at: Date }[]>`
    insert into attendance_events (tenant_id, staff_id, kind, source, recorded_by)
    values (${ctx.tenant.id}, ${target}, ${kind}, ${target === ctx.staffProfileId ? 'portal' : 'manager'}, ${ctx.user.userId})
    returning id, at`;
  return e;
}

export async function attendanceFor(tx: Tx, staffId: string, from: Date, to: Date) {
  return tx`select id, kind, at, source, note from attendance_events where staff_id = ${staffId} and at between ${from} and ${to} order by at`;
}
