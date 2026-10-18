import { z } from 'zod';
import type { Tx } from '../db';
import { AppError, forbidden, notFound } from '../errors';
import { audit } from '../audit';
import { loadPolicy } from '../booking/availability';
import { nextNumber } from '../booking/service';
import { computePaymentTerms, type TermKind } from '../booking/terms';
import { MIN } from '../booking/intervals';
import type { TenantContext } from '../tenancy/context';
import { entitlements, requireFeature, requireLive } from '../tenancy/plan';

/**
 * Group sessions (classes/workshops) with shared capacity.
 *  - The instructor/specialist (and optional resource) is allocated ONCE for the
 *    session via booking_allocations(group_session_id) — individual bookings
 *    can never overlap it (same EXCLUDE constraints).
 *  - Joining locks the session row FOR UPDATE; seats_taken ≤ capacity is also a
 *    CHECK, so concurrent joins beyond capacity fail.
 *  - Each participant gets an ordinary booking (status/financial lifecycle) with
 *    one item pointing at the session; seats are released on leave/cancel/expiry.
 */
export const sessionInput = z.object({
  branchId: z.string().uuid(),
  serviceId: z.string().uuid(),
  staffId: z.string().uuid(),
  resourceId: z.string().uuid().nullable().optional(),
  startsAt: z.string().datetime({ offset: true }),
  capacity: z.number().int().min(1).max(200).optional(),
  priceMinor: z.number().int().min(0).max(100_000_000).optional(),
});

export async function createGroupSession(tx: Tx, ctx: TenantContext, input: z.infer<typeof sessionInput>) {
  if (!ctx.caps.has('schedule.manage') && !ctx.caps.has('catalog.manage')) throw forbidden();
  requireFeature(await entitlements(tx, ctx.tenant.id), 'group_sessions.enabled');
  const [svc] = await tx<{ id: string; durationMin: number; bufferBeforeMin: number; bufferAfterMin: number; groupCapacity: number | null; priceMinor: number; status: string }[]>`
    select id, duration_min, buffer_before_min, buffer_after_min, group_capacity, price_minor, status from services where id = ${input.serviceId}`;
  if (!svc || svc.status !== 'active') throw notFound('service');
  if (!svc.groupCapacity) throw new AppError('validation', 'errors.not_group_service');
  const [q] = await tx`select 1 from service_staff where service_id = ${svc.id} and staff_id = ${input.staffId}`;
  if (!q) throw new AppError('validation', 'errors.staff_not_qualified');
  const start = new Date(input.startsAt);
  if (+start <= Date.now()) throw new AppError('validation', 'errors.slot_outside_window');
  const end = new Date(+start + svc.durationMin * MIN);
  const capacity = Math.min(input.capacity ?? svc.groupCapacity, svc.groupCapacity);
  const [g] = await tx<{ id: string }[]>`
    insert into group_sessions (tenant_id, branch_id, service_id, staff_id, resource_id, starts_at, ends_at, capacity, price_minor, created_by)
    values (${ctx.tenant.id}, ${input.branchId}, ${svc.id}, ${input.staffId}, ${input.resourceId ?? null}, ${start}, ${end}, ${capacity},
            ${input.priceMinor ?? svc.priceMinor}, ${ctx.user.userId})
    returning id`;
  const occ = `[${new Date(+start - svc.bufferBeforeMin * MIN).toISOString()},${new Date(+end + svc.bufferAfterMin * MIN).toISOString()})`;
  // EXCLUDE constraints reject overlap with existing bookings/sessions (→ slot_unavailable)
  await tx`insert into booking_allocations (tenant_id, group_session_id, staff_id, during) values (${ctx.tenant.id}, ${g.id}, ${input.staffId}, ${occ}::tstzrange)`;
  if (input.resourceId) {
    await tx`insert into booking_allocations (tenant_id, group_session_id, resource_id, during) values (${ctx.tenant.id}, ${g.id}, ${input.resourceId}, ${occ}::tstzrange)`;
  }
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: 'group_session.created', targetType: 'group_session', targetId: g.id, requestId: ctx.requestId, metadata: { capacity } });
  return { id: g.id };
}

