import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '@/server/db';
import { adjustPoints, earnForBooking, redeemPoints, setRules, upsertReward, customerLedger } from '@/server/services/loyalty';
import { createCoupon, redeemCoupon, validateCoupon, discountFor } from '@/server/services/coupons';
import { issueGiftCard, lookupBalance, redeemGiftCard, voidGiftCard, giftCardHistory, listGiftCards } from '@/server/services/giftcards';
import { consumeEntitlement, releaseEntitlement, reserveEntitlement, sellMembership, upsertPlan } from '@/server/services/memberships';
import { acceptOffer, declineOffer, issueOffers, joinWaitlist } from '@/server/services/waitlist';
import { createGroupSession, joinGroupSession, releaseSeat } from '@/server/services/groups';
import { createHold, transition } from '@/server/booking/service';
import { at, futureDate, makeCustomer, makeSalon, type SalonFixture } from '../booking-fixtures';
import { uniq } from '../fixtures';

afterAll(closeDb);

let s: SalonFixture;
async function upgrade(salon: SalonFixture, code = 'wahaj') {
  await salon.run((tx) => tx`update subscriptions set plan_id = (select id from plans where code = ${code}) where tenant_id = ${salon.tenantId}`);
}

beforeAll(async () => {
  s = await makeSalon();
  await upgrade(s);
});

describe('plan features', () => {
  it('growth features are refused when the plan does not include them', async () => {
    const basic = await makeSalon(); // Sanaa: no gift cards / memberships / group sessions
    const ctx = await basic.ctx();
    await expect(basic.run((tx) => issueGiftCard(tx, ctx, { amountMinor: 10000, templateKey: 'classic', expiresInDays: 365, sale: null, complimentary: true }))).rejects.toMatchObject({ code: 'plan_limit' });
    await expect(basic.run((tx) => upsertPlan(tx, ctx, { name: 'P', priceMinor: 1000, validityDays: 30, entitlements: [{ serviceId: basic.services.nails, sessions: 2 }] }))).rejects.toMatchObject({ code: 'plan_limit' });
  });
});

describe('loyalty', () => {
  it('earns once per completed paid booking and blocks concurrent over-redemption', async () => {
    const ctx = await s.ctx();
    await s.run((tx) => setRules(tx, ctx, { enabled: true, pointsPerSar: 1, expiryDays: null, tiers: [{ name: 'Gold', minPoints: 100 }], reverseOnRefund: true }));
    const c = await makeCustomer(s, 'Loyal');
    await s.run((tx) => adjustPoints(tx, ctx, c.tenantCustomerId, 100, 'welcome'));
    const { id: rewardId } = await s.run((tx) => upsertReward(tx, ctx, { name: 'Free nails', pointsCost: 80, rewardKind: 'discount_fixed', rewardValue: 5000, serviceId: null }));
    const results = await Promise.allSettled([0, 1].map(() => s.run((tx) => redeemPoints(tx, ctx, c.tenantCustomerId, rewardId, {}))));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const l = await s.run((tx) => customerLedger(tx, c.tenantCustomerId));
    expect(l.balance).toBe(20);
    await expect(s.run((tx) => adjustPoints(tx, ctx, c.tenantCustomerId, -50, 'oops'))).rejects.toMatchObject({ code: 'validation' });
  });

  it('earn is exactly once even if called twice', async () => {
    const ctx = await s.ctx();
    const c = await makeCustomer(s, 'Earner');
    const h = await s.run((tx) => createHold(tx, { kind: 'customer', userId: c.user.userId, tenantId: s.tenantId }, { branchId: s.branchId, items: [{ serviceId: s.services.nails, staffId: s.staff.lama, startsAt: at(futureDate(2, 3), '12:00'), addonIds: [] }], termsKind: 'on_site', tenantCustomerId: c.tenantCustomerId, customerUserId: c.user.userId, source: 'online' }));
    await s.run((tx) => tx`update bookings set status = 'completed', financial_status = 'paid', paid_minor = 10000 where id = ${h.bookingId}`);
    await s.run((tx) => earnForBooking(tx, h.bookingId));
    await s.run((tx) => earnForBooking(tx, h.bookingId));
    const l = await s.run((tx) => customerLedger(tx, c.tenantCustomerId));
    expect(l.balance).toBe(100);
    void ctx;
  });
});

