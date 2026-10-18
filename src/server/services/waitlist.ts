import { z } from 'zod';
import type { Tx } from '../db';
import { AppError, notFound } from '../errors';
import { audit } from '../audit';
import { findAvailability, type SlotOption } from '../booking/availability';
import { createHold } from '../booking/service';
import { notifyUser, recordDelivery } from './notifications';
import type { TenantContext } from '../tenancy/context';
import { entitlements, requireFeature, requireLive } from '../tenancy/plan';
import { addDays, utcToWall } from '@/lib/tz';

/**
 * Waitlist.
 *
 * DECLARED RANKING POLICY (shown to businesses and customers):
 *   1. earliest waitlist request first (created_at ascending);
 *   2. tie-break: fewest offers already received (offers_count ascending);
 *   3. final tie-break: entry id (stable, no randomness).
 * Only entries whose desired dates, time windows and specialist preference
 * match the opening are considered.
 *
 * A freed slot is offered to ONE candidate at a time (unique live-offer index
 * per staff+start). Offers are time-limited; accepting creates a normal hold
 * atomically (a race with other bookers can still lose — then the offer is
 * superseded and the entry returns to the queue). No slot is ever confirmed
 * for everyone who was alerted.
 */
export const OFFER_MINUTES = 30;
const MAX_ACTIVE_PER_CUSTOMER = 5;

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const joinInput = z.object({
  branchId: z.string().uuid(),
  serviceId: z.string().uuid(),
  variantId: z.string().uuid().nullable().optional(),
  staffId: z.string().uuid().nullable().optional(),
  desiredFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  desiredTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timeWindows: z.array(z.object({ start: hhmm, end: hhmm })).max(4).default([]),
  notifyConsent: z.boolean().default(false),
});

async function tz(tx: Tx): Promise<string> {
  const [t] = await tx<{ timezone: string }[]>`select timezone from tenants limit 1`;
  return t?.timezone ?? 'Asia/Riyadh';
}