export async function cancelGroupSession(tx: Tx, ctx: TenantContext, id: string, reason: string) {
  if (!ctx.caps.has('schedule.manage')) throw forbidden();
  if (!reason.trim()) throw new AppError('validation', 'errors.reason_required');
  const [g] = await tx<{ status: string }[]>`select status from group_sessions where id = ${id} for update`;
  if (!g) throw notFound('group_session');
  if (g.status !== 'scheduled') throw new AppError('invalid_transition', 'errors.invalid_transition');
  await tx`update group_sessions set status = 'cancelled' where id = ${id}`;
  await tx`update booking_allocations set active = false, released_at = now(), release_reason = 'session_cancelled' where group_session_id = ${id} and active`;
  // participants' bookings are cancelled through the normal lifecycle (refunds per terms: business cancellation → full)
  const { transition } = await import('../booking/service');
  const parts = await tx<{ bookingId: string; status: string }[]>`
    select gb.booking_id, b.status from group_session_bookings gb join bookings b on b.id = gb.booking_id where gb.group_session_id = ${id} and gb.status = 'active'`;
  for (const p of parts) {
    if (['held', 'pending_payment', 'confirmed', 'checked_in'].includes(p.status)) {
      await transition(tx, { kind: 'staff', ctx }, p.bookingId, 'cancelled', { reason: `group session cancelled: ${reason}` });
    }
  }
  await tx`update group_session_bookings set status = 'released' where group_session_id = ${id}`;
  await tx`update group_sessions set seats_taken = 0 where id = ${id}`;
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: 'group_session.cancelled', targetType: 'group_session', targetId: id, requestId: ctx.requestId, reason });
}

export interface JoinInput {
  sessionId: string;
  seats: number;
  termsKind: TermKind;
  tenantCustomerId: string;
  customerUserId: string | null;
  createdBy: string | null;
  source: 'online' | 'staff';
}

export async function joinGroupSession(tx: Tx, tenantId: string, input: JoinInput) {
  const ent = await entitlements(tx, tenantId);
  requireLive(ent);
  requireFeature(ent, 'group_sessions.enabled');
  if (input.seats < 1 || input.seats > 10) throw new AppError('validation', 'errors.validation');
  const [g] = await tx<{ id: string; branchId: string; serviceId: string; staffId: string; startsAt: Date; endsAt: Date; capacity: number; seatsTaken: number; priceMinor: number; status: string }[]>`
    select id, branch_id, service_id, staff_id, starts_at, ends_at, capacity, seats_taken, price_minor, status from group_sessions where id = ${input.sessionId} for update`;
  if (!g) throw notFound('group_session');
  if (g.status !== 'scheduled' || +g.startsAt <= Date.now()) throw new AppError('invalid_transition', 'errors.session_closed');
  if (g.seatsTaken + input.seats > g.capacity) throw new AppError('slot_unavailable', 'errors.group_full', { seatsLeft: g.capacity - g.seatsTaken });
  if (input.customerUserId) {
    const dup = await tx`select 1 from group_session_bookings gb join bookings b on b.id = gb.booking_id
                         where gb.tenant_id = ${tenantId} and b.tenant_id = ${tenantId} and gb.group_session_id = ${g.id} and gb.status = 'active' and b.customer_user_id = ${input.customerUserId}`;
    if (dup.length) throw new AppError('conflict', 'errors.already_joined');
  }
  const total = g.priceMinor * input.seats;
  const terms = await computePaymentTerms(tx, tenantId, input.customerUserId, total);
  if (terms.blocked) throw new AppError('forbidden', terms.customerExplanationKey);
  const option = terms.options.find((o) => o.kind === input.termsKind);
  if (!option) throw new AppError('payment_required', 'errors.terms_not_allowed', { allowed: terms.options.map((o) => o.kind) });
  const policy = await loadPolicy(tx);
  const online = input.termsKind === 'full' || input.termsKind === 'deposit';
  const holdExpires = online ? new Date(Date.now() + policy.holdMinutes * MIN) : null;
  const status = online || input.termsKind === 'manual_approval' ? 'held' : 'confirmed';
  const number = await nextNumber(tx, tenantId, 'booking', 'BKG');
  const [svc] = await tx<{ name: string; nameEn: string | null; durationMin: number }[]>`select name, name_en, duration_min from services where id = ${g.serviceId}`;
  const [st] = await tx<{ displayName: string }[]>`select display_name from staff_profiles where id = ${g.staffId}`;
  const snapshot = {
    terms,
    chosen: input.termsKind,
    groupSessionId: g.id,
    seats: input.seats,
    policy: {
      version: policy.version,
      cancellationWindowHours: policy.cancellationWindowHours,
      lateCancelFeeBps: (policy.raw as { lateCancelFeeBps: number }).lateCancelFeeBps,
      noShowGraceMin: policy.noShowGraceMin,
      noShowFeeBps: (policy.raw as { noShowFeeBps: number }).noShowFeeBps,
    },
  };
  const [b] = await tx<{ id: string }[]>`
    insert into bookings (tenant_id, branch_id, number, tenant_customer_id, customer_user_id, status, financial_status, source, starts_at, ends_at,
      subtotal_minor, total_minor, deposit_due_minor, payment_terms, terms_snapshot, hold_expires_at, created_by)
    values (${tenantId}, ${g.branchId}, ${number}, ${input.tenantCustomerId}, ${input.customerUserId}, ${status}, ${total === 0 ? 'not_required' : 'unpaid'},
      ${input.source}, ${g.startsAt}, ${g.endsAt}, ${total}, ${total}, ${input.termsKind === 'deposit' ? option.dueNowMinor : input.termsKind === 'full' ? total : 0},
      ${input.termsKind}, ${tx.json(snapshot as never)}, ${holdExpires}, ${input.createdBy})
    returning id`;
  await tx`insert into booking_items (tenant_id, booking_id, seq, service_id, staff_id, group_session_id, service_name, service_name_en, staff_name,
             price_minor, duration_min, starts_at, ends_at)
           values (${tenantId}, ${b.id}, 0, ${g.serviceId}, ${g.staffId}, ${g.id}, ${svc.name}, ${svc.nameEn}, ${st.displayName}, ${total},
             ${svc.durationMin}, ${g.startsAt}, ${g.endsAt})`;
  await tx`update group_sessions set seats_taken = seats_taken + ${input.seats} where id = ${g.id}`;
  await tx`insert into group_session_bookings (tenant_id, group_session_id, booking_id, seats) values (${tenantId}, ${g.id}, ${b.id}, ${input.seats})`;
  await tx`insert into booking_events (tenant_id, booking_id, to_status, kind, actor_user_id, source, data)
           values (${tenantId}, ${b.id}, ${status}, 'transition', ${input.createdBy}, ${input.source}, ${tx.json({ groupSessionId: g.id, seats: input.seats } as never)})`;
  return { bookingId: b.id, number, status, totalMinor: total, dueNowMinor: option.dueNowMinor, holdExpiresAt: holdExpires };
}