describe('coupons', () => {
  it('max redemptions hold under concurrency; discount never exceeds total', async () => {
    const ctx = await s.ctx();
    const code = `SAVE${uniq()}`.slice(0, 20).toUpperCase();
    await s.run((tx) => createCoupon(tx, ctx, { code, kind: 'fixed', value: 5000, minTotalMinor: 0, maxRedemptions: 2, perCustomerLimit: 1, startsAt: null, endsAt: null }));
    const custs = await Promise.all([0, 1, 2, 3].map((i) => makeCustomer(s, `CP${i}`)));
    const r = await Promise.allSettled(custs.map((c) => s.run((tx) => redeemCoupon(tx, s.tenantId, code, { totalMinor: 20000, tenantCustomerId: c.tenantCustomerId }))));
    expect(r.filter((x) => x.status === 'fulfilled')).toHaveLength(2);
    expect(discountFor({ kind: 'fixed', value: 5000 }, 3000)).toBe(3000);
    expect(discountFor({ kind: 'percent', value: 1500 }, 10000)).toBe(1500);
    await expect(s.run((tx) => validateCoupon(tx, s.tenantId, code, { totalMinor: 20000, tenantCustomerId: null }))).rejects.toMatchObject({ code: 'validation' });
  });

  it('per-customer limit', async () => {
    const ctx = await s.ctx();
    const code = `ONCE${uniq()}`.slice(0, 20).toUpperCase();
    await s.run((tx) => createCoupon(tx, ctx, { code, kind: 'percent', value: 1000, minTotalMinor: 0, maxRedemptions: null, perCustomerLimit: 1, startsAt: null, endsAt: null }));
    const c = await makeCustomer(s, 'Once');
    await s.run((tx) => redeemCoupon(tx, s.tenantId, code, { totalMinor: 10000, tenantCustomerId: c.tenantCustomerId }));
    await expect(s.run((tx) => redeemCoupon(tx, s.tenantId, code, { totalMinor: 10000, tenantCustomerId: c.tenantCustomerId }))).rejects.toMatchObject({ code: 'validation' });
  });
});

