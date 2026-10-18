import { z } from 'zod';
import type { Tx } from '../db';
import { AppError, forbidden, notFound } from '../errors';
import { audit, type ActorKind } from '../audit';
import { emitOutbox } from '../jobs';
import type { TenantContext } from '../tenancy/context';
import { MIN } from './intervals';
import { loadPolicy, verifyItinerary, type ChosenItem } from './availability';
import { computePaymentTerms, type ComputedTerms, type TermKind } from './terms';
import { notifyTenantRoles, notifyUser, recordDelivery } from '../services/notifications';

/** Who is acting. Staff actors come with a verified tenant context; customers with their own user id. */
export type Actor =
  | { kind: 'staff'; ctx: TenantContext }
  | { kind: 'customer'; userId: string; tenantId: string }
  | { kind: 'system'; tenantId: string; reason: string };

const actorUserId = (a: Actor) => (a.kind === 'staff' ? a.ctx.user.userId : a.kind === 'customer' ? a.userId : null);
const actorKind = (a: Actor): ActorKind => (a.kind === 'staff' ? a.ctx.actorKind : a.kind === 'customer' ? 'customer' : 'system');
const tenantOf = (a: Actor) => (a.kind === 'staff' ? a.ctx.tenant.id : a.tenantId);
const requestIdOf = (a: Actor) => (a.kind === 'staff' ? a.ctx.requestId : undefined);

export const chosenItemSchema = z.object({
  serviceId: z.string().uuid(),
  variantId: z.string().uuid().nullable().optional(),
  addonIds: z.array(z.string().uuid()).max(10).default([]),
  staffId: z.string().uuid(),
  startsAt: z.string().datetime({ offset: true }),
});

export const holdInput = z.object({
  branchId: z.string().uuid(),
  items: z.array(chosenItemSchema).min(1).max(5),
  termsKind: z.enum(['full', 'deposit', 'on_site', 'manual_approval']),
  customerNote: z.string().max(1000).optional(),
});

export async function nextNumber(tx: Tx, tenantId: string, name: string, prefix: string): Promise<string> {
  const [r] = await tx<{ value: number }[]>`
    insert into tenant_counters (tenant_id, name, value) values (${tenantId}, ${name}, 1)
    on conflict (tenant_id, name) do update set value = tenant_counters.value + 1
    returning value`;
  return `${prefix}-${String(r.value).padStart(6, '0')}`;
}

/**
 * The business-local relationship with a central customer. Created on first
 * interaction; a business never sees the customer's activity at other salons.
 */
export async function ensureTenantCustomer(tx: Tx, tenantId: string, c: { userId?: string | null; displayName: string; phone?: string | null; email?: string | null; source?: string }) {
  if (c.userId) {
    // explicit tenant filter: customer_self_read RLS also exposes her rows at other businesses
    const [ex] = await tx<{ id: string }[]>`select id from tenant_customers where tenant_id = ${tenantId} and user_id = ${c.userId}`;
    if (ex) return ex.id;
  }
  const [r] = await tx<{ id: string }[]>`
    insert into tenant_customers (tenant_id, user_id, display_name, phone, email, source)
    values (${tenantId}, ${c.userId ?? null}, ${c.displayName}, ${c.phone ?? null}, ${c.email ?? null}, ${c.source ?? 'online'})
    on conflict (tenant_id, user_id) where user_id is not null do update set display_name = tenant_customers.display_name
    returning id`;
  return r.id;
}

/** Release expired holds touching these staff/resources (inside the allocating txn). */
async function sweepExpiredFor(tx: Tx, staffIds: string[], resourceIds: string[]) {
  const expired = await tx<{ bookingId: string }[]>`
    update booking_allocations set active = false, released_at = now(), release_reason = 'hold_expired'
    where active and expires_at is not null and expires_at <= now()
      and (staff_id = any(${staffIds}::uuid[]) or resource_id = any(${resourceIds}::uuid[]))
    returning booking_id`;
  const ids = [...new Set(expired.map((e) => e.bookingId).filter(Boolean))];
  if (ids.length) await expireBookings(tx, ids);
}