/** Release the seat of a booking (leave, cancellation, expiry). Exactly once. */
export async function releaseSeat(tx: Tx, bookingId: string) {
  const [gb] = await tx<{ groupSessionId: string; seats: number }[]>`
    update group_session_bookings set status = 'released' where booking_id = ${bookingId} and status = 'active' returning group_session_id, seats`;
  if (!gb) return false;
  await tx`select id from group_sessions where id = ${gb.groupSessionId} for update`;
  await tx`update group_sessions set seats_taken = greatest(seats_taken - ${gb.seats}, 0) where id = ${gb.groupSessionId}`;
  return true;
}

/** Job: free seats held by bookings that ended up cancelled or expired. */
export async function releaseDeadSeats(tx: Tx) {
  const dead = await tx<{ bookingId: string }[]>`
    select gb.booking_id from group_session_bookings gb join bookings b on b.id = gb.booking_id
    where gb.status = 'active' and (b.status in ('cancelled','expired') or (b.status in ('held','pending_payment') and b.hold_expires_at <= now()))`;
  for (const d of dead) {
    await tx`update bookings set status = 'expired', version = version + 1 where id = ${d.bookingId} and status in ('held','pending_payment') and hold_expires_at <= now()`;
    await releaseSeat(tx, d.bookingId);
  }
  return { released: dead.length };
}

export async function listSessions(tx: Tx, opts: { from?: Date } = {}) {
  return tx`select g.id, g.starts_at, g.ends_at, g.capacity, g.seats_taken, g.price_minor, g.status, s.name as service_name, sp.display_name as staff_name, r.name as resource_name
            from group_sessions g join services s on s.id = g.service_id join staff_profiles sp on sp.id = g.staff_id left join resources r on r.id = g.resource_id
            where g.starts_at >= ${opts.from ?? new Date(Date.now() - 86400000)} order by g.starts_at limit 200`;
}

export async function sessionParticipants(tx: Tx, id: string) {
  return tx`select b.id as booking_id, b.number, b.status, b.financial_status, gb.seats, c.display_name
            from group_session_bookings gb join bookings b on b.id = gb.booking_id join tenant_customers c on c.id = b.tenant_customer_id
            where gb.group_session_id = ${id} and gb.status = 'active' order by b.created_at`;
}

/** Public: upcoming sessions with seats left (no participant data). */
export async function publicSessions(tx: Tx) {
  return tx`select g.id, g.starts_at, g.ends_at, g.capacity - g.seats_taken as seats_left, g.price_minor, s.name as service_name, s.name_en as service_name_en,
              case when sp.public_visible then sp.display_name else '' end as staff_name
            from group_sessions g join services s on s.id = g.service_id join staff_profiles sp on sp.id = g.staff_id
            where g.status = 'scheduled' and g.starts_at > now() and s.is_visible order by g.starts_at limit 50`;
}