export async function joinWaitlist(tx: Tx, tenantId: string, customer: { userId: string; tenantCustomerId: string }, input: z.infer<typeof joinInput>) {
  const ent = await entitlements(tx, tenantId);
  requireLive(ent);
  requireFeature(ent, 'waitlist.enabled');
  if (input.desiredTo < input.desiredFrom) throw new AppError('validation', 'errors.time_range_invalid');
  const zone = await tz(tx);
  const today = utcToWall(new Date(), zone).date;
  if (input.desiredTo < today) throw new AppError('validation', 'errors.time_range_invalid');
  if (input.desiredTo > addDays(today, 90)) throw new AppError('validation', 'errors.waitlist_too_far');
  for (const w of input.timeWindows) if (w.end <= w.start) throw new AppError('validation', 'errors.time_range_invalid');
  const [svc] = await tx<{ status: string; isVisible: boolean }[]>`select status, is_visible from services where id = ${input.serviceId}`;
  if (!svc || svc.status !== 'active' || !svc.isVisible) throw notFound('service');
  const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from waitlist_entries where tenant_id = ${tenantId} and tenant_customer_id = ${customer.tenantCustomerId} and status in ('active','offered')`;
  if (n >= MAX_ACTIVE_PER_CUSTOMER) throw new AppError('validation', 'errors.waitlist_limit');
  const { wallToUtc } = await import('@/lib/tz');
  const [e] = await tx<{ id: string }[]>`
    insert into waitlist_entries (tenant_id, branch_id, tenant_customer_id, customer_user_id, service_id, service_variant_id, staff_id,
                                  desired_from, desired_to, time_windows, notify_consent, expires_at)
    values (${tenantId}, ${input.branchId}, ${customer.tenantCustomerId}, ${customer.userId}, ${input.serviceId}, ${input.variantId ?? null},
            ${input.staffId ?? null}, ${input.desiredFrom}, ${input.desiredTo}, ${tx.json(input.timeWindows as never)}, ${input.notifyConsent},
            ${wallToUtc(addDays(input.desiredTo, 1), '00:00', zone)})
    returning id`;
  await audit(tx, { actorUserId: customer.userId, actorKind: 'customer', tenantId, action: 'waitlist.joined', targetType: 'waitlist_entry', targetId: e.id });
  return { id: e.id };
}

interface EntryRow {
  id: string;
  tenantId: string;
  branchId: string;
  serviceId: string;
  serviceVariantId: string | null;
  staffId: string | null;
  customerUserId: string | null;
  tenantCustomerId: string;
  desiredFrom: string;
  desiredTo: string;
  timeWindows: { start: string; end: string }[];
  notifyConsent: boolean;
  offersCount: number;
}

/** Openings matching an entry (dates ∩ booking window, time windows, specialist preference). */
export async function findOpenings(tx: Tx, e: EntryRow, limit = 10): Promise<SlotOption[]> {
  const zone = await tz(tx);
  const today = utcToWall(new Date(), zone).date;
  const from = e.desiredFrom > today ? e.desiredFrom : today;
  if (from > e.desiredTo) return [];
  const span = Math.min(14, Math.round((Date.parse(e.desiredTo) - Date.parse(from)) / 86400000) + 1);
  const r = await findAvailability(
    tx,
    e.tenantId,
    { branchId: e.branchId, items: [{ serviceId: e.serviceId, variantId: e.serviceVariantId, addonIds: [], staffId: e.staffId }], from, days: span },
    'public',
    { maxPerDay: 60 },
  ).catch(() => null);
  if (!r) return [];
  const out: SlotOption[] = [];
  for (const d of r.days) {
    for (const s of d.slots) {
      const local = utcToWall(new Date(s.startsAt), zone).time;
      const localEnd = utcToWall(new Date(s.endsAt), zone).time;
      if (e.timeWindows.length && !e.timeWindows.some((w) => local >= w.start && localEnd <= w.end)) continue;
      out.push(s);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/**
 * Scan active entries in declared rank order and issue at most one live offer
 * per entry and per slot. Returns the offers created.
 */
export async function issueOffers(tx: Tx, opts: { now?: Date; maxEntries?: number } = {}) {
  const entries = await tx<EntryRow[]>`
    select id, tenant_id, branch_id, service_id, service_variant_id, staff_id, customer_user_id, tenant_customer_id,
           to_char(desired_from,'YYYY-MM-DD') as desired_from, to_char(desired_to,'YYYY-MM-DD') as desired_to, time_windows, notify_consent, offers_count
    from waitlist_entries where status = 'active' and expires_at > now()
    order by created_at, offers_count, id limit ${opts.maxEntries ?? 50}`;
  const created: { offerId: string; entryId: string; slotStart: string }[] = [];
  for (const e of entries) {
    const openings = await findOpenings(tx, e, 10);
    for (const s of openings) {
      const it = s.items[0];
      const ins = await tx<{ id: string }[]>`
        insert into waitlist_offers (tenant_id, waitlist_entry_id, customer_user_id, staff_id, slot_start, slot_end, rank_reason, expires_at)
        values (${e.tenantId}, ${e.id}, ${e.customerUserId}, ${it.staffId}, ${s.startsAt}, ${s.endsAt},
                ${'earliest_request_then_fewest_offers'}, now() + make_interval(mins => ${OFFER_MINUTES}))
        on conflict (tenant_id, staff_id, slot_start) where status = 'offered' do nothing
        returning id`;
      if (!ins.length) continue; // this slot is already offered to someone ranked earlier
      await tx`update waitlist_entries set status = 'offered', offers_count = offers_count + 1 where id = ${e.id}`;
      if (e.customerUserId) {
        await notifyUser(tx, e.customerUserId, e.tenantId, { type: 'waitlist.offer', title: 'growth.notice_waitlist_offer', targetPath: '/account/waitlist', dedupeKey: `wl-offer:${ins[0].id}` });
        if (e.notifyConsent) await recordDelivery(tx, { tenantId: e.tenantId, channel: 'whatsapp', template: 'waitlist_offer', recipientUserId: e.customerUserId, dedupeKey: `wl-offer-wa:${ins[0].id}` });
      }
      created.push({ offerId: ins[0].id, entryId: e.id, slotStart: s.startsAt });
      break;
    }
  }
  return created;
}

/** Customer accepts a live offer → hold created atomically, or a clear failure with the entry re-queued. */
export async function acceptOffer(tx: Tx, tenantId: string, userId: string, offerId: string, termsKind: 'full' | 'deposit' | 'on_site' | 'manual_approval') {
  const [o] = await tx<{ id: string; tenantId: string; waitlistEntryId: string; customerUserId: string | null; staffId: string; slotStart: Date; status: string; expiresAt: Date }[]>`
    select id, tenant_id, waitlist_entry_id, customer_user_id, staff_id, slot_start, status, expires_at from waitlist_offers
    where id = ${offerId} and tenant_id = ${tenantId} and customer_user_id = ${userId} for update`;
  if (!o || o.customerUserId !== userId) throw notFound('offer');
  if (o.status !== 'offered') throw new AppError('invalid_transition', 'errors.offer_not_live');
  if (o.expiresAt <= new Date()) throw new AppError('invalid_transition', 'errors.offer_expired');
  const [e] = await tx<{ branchId: string; serviceId: string; serviceVariantId: string | null; tenantCustomerId: string }[]>`
    select branch_id, service_id, service_variant_id, tenant_customer_id from waitlist_entries
    where id = ${o.waitlistEntryId} and tenant_id = ${tenantId} and customer_user_id = ${userId} for update`;
  if (!e) throw notFound('offer');
  try {
    const hold = await tx.savepoint((sp) =>
      createHold(sp as unknown as Tx, { kind: 'customer', userId, tenantId: o.tenantId }, {
        branchId: e.branchId,
        items: [{ serviceId: e.serviceId, variantId: e.serviceVariantId, staffId: o.staffId, startsAt: o.slotStart.toISOString(), addonIds: [] }],
        termsKind,
        tenantCustomerId: e.tenantCustomerId,
        customerUserId: userId,
        source: 'waitlist',
      }),
    );
    await tx`update waitlist_offers set status = 'accepted', booking_id = ${hold.bookingId}, responded_at = now() where id = ${offerId}`;
    await tx`update waitlist_entries set status = 'fulfilled' where id = ${o.waitlistEntryId}`;
    return { ok: true as const, hold };
  } catch (err) {
    const code = (err as AppError).code;
    if (code === 'slot_unavailable') {
      await tx`update waitlist_offers set status = 'superseded', responded_at = now() where id = ${offerId}`;
      await tx`update waitlist_entries set status = 'active' where id = ${o.waitlistEntryId}`;
      return { ok: false as const, reason: 'slot_unavailable' as const };
    }
    throw err;
  }
}

export async function declineOffer(tx: Tx, tenantId: string, userId: string, offerId: string) {
  const [o] = await tx<{ waitlistEntryId: string }[]>`
    update waitlist_offers set status = 'declined', responded_at = now()
    where id = ${offerId} and tenant_id = ${tenantId} and customer_user_id = ${userId} and status = 'offered' returning waitlist_entry_id`;
  if (!o) throw notFound('offer');
  await tx`update waitlist_entries set status = 'active' where id = ${o.waitlistEntryId} and tenant_id = ${tenantId} and status = 'offered'`;
}

export async function cancelEntry(tx: Tx, tenantId: string, userId: string | null, entryId: string, ctx?: TenantContext) {
  const r = ctx
    ? await tx<{ id: string }[]>`update waitlist_entries set status = 'cancelled' where id = ${entryId} and tenant_id = ${tenantId} and status in ('active','offered') returning id`
    : await tx<{ id: string }[]>`update waitlist_entries set status = 'cancelled' where id = ${entryId} and tenant_id = ${tenantId} and customer_user_id = ${userId} and status in ('active','offered') returning id`;
  if (!r.length) throw notFound('waitlist_entry');
  await tx`update waitlist_offers set status = 'superseded' where waitlist_entry_id = ${entryId} and status = 'offered'`;
  if (ctx) await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: 'waitlist.cancelled', targetType: 'waitlist_entry', targetId: entryId, requestId: ctx.requestId });
}

/** Job: expire stale offers (entry goes back in the queue) and past entries. */
export async function expireWaitlist(tx: Tx) {
  const offers = await tx<{ waitlistEntryId: string }[]>`update waitlist_offers set status = 'expired' where status = 'offered' and expires_at <= now() returning waitlist_entry_id`;
  for (const o of offers) await tx`update waitlist_entries set status = 'active' where id = ${o.waitlistEntryId} and status = 'offered'`;
  const entries = await tx`update waitlist_entries set status = 'expired' where status in ('active','offered') and expires_at <= now() returning id`;
  for (const e of entries) await tx`update waitlist_offers set status = 'expired' where waitlist_entry_id = ${e.id as string} and status = 'offered'`;
  return { offersExpired: offers.length, entriesExpired: entries.length };
}

export async function listEntries(tx: Tx, opts: { status?: string } = {}) {
  return tx`select e.id, e.status, to_char(e.desired_from,'YYYY-MM-DD') as desired_from, to_char(e.desired_to,'YYYY-MM-DD') as desired_to,
              e.time_windows, e.offers_count, e.notify_consent, e.created_at, s.name as service_name, sp.display_name as staff_name,
              c.display_name as customer_name,
              (select json_build_object('id', o.id, 'slotStart', o.slot_start, 'expiresAt', o.expires_at, 'staffName', os.display_name)
                 from waitlist_offers o join staff_profiles os on os.id = o.staff_id where o.waitlist_entry_id = e.id and o.status = 'offered' limit 1) as live_offer
            from waitlist_entries e join services s on s.id = e.service_id join tenant_customers c on c.id = e.tenant_customer_id
            left join staff_profiles sp on sp.id = e.staff_id
            where (${opts.status ?? null}::text is null or e.status = ${opts.status ?? null})
            order by e.created_at, e.offers_count, e.id limit 300`;
}

/** Customer's own entries & live offers across this tenant scope. */
export async function myEntries(tx: Tx, tenantId: string, userId: string) {
  return tx`select e.id, e.tenant_id, e.status, to_char(e.desired_from,'YYYY-MM-DD') as desired_from, to_char(e.desired_to,'YYYY-MM-DD') as desired_to,
              s.name as service_name, s.name_en as service_name_en, t.name as tenant_name, t.slug as tenant_slug,
              (select json_build_object('id', o.id, 'slotStart', o.slot_start, 'slotEnd', o.slot_end, 'expiresAt', o.expires_at, 'staffName', sp.display_name)
                 from waitlist_offers o join staff_profiles sp on sp.id = o.staff_id
                 where o.waitlist_entry_id = e.id and o.tenant_id = ${tenantId} and o.customer_user_id = ${userId}
                   and o.status = 'offered' and o.expires_at > now() limit 1) as live_offer
            from waitlist_entries e join services s on s.id = e.service_id join tenants t on t.id = e.tenant_id
            where e.tenant_id = ${tenantId} and e.customer_user_id = ${userId} and e.status in ('active','offered')
            order by e.created_at desc`;
}