async function expireBookings(tx: Tx, ids: string[]) {
  const rows = await tx<{ id: string; tenantId: string; status: string }[]>`
    update bookings set status = 'expired', version = version + 1
    where id = any(${ids}::uuid[]) and status in ('held','pending_payment') and hold_expires_at <= now()
    returning id, tenant_id, status`;
  for (const r of rows) {
    await tx`update booking_allocations set active = false, released_at = now(), release_reason = 'hold_expired' where booking_id = ${r.id} and active`;
    await tx`insert into booking_events (tenant_id, booking_id, from_status, to_status, kind, source) values (${r.tenantId}, ${r.id}, 'held', 'expired', 'transition', 'system')`;
  }
}

/** Periodic sweep (job): expire holds whose time has passed. */
export async function sweepExpiredHolds(tx: Tx) {
  const ids = await tx<{ id: string }[]>`select id from bookings where status in ('held','pending_payment') and hold_expires_at <= now() limit 500`;
  if (ids.length) await expireBookings(tx, ids.map((x) => x.id));
  return { expired: ids.length };
}

export interface HoldResult {
  bookingId: string;
  number: string;
  status: string;
  holdExpiresAt: Date;
  totalMinor: number;
  dueNowMinor: number;
  termsKind: TermKind;
  terms: ComputedTerms;
}

/**
 * Creates a hold atomically: revalidates the exact itinerary, recomputes price
 * and payment terms on the server, and inserts allocations whose EXCLUDE
 * constraints guarantee a single winner under concurrency. Any failure rolls
 * back the whole operation (no partial multi-service bookings).
 */