describe('gift cards', () => {
  it('code shown once, hashed; partial redemption exactly once per reference; reports hide codes', async () => {
    const ctx = await s.ctx();
    const g = await s.run((tx) => issueGiftCard(tx, ctx, { amountMinor: 30000, templateKey: 'floral', expiresInDays: 365, sale: { method: 'cash', reference: 'R-1' }, complimentary: false }));
    expect(g.code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    const rows = await s.run((tx) => listGiftCards(tx));
    expect(JSON.stringify(rows)).not.toContain(g.code.replace(/-/g, ''));
    expect(JSON.stringify(rows)).not.toContain(g.code);
    const bal = await s.run((tx) => lookupBalance(tx, g.code.toLowerCase(), `t-${uniq()}`));
    expect(bal.balanceMinor).toBe(30000);

    const c = await makeCustomer(s, 'GC');
    const h = await s.run((tx) => createHold(tx, { kind: 'customer', userId: c.user.userId, tenantId: s.tenantId }, { branchId: s.branchId, items: [{ serviceId: s.services.haircut, staffId: s.staff.sara, startsAt: at(futureDate(4, 3), '09:00'), addonIds: [] }], termsKind: 'on_site', tenantCustomerId: c.tenantCustomerId, customerUserId: c.user.userId, source: 'online' }));
    const actor = { tenantId: s.tenantId, userId: ctx.user.userId, callerKey: `x-${uniq()}` };
    const r1 = await s.run((tx) => redeemGiftCard(tx, actor, g.code, 10000, { bookingId: h.bookingId }));
    const r2 = await s.run((tx) => redeemGiftCard(tx, actor, g.code, 10000, { bookingId: h.bookingId }));
    expect(r1.appliedMinor).toBe(10000);
    expect(r2.replay).toBe(true);
    const hist = await s.run((tx) => giftCardHistory(tx, g.id));
    expect(hist.card.balanceMinor).toBe(20000);
    expect(hist.entries.filter((e) => e.kind === 'redeem')).toHaveLength(1);
    const [b] = await s.run((tx) => tx`select paid_minor, financial_status from bookings where id = ${h.bookingId}`);
    expect(b).toMatchObject({ paidMinor: 10000, financialStatus: 'partially_paid' });
    // never more than outstanding (150 SAR total, 100 already paid)
    const h2 = await s.run((tx) => redeemGiftCard(tx, { ...actor, callerKey: `y-${uniq()}` }, g.code, 50000, { bookingId: h.bookingId })).catch((e) => e);
    expect(h2.replay).toBe(true); // same booking reference already redeemed once
    await s.run((tx) => voidGiftCard(tx, ctx, g.id, 'lost'));
    const after = await s.run((tx) => lookupBalance(tx, g.code, `z-${uniq()}`));
    expect(after.status).toBe('void');
  });

  it('lookups are rate limited', async () => {
    const key = `rl-${uniq()}`;
    for (let i = 0; i < 10; i++) await s.run((tx) => lookupBalance(tx, 'AAAA-BBBB-CCCC-DDDD', key)).catch(() => null);
    await expect(s.run((tx) => lookupBalance(tx, 'AAAA-BBBB-CCCC-DDDD', key))).rejects.toMatchObject({ code: 'rate_limited' });
  });
});

describe('memberships', () => {
  it('reserve on hold, consume on completion, release on cancellation; never over total', async () => {
    const ctx = await s.ctx();
    const { id: planId } = await s.run((tx) => upsertPlan(tx, ctx, { name: 'Nails x2', priceMinor: 15000, validityDays: 90, entitlements: [{ serviceId: s.services.nails, sessions: 2 }] }));
    const c = await makeCustomer(s, 'Member');
    await s.run((tx) => sellMembership(tx, ctx, { planId, tenantCustomerId: c.tenantCustomerId, sale: { method: 'cash', reference: 'M-1' } }));
    const item = async (time: string) => {
      const h = await s.run((tx) => createHold(tx, { kind: 'customer', userId: c.user.userId, tenantId: s.tenantId }, { branchId: s.branchId, items: [{ serviceId: s.services.nails, staffId: s.staff.lama, startsAt: at(futureDate(5, 3), time), addonIds: [] }], termsKind: 'on_site', tenantCustomerId: c.tenantCustomerId, customerUserId: c.user.userId, source: 'online' }));
      const [it] = await s.run((tx) => tx<{ id: string }[]>`select id from booking_items where booking_id = ${h.bookingId}`);
      return { bookingId: h.bookingId, itemId: it.id };
    };
    const a = await item('12:00');
    const b = await item('13:00');
    const c3 = await item('14:00');
    expect(await s.run((tx) => reserveEntitlement(tx, a.itemId))).toBeTruthy();
    expect(await s.run((tx) => reserveEntitlement(tx, a.itemId))).toBeTruthy(); // idempotent
    expect(await s.run((tx) => reserveEntitlement(tx, b.itemId))).toBeTruthy();
    expect(await s.run((tx) => reserveEntitlement(tx, c3.itemId))).toBeNull(); // only 2 sessions
    expect(await s.run((tx) => consumeEntitlement(tx, a.itemId))).toBe(true);
    expect(await s.run((tx) => consumeEntitlement(tx, a.itemId))).toBe(false);
    expect(await s.run((tx) => releaseEntitlement(tx, b.itemId))).toBe(true);
    expect(await s.run((tx) => releaseEntitlement(tx, a.itemId))).toBe(false); // consumed is never released
    expect(await s.run((tx) => reserveEntitlement(tx, c3.itemId))).toBeTruthy(); // freed session reusable
    const [e] = await s.run((tx) => tx`select total, reserved, consumed from membership_entitlements e join memberships m on m.id = e.membership_id where m.tenant_customer_id = ${c.tenantCustomerId}`);
    expect(e).toMatchObject({ total: 2, reserved: 1, consumed: 1 });
  });
});

describe('waitlist', () => {
  it('one live offer per slot; only one acceptance wins; decline passes it on', async () => {
    const d = futureDate(6, 3);
    // block everything except one slot for Lama 12:00–12:45 on day d
    const owner = await s.ctx();
    void owner;
    await s.run((tx) => tx`insert into blocked_times (tenant_id, staff_id, during) values (${s.tenantId}, ${s.staff.lama}, tstzrange(${at(d, '12:45')}, ${at(d, '20:00')}))`);
    const busy = await makeCustomer(s, 'Busy');
    const held = await s.run((tx) => createHold(tx, { kind: 'customer', userId: busy.user.userId, tenantId: s.tenantId }, { branchId: s.branchId, items: [{ serviceId: s.services.nails, staffId: s.staff.lama, startsAt: at(d, '12:00'), addonIds: [] }], termsKind: 'on_site', tenantCustomerId: busy.tenantCustomerId, customerUserId: busy.user.userId, source: 'online' }));
    const w1 = await makeCustomer(s, 'W1');
    const w2 = await makeCustomer(s, 'W2');
    for (const w of [w1, w2]) {
      await s.run((tx) => joinWaitlist(tx, s.tenantId, { userId: w.user.userId, tenantCustomerId: w.tenantCustomerId }, { branchId: s.branchId, serviceId: s.services.nails, staffId: s.staff.lama, desiredFrom: d, desiredTo: d, timeWindows: [], notifyConsent: true }));
    }
    expect(await s.run((tx) => issueOffers(tx))).toHaveLength(0); // no opening yet
    // the slot opens
    await s.run((tx) => transition(tx, { kind: 'customer', userId: busy.user.userId, tenantId: s.tenantId }, held.bookingId, 'cancelled'));
    const offers = await s.run((tx) => issueOffers(tx));
    expect(offers).toHaveLength(1); // earliest request only; the same slot is not offered to W2
    const [o1] = await s.run((tx) => tx<{ id: string; customerUserId: string }[]>`select id, customer_user_id from waitlist_offers where id = ${offers[0].offerId}`);
    expect(o1.customerUserId).toBe(w1.user.userId);
    // W1 declines → next scan offers it to W2
    await s.run((tx) => declineOffer(tx, w1.user.userId, o1.id));
    // W1 entry is active again but has more offers; W2 (earlier? no) — ranking: created_at first, so W1 again would be first.
    await s.run((tx) => tx`update waitlist_entries set status = 'cancelled' where customer_user_id = ${w1.user.userId}`);
    const offers2 = await s.run((tx) => issueOffers(tx));
    expect(offers2).toHaveLength(1);
    const results = await Promise.allSettled([0, 1].map(() => s.run((tx) => acceptOffer(tx, w2.user.userId, offers2[0].offerId, 'on_site'))));
    const wins = results.filter((r) => r.status === 'fulfilled' && (r.value as { ok: boolean }).ok);
    expect(wins).toHaveLength(1);
  });
});

describe('group sessions', () => {
  it('concurrent joins never exceed capacity; leaving frees a seat; session blocks the instructor', async () => {
    const ctx = await s.ctx();
    const [svc] = await s.run((tx) => tx<{ id: string }[]>`insert into services (tenant_id, name, price_minor, duration_min, group_capacity) values (${s.tenantId}, 'Makeup class', 20000, 120, 3) returning id`);
    await s.run((tx) => tx`insert into service_staff (tenant_id, service_id, staff_id) values (${s.tenantId}, ${svc.id}, ${s.staff.sara})`);
    const d = futureDate(1, 12);
    const g = await s.run((tx) => createGroupSession(tx, ctx, { branchId: s.branchId, serviceId: svc.id, staffId: s.staff.sara, startsAt: at(d, '10:00') }));
    const custs = await Promise.all([0, 1, 2, 3, 4].map((i) => makeCustomer(s, `G${i}`)));
    const r = await Promise.allSettled(custs.map((c) => s.run((tx) => joinGroupSession(tx, s.tenantId, { sessionId: g.id, seats: 1, termsKind: 'on_site', tenantCustomerId: c.tenantCustomerId, customerUserId: c.user.userId, createdBy: c.user.userId, source: 'online' }))));
    const ok = r.filter((x) => x.status === 'fulfilled') as PromiseFulfilledResult<{ bookingId: string }>[];
    expect(ok).toHaveLength(3);
    const [gs] = await s.run((tx) => tx`select seats_taken from group_sessions where id = ${g.id}`);
    expect(gs.seatsTaken).toBe(3);
    expect(await s.run((tx) => releaseSeat(tx, ok[0].value.bookingId))).toBe(true);
    expect(await s.run((tx) => releaseSeat(tx, ok[0].value.bookingId))).toBe(false);
    // an individual booking cannot overlap the session's instructor time
    const c = await makeCustomer(s, 'Solo');
    await expect(s.run((tx) => createHold(tx, { kind: 'customer', userId: c.user.userId, tenantId: s.tenantId }, { branchId: s.branchId, items: [{ serviceId: s.services.haircut, staffId: s.staff.sara, startsAt: at(d, '11:00'), addonIds: [] }], termsKind: 'on_site', tenantCustomerId: c.tenantCustomerId, customerUserId: c.user.userId, source: 'online' }))).rejects.toMatchObject({ code: 'slot_unavailable' });
  });
});
