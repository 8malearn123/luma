// Job/outbox handler registrations for the growth module. Import side effects only.
//
// growth.tick (system scope, enqueue via scheduleGrowthTick every few minutes) only
// discovers tenants with growth work and enqueues one growth.tenant_tick per tenant.
// All business logic runs in growth.tenant_tick under that tenant's RLS scope —
// never in system scope (several queries rely on tenant scoping).
import type { Db } from '../db';
import { enqueueJob, registerJob } from '../jobs';
import { expirePoints } from '../services/loyalty';
import { expireGiftCards } from '../services/giftcards';
import { expireMemberships } from '../services/memberships';
import { expireWaitlist, issueOffers } from '../services/waitlist';
import { releaseDeadSeats } from '../services/groups';

const bucket = (mins: number) => Math.floor(Date.now() / (mins * 60000));

export async function scheduleGrowthTick(db: Db) {
  return enqueueJob(db, { kind: 'growth.tick', tenantId: null, key: `growth.tick:${bucket(5)}`, maxAttempts: 1 });
}

registerJob('growth.tick', async (_job, tx) => {
  const tenants = await tx<{ tenantId: string }[]>`
    select distinct tenant_id from (
      select tenant_id from waitlist_entries where status in ('active','offered')
      union select tenant_id from waitlist_offers where status = 'offered'
      union select tenant_id from memberships where status = 'active' and ends_at <= now()
      union select tenant_id from gift_cards where status in ('active','pending') and expires_at <= now()
      union select tenant_id from points_entries where kind = 'earn' and expires_at <= now()
      union select tenant_id from group_session_bookings where status = 'active'
    ) t`;
  for (const t of tenants) {
    await enqueueJob(tx, { kind: 'growth.tenant_tick', tenantId: t.tenantId, key: `growth.tenant_tick:${t.tenantId}:${bucket(5)}`, maxAttempts: 2 });
  }
  return { tenants: tenants.length };
});

registerJob('growth.tenant_tick', async (_job, tx) => {
  const w = await expireWaitlist(tx);
  const offers = await issueOffers(tx);
  const m = await expireMemberships(tx);
  const g = await expireGiftCards(tx);
  const p = await expirePoints(tx);
  const s = await releaseDeadSeats(tx);
  return { ...w, offersIssued: offers.length, membershipsExpired: m.expired, giftCardsExpired: g.expired, pointsExpired: p.expired, seatsReleased: s.released };
});

export {};