export async function createHold(
  tx: Tx,
  actor: Actor,
  input: z.infer<typeof holdInput> & { tenantCustomerId: string; customerUserId: string | null; source: 'online' | 'staff' | 'walk_in' | 'waitlist' },
): Promise<HoldResult> {
  const tenantId = tenantOf(actor);
  const mode = actor.kind === 'customer' ? 'public' : 'internal';
  const items = [...input.items].sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  const staffIds = [...new Set(items.map((i) => i.staffId))].sort();
  // stable lock order; FOR SHARE serializes against leave approval (FOR UPDATE)
  await tx`select id from staff_profiles where id = any(${staffIds}::uuid[]) order by id for share`;
  await sweepExpiredFor(tx, staffIds, []);
  const { ec, planned } = await verifyItinerary(tx, tenantId, input.branchId, items as ChosenItem[], mode);
  const resourceIds = [...new Set(planned.flatMap((p) => p.resourceIds))];
  if (resourceIds.length) await sweepExpiredFor(tx, [], resourceIds);

  const subtotal = planned.reduce((n, p) => n + p.priceMinor, 0);
  const total = subtotal; // coupons/discounts are applied by the checkout step before terms (see commerce/coupons)
  const terms = await computePaymentTerms(tx, tenantId, input.customerUserId, total);
  if (terms.blocked) throw new AppError('forbidden', terms.customerExplanationKey, { fallback: terms.fallback });
  const option = terms.options.find((o) => o.kind === input.termsKind);
  // staff may record on-site terms for walk-ins only when the policy and decisions allow it — same rule
  if (!option) throw new AppError('payment_required', 'errors.terms_not_allowed', { allowed: terms.options.map((o) => o.kind), fallback: terms.fallback });

  const policy = await loadPolicy(tx);
  // manual approval waits for the business (up to 48h); other terms use the short policy hold
  const holdMs = input.termsKind === 'manual_approval' ? 48 * 60 * MIN : policy.holdMinutes * MIN;
  const holdExpiresAt = new Date(Date.now() + holdMs);
  const number = await nextNumber(tx, tenantId, 'booking', 'BKG');
  const snapshot = {
    terms,
    chosen: input.termsKind,
    policy: {
      version: policy.version,
      cancellationWindowHours: policy.cancellationWindowHours,
      lateCancelFeeBps: (policy.raw as { lateCancelFeeBps: number }).lateCancelFeeBps,
      noShowGraceMin: policy.noShowGraceMin,
      noShowFeeBps: (policy.raw as { noShowFeeBps: number }).noShowFeeBps,
      policyText: (policy.raw as { policyText: string | null }).policyText,
    },
    timezone: ec.timezone,
  };
  const [b] = await tx<{ id: string }[]>`
    insert into bookings (tenant_id, branch_id, number, tenant_customer_id, customer_user_id, status, financial_status, source,
      starts_at, ends_at, subtotal_minor, total_minor, deposit_due_minor, payment_terms, terms_snapshot, hold_expires_at, customer_note, created_by)
    values (${tenantId}, ${input.branchId}, ${number}, ${input.tenantCustomerId}, ${input.customerUserId}, 'held',
      ${total === 0 ? 'not_required' : 'unpaid'}, ${input.source}, ${new Date(planned[0].startsAt)}, ${new Date(planned[planned.length - 1].endsAt)},
      ${subtotal}, ${total}, ${input.termsKind === 'deposit' ? option.dueNowMinor : input.termsKind === 'full' ? total : 0},
      ${input.termsKind}, ${tx.json(snapshot as never)}, ${holdExpiresAt}, ${input.customerNote ?? null}, ${actorUserId(actor)})
    returning id`;

  // insert items, then allocations in a stable order (staff/resource id, time) to avoid deadlocks
  const allocs: { kind: 'staff' | 'resource'; id: string; itemId: string; s: number; e: number }[] = [];
  let seq = 0;
  for (const p of planned) {
    const staffName = ec.staff.get(p.staffId)!.name;
    const [it] = await tx<{ id: string }[]>`
      insert into booking_items (tenant_id, booking_id, seq, service_id, variant_id, staff_id, service_name, service_name_en, variant_name,
        staff_name, price_minor, addons, addons_minor, duration_min, buffer_before_min, buffer_after_min, starts_at, ends_at)
      values (${tenantId}, ${b.id}, ${seq++}, ${p.item.serviceId}, ${p.item.variantId}, ${p.staffId}, ${p.item.serviceName}, ${p.item.serviceNameEn},
        ${p.item.variantName}, ${staffName}, ${p.basePriceMinor}, ${tx.json(p.item.addons as never)},
        ${p.item.addons.reduce((n, a) => n + a.priceMinor, 0)}, ${p.durationMin}, ${p.item.bufferBeforeMin}, ${p.item.bufferAfterMin},
        ${new Date(p.startsAt)}, ${new Date(p.endsAt)})
      returning id`;
    allocs.push({ kind: 'staff', id: p.staffId, itemId: it.id, s: p.occStart, e: p.occEnd });
    for (const r of p.resourceIds) allocs.push({ kind: 'resource', id: r, itemId: it.id, s: p.occStart, e: p.occEnd });
  }
  allocs.sort((a, b) => a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id) || a.s - b.s);
  for (const a of allocs) {
    await tx`insert into booking_allocations (tenant_id, booking_id, booking_item_id, staff_id, resource_id, during, expires_at)
             values (${tenantId}, ${b.id}, ${a.itemId}, ${a.kind === 'staff' ? a.id : null}, ${a.kind === 'resource' ? a.id : null},
                     tstzrange(${new Date(a.s)}, ${new Date(a.e)}, '[)'), ${holdExpiresAt})`;
  }
  await tx`insert into booking_events (tenant_id, booking_id, to_status, kind, actor_user_id, source, data)
           values (${tenantId}, ${b.id}, 'held', 'transition', ${actorUserId(actor)}, ${input.source}, ${tx.json({ terms: input.termsKind, total } as never)})`;
  await audit(tx, { actorUserId: actorUserId(actor), actorKind: actorKind(actor), tenantId, action: 'booking.held', targetType: 'booking', targetId: b.id, requestId: requestIdOf(actor), metadata: { number, total } });
  return { bookingId: b.id, number, status: 'held', holdExpiresAt, totalMinor: total, dueNowMinor: option.dueNowMinor, termsKind: input.termsKind, terms };
}

// ─────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────
export type BookingStatus = 'draft' | 'held' | 'pending_payment' | 'confirmed' | 'checked_in' | 'in_service' | 'completed' | 'expired' | 'cancelled' | 'no_show';
type Who = 'staff' | 'assigned' | 'customer' | 'system';

interface Rule {
  to: BookingStatus;
  who: Who[];
}

/** Server-side transition table: who may move a booking from → to. Guards live in transition(). */
export const TRANSITIONS: Record<string, Rule[]> = {
  held: [
    { to: 'confirmed', who: ['staff', 'customer', 'system'] },
    { to: 'pending_payment', who: ['customer', 'staff', 'system'] },
    { to: 'cancelled', who: ['staff', 'customer'] },
    { to: 'expired', who: ['system'] },
  ],
  pending_payment: [
    { to: 'confirmed', who: ['system'] },
    { to: 'cancelled', who: ['staff', 'customer'] },
    { to: 'expired', who: ['system'] },
  ],
  confirmed: [
    { to: 'checked_in', who: ['staff', 'assigned'] },
    { to: 'in_service', who: ['staff', 'assigned'] },
    { to: 'cancelled', who: ['staff', 'customer'] },
    { to: 'no_show', who: ['staff'] },
  ],
  checked_in: [
    { to: 'in_service', who: ['staff', 'assigned'] },
    { to: 'completed', who: ['staff', 'assigned'] },
    { to: 'cancelled', who: ['staff'] },
  ],
  in_service: [{ to: 'completed', who: ['staff', 'assigned'] }],
};

export interface BookingRow {
  id: string;
  tenantId: string;
  branchId: string;
  number: string;
  tenantCustomerId: string;
  customerUserId: string | null;
  status: BookingStatus;
  financialStatus: string;
  startsAt: Date;
  endsAt: Date;
  totalMinor: number;
  paidMinor: number;
  refundedMinor: number;
  depositDueMinor: number;
  paymentTerms: TermKind | 'none';
  termsSnapshot: { policy?: { cancellationWindowHours: number; lateCancelFeeBps: number; noShowGraceMin: number; noShowFeeBps: number }; terms?: ComputedTerms; chosen?: TermKind };
  holdExpiresAt: Date | null;
  version: number;
  source: string;
}

async function lockBooking(tx: Tx, id: string): Promise<BookingRow> {
  const [b] = await tx<BookingRow[]>`select * from bookings where id = ${id} for update`;
  if (!b) throw notFound('booking');
  return b;
}

async function whoIs(tx: Tx, actor: Actor, b: BookingRow): Promise<Who[]> {
  if (actor.kind === 'system') return ['system'];
  if (actor.kind === 'customer') return b.customerUserId === actor.userId ? ['customer'] : [];
  const ctx = actor.ctx;
  const out: Who[] = [];
  if (ctx.caps.has('bookings.manage')) out.push('staff');
  if (ctx.caps.has('bookings.view_assigned') && ctx.staffProfileId) {
    const [x] = await tx`select 1 from booking_items where booking_id = ${b.id} and staff_id = ${ctx.staffProfileId} limit 1`;
    if (x) out.push('assigned');
  }
  return out;
}

export interface TransitionOpts {
  reason?: string;
  now?: Date;
}

export async function transition(tx: Tx, actor: Actor, bookingId: string, to: BookingStatus, opts: TransitionOpts = {}) {
  const b = await lockBooking(tx, bookingId);
  const tenantId = b.tenantId;
  const who = await whoIs(tx, actor, b);
  if (!who.length) throw notFound('booking'); // not visible to this actor
  const rule = (TRANSITIONS[b.status] ?? []).find((r) => r.to === to);
  if (!rule) throw new AppError('invalid_transition', 'errors.invalid_transition', { from: b.status, to });
  if (!rule.who.some((w) => who.includes(w))) throw forbidden();
  const now = opts.now ?? new Date();
  const grace = b.termsSnapshot.policy?.noShowGraceMin ?? 15;

  // ── guards ──
  if (to === 'confirmed' && b.status === 'held') {
    if (b.holdExpiresAt && b.holdExpiresAt <= now) throw new AppError('slot_unavailable', 'errors.hold_expired');
    const kind = b.paymentTerms;
    if ((kind === 'full' || kind === 'deposit') && !who.includes('system')) throw new AppError('payment_required', 'errors.payment_required');
    if (kind === 'manual_approval' && !who.includes('staff')) throw new AppError('forbidden', 'errors.manual_approval_pending');
  }
  if (to === 'no_show' && +now < +b.startsAt + grace * MIN) throw new AppError('invalid_transition', 'errors.no_show_too_early', { allowedAfter: new Date(+b.startsAt + grace * MIN).toISOString() });
  if (to === 'checked_in' && +now < +b.startsAt - 3 * 60 * MIN) throw new AppError('invalid_transition', 'errors.check_in_too_early');
  if ((to === 'in_service' || to === 'completed') && +now < +b.startsAt - 60 * MIN) throw new AppError('invalid_transition', 'errors.too_early');
  if (to === 'cancelled' && who.includes('customer') && !who.includes('staff') && +now >= +b.startsAt) throw new AppError('invalid_transition', 'errors.cancel_after_start');
  if (to === 'cancelled' && !opts.reason?.trim() && !who.includes('customer')) throw new AppError('validation', 'errors.reason_required');

  const patch: Record<string, unknown> = {};
  if (to === 'confirmed') {
    await tx`update booking_allocations set expires_at = null where booking_id = ${b.id} and active`;
    patch.hold_expires_at = null;
  }
  if (to === 'checked_in') patch.checked_in_at = now;
  if (to === 'in_service') {
    patch.service_started_at = now;
    await tx`update booking_items set actual_start_at = coalesce(actual_start_at, ${now}) where booking_id = ${b.id} and status = 'active'`;
  }
  if (to === 'completed') {
    patch.completed_at = now;
    await tx`update booking_items set actual_start_at = coalesce(actual_start_at, ${b.startsAt}), actual_end_at = coalesce(actual_end_at, ${now}) where booking_id = ${b.id} and status = 'active'`;
  }
  if (to === 'no_show') patch.no_show_at = now;
  if (to === 'cancelled') {
    patch.cancelled_at = now;
    patch.cancelled_by = actorUserId(actor);
    patch.cancel_source = who.includes('customer') && !who.includes('staff') ? 'customer' : who.includes('system') ? 'system' : 'business';
    patch.cancel_reason = opts.reason ?? null;
  }
  if (['cancelled', 'no_show', 'expired'].includes(to)) {
    await tx`update booking_allocations set active = false, released_at = now(), release_reason = ${to} where booking_id = ${b.id} and active`;
  }
  // completion keeps the allocation (history of occupied time); nothing to release.

  await tx`update bookings set status = ${to}, version = version + 1,
    checked_in_at = coalesce(${(patch.checked_in_at as Date) ?? null}, checked_in_at),
    service_started_at = coalesce(${(patch.service_started_at as Date) ?? null}, service_started_at),
    completed_at = coalesce(${(patch.completed_at as Date) ?? null}, completed_at),
    no_show_at = coalesce(${(patch.no_show_at as Date) ?? null}, no_show_at),
    cancelled_at = coalesce(${(patch.cancelled_at as Date) ?? null}, cancelled_at),
    cancelled_by = coalesce(${(patch.cancelled_by as string) ?? null}::uuid, cancelled_by),
    cancel_source = coalesce(${(patch.cancel_source as string) ?? null}, cancel_source),
    cancel_reason = coalesce(${(patch.cancel_reason as string) ?? null}, cancel_reason),
    hold_expires_at = ${to === 'confirmed' ? null : b.holdExpiresAt}
    where id = ${b.id}`;
  await tx`insert into booking_events (tenant_id, booking_id, from_status, to_status, kind, actor_user_id, actor_role, source, reason)
           values (${tenantId}, ${b.id}, ${b.status}, ${to}, 'transition', ${actorUserId(actor)}, ${who.join(',')}, ${actor.kind}, ${opts.reason ?? null})`;
  await audit(tx, { actorUserId: actorUserId(actor), actorKind: actorKind(actor), tenantId, action: `booking.${to}`, targetType: 'booking', targetId: b.id, requestId: requestIdOf(actor), reason: opts.reason });
  await emitOutbox(tx, { tenantId, topic: `booking.${to}`, payload: { bookingId: b.id, from: b.status }, dedupeKey: `booking:${b.id}:${to}:${b.version}` });

  let refundDueMinor = 0;
  if (to === 'cancelled' || to === 'no_show') refundDueMinor = refundDue(b, to, patch.cancel_source as string | undefined, now);
  if (to === 'confirmed') await onConfirmed(tx, b);
  if (to === 'completed') {
    const { onBookingCompleted } = await import('./completion');
    await onBookingCompleted(tx, b.id, actorUserId(actor));
  }
  if ((to === 'cancelled' || to === 'no_show') && b.paidMinor > 0) {
    const { requestBookingRefund, retainedRevenue } = await import('../payments/service');
    if (refundDueMinor > 0) {
      await requestBookingRefund(tx, b.id, refundDueMinor, to === 'cancelled' ? `cancelled:${patch.cancel_source}` : 'no_show', actorUserId(actor));
    }
    await retainedRevenue(tx, b.id, b.paidMinor - refundDueMinor, actorUserId(actor));
  }
  return { status: to, refundDueMinor };
}

/** Refund owed under the terms captured at booking time. */
export function refundDue(b: Pick<BookingRow, 'paidMinor' | 'refundedMinor' | 'totalMinor' | 'startsAt' | 'termsSnapshot'>, to: 'cancelled' | 'no_show', source: string | undefined, now: Date): number {
  const paid = b.paidMinor - b.refundedMinor;
  if (paid <= 0) return 0;
  const p = b.termsSnapshot.policy ?? { cancellationWindowHours: 24, lateCancelFeeBps: 0, noShowGraceMin: 15, noShowFeeBps: 0 };
  if (to === 'cancelled' && source !== 'customer') return paid; // business/system cancellation → full refund
  let feeBps = 0;
  if (to === 'no_show') feeBps = p.noShowFeeBps;
  else if (+b.startsAt - +now < p.cancellationWindowHours * 60 * MIN) feeBps = p.lateCancelFeeBps;
  const fee = Math.floor((b.totalMinor * feeBps + 5000) / 10000);
  return Math.max(0, paid - Math.min(fee, paid));
}

async function onConfirmed(tx: Tx, b: BookingRow) {
  if (b.customerUserId) {
    await notifyUser(tx, b.customerUserId, b.tenantId, { type: 'booking.confirmed', title: 'booking.notice_confirmed', body: b.number, targetPath: `/account/bookings/${b.id}`, dedupeKey: `bk-confirmed:${b.id}` });
    await recordDelivery(tx, { tenantId: b.tenantId, channel: 'whatsapp', template: 'booking_confirmed', recipientUserId: b.customerUserId, dedupeKey: `bk-confirmed-wa:${b.id}` });
  }
  await notifyTenantRoles(tx, b.tenantId, ['owner', 'manager', 'receptionist'], { type: 'booking.new', title: 'booking.notice_new', body: b.number, targetPath: `/app/_/bookings/${b.id}`, dedupeKey: `bk-new:${b.id}` });
}

/** Customer-initiated or staff-initiated confirmation for on-site/manual terms. */
export async function confirmHold(tx: Tx, actor: Actor, bookingId: string) {
  return transition(tx, actor, bookingId, 'confirmed');
}

// ─────────────────────────────────────────────────────────────
// Reschedule: reserve replacement + release original atomically.
// If anything fails the transaction rolls back and the original stays intact.
// ─────────────────────────────────────────────────────────────
export const rescheduleInput = z.object({
  items: z.array(chosenItemSchema).min(1).max(5),
  acceptPriceChange: z.boolean().default(false),
  expectedVersion: z.number().int(),
});

export async function reschedule(tx: Tx, actor: Actor, bookingId: string, input: z.infer<typeof rescheduleInput>) {
  const b = await lockBooking(tx, bookingId);
  const who = await whoIs(tx, actor, b);
  if (!who.length) throw notFound('booking');
  if (!who.includes('staff') && !who.includes('customer')) throw forbidden();
  if (b.version !== input.expectedVersion) throw new AppError('version_conflict', 'errors.version_conflict');
  if (!['confirmed', 'held'].includes(b.status)) throw new AppError('invalid_transition', 'errors.invalid_transition');
  const now = new Date();
  if (who.includes('customer') && !who.includes('staff')) {
    const win = b.termsSnapshot.policy?.cancellationWindowHours ?? 24;
    if (+b.startsAt - +now < win * 60 * MIN) throw new AppError('invalid_transition', 'errors.reschedule_window_passed');
  }
  const items = [...input.items].sort((a, c) => +new Date(a.startsAt) - +new Date(c.startsAt));
  const staffIds = [...new Set(items.map((i) => i.staffId))].sort();
  await tx`select id from staff_profiles where id = any(${staffIds}::uuid[]) order by id for share`;
  await sweepExpiredFor(tx, staffIds, []);
  const { ec, planned } = await verifyItinerary(tx, b.tenantId, b.branchId, items as ChosenItem[], who.includes('staff') ? 'internal' : 'public', { excludeBookingId: b.id });
  const newTotal = planned.reduce((n, p) => n + p.priceMinor, 0);
  if (newTotal !== b.totalMinor && !input.acceptPriceChange) {
    throw new AppError('conflict', 'errors.reschedule_price_changed', { previousTotalMinor: b.totalMinor, newTotalMinor: newTotal });
  }
  // release original allocations, cancel original items, then insert the replacement
  await tx`update booking_allocations set active = false, released_at = now(), release_reason = 'rescheduled' where booking_id = ${b.id} and active`;
  await tx`update booking_items set status = 'cancelled' where booking_id = ${b.id} and status = 'active'`;
  const [{ maxSeq }] = await tx<{ maxSeq: number }[]>`select coalesce(max(seq), -1) as max_seq from booking_items where booking_id = ${b.id}`;
  let seq = maxSeq + 1;
  const expires = b.status === 'held' ? b.holdExpiresAt : null;
  const allocs: { kind: 'staff' | 'resource'; id: string; itemId: string; s: number; e: number }[] = [];
  for (const p of planned) {
    const [it] = await tx<{ id: string }[]>`
      insert into booking_items (tenant_id, booking_id, seq, service_id, variant_id, staff_id, service_name, service_name_en, variant_name,
        staff_name, price_minor, addons, addons_minor, duration_min, buffer_before_min, buffer_after_min, starts_at, ends_at)
      values (${b.tenantId}, ${b.id}, ${seq++}, ${p.item.serviceId}, ${p.item.variantId}, ${p.staffId}, ${p.item.serviceName}, ${p.item.serviceNameEn},
        ${p.item.variantName}, ${ec.staff.get(p.staffId)!.name}, ${p.basePriceMinor}, ${tx.json(p.item.addons as never)},
        ${p.item.addons.reduce((n, a) => n + a.priceMinor, 0)}, ${p.durationMin}, ${p.item.bufferBeforeMin}, ${p.item.bufferAfterMin},
        ${new Date(p.startsAt)}, ${new Date(p.endsAt)}) returning id`;
    allocs.push({ kind: 'staff', id: p.staffId, itemId: it.id, s: p.occStart, e: p.occEnd });
    for (const r of p.resourceIds) allocs.push({ kind: 'resource', id: r, itemId: it.id, s: p.occStart, e: p.occEnd });
  }
  allocs.sort((a, c) => a.kind.localeCompare(c.kind) || a.id.localeCompare(c.id) || a.s - c.s);
  for (const a of allocs) {
    await tx`insert into booking_allocations (tenant_id, booking_id, booking_item_id, staff_id, resource_id, during, expires_at)
             values (${b.tenantId}, ${b.id}, ${a.itemId}, ${a.kind === 'staff' ? a.id : null}, ${a.kind === 'resource' ? a.id : null},
                     tstzrange(${new Date(a.s)}, ${new Date(a.e)}, '[)'), ${expires})`;
  }
  const deposit = b.paymentTerms === 'deposit' ? Math.min(b.depositDueMinor, newTotal) : b.paymentTerms === 'full' ? newTotal : 0;
  await tx`update bookings set starts_at = ${new Date(planned[0].startsAt)}, ends_at = ${new Date(planned[planned.length - 1].endsAt)},
           subtotal_minor = ${newTotal}, total_minor = ${newTotal}, deposit_due_minor = ${deposit}, version = version + 1 where id = ${b.id}`;
  await tx`insert into booking_events (tenant_id, booking_id, from_status, to_status, kind, actor_user_id, source, data)
           values (${b.tenantId}, ${b.id}, ${b.status}, ${b.status}, 'reschedule', ${actorUserId(actor)}, ${actor.kind},
                   ${tx.json({ from: b.startsAt.toISOString(), to: new Date(planned[0].startsAt).toISOString(), previousTotalMinor: b.totalMinor, newTotalMinor: newTotal } as never)})`;
  await audit(tx, { actorUserId: actorUserId(actor), actorKind: actorKind(actor), tenantId: b.tenantId, action: 'booking.rescheduled', targetType: 'booking', targetId: b.id, requestId: requestIdOf(actor) });
  if (b.customerUserId && actor.kind !== 'customer') {
    await notifyUser(tx, b.customerUserId, b.tenantId, { type: 'booking.rescheduled', title: 'booking.notice_rescheduled', body: b.number, targetPath: `/account/bookings/${b.id}`, dedupeKey: `bk-resched:${b.id}:${b.version}` });
  }
  return { version: b.version + 1, totalMinor: newTotal, amountDueChangeMinor: newTotal - b.totalMinor };
}

// ─────────────────────────────────────────────────────────────
// Reads (scoped by actor)
// ─────────────────────────────────────────────────────────────
export async function getBookingFor(tx: Tx, actor: Actor, id: string) {
  const [b] = await tx<BookingRow[]>`select * from bookings where id = ${id}`;
  if (!b) throw notFound('booking');
  const who = await whoIs(tx, actor, b);
  const financial = actor.kind === 'staff' && actor.ctx.caps.has('bookings.view_financial');
  if (!who.length && !financial) throw notFound('booking');
  const items = await tx`select id, seq, service_id, variant_id, staff_id, service_name, service_name_en, variant_name, staff_name, price_minor,
                           addons, addons_minor, duration_min, starts_at, ends_at, status, actual_start_at, actual_end_at
                         from booking_items where booking_id = ${id} order by seq`;
  const events = await tx`select from_status, to_status, kind, actor_role, source, reason, at from booking_events where booking_id = ${id} order by at`;
  const [customer] = await tx<{ displayName: string; phone: string | null; privateNotes: string | null }[]>`
    select display_name, phone, private_notes from tenant_customers where id = ${b.tenantCustomerId}`;
  const canNotes = actor.kind === 'staff' && actor.ctx.caps.has('customers.notes');
  return {
    booking: b,
    items,
    events,
    customer: customer ? { displayName: customer.displayName, phone: actor.kind === 'staff' ? customer.phone : null, privateNotes: canNotes ? customer.privateNotes : undefined } : null,
    allowed: (TRANSITIONS[b.status] ?? []).filter((r) => r.who.some((w) => who.includes(w))).map((r) => r.to),
  };
}
