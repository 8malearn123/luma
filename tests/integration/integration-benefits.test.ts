import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '@/server/db';
import { createHold, transition, type Actor } from '@/server/booking/service';
import { createRefund } from '@/server/payments/service';
import { checkoutCart, getOrCreateCart, setCartLine, transitionOrder } from '@/server/commerce/orders';
import { codeHash, redeemGiftCard } from '@/server/services/giftcards';
import { at, futureDate, makeCustomer, makeSalon, type SalonFixture } from '../booking-fixtures';

afterAll(closeDb);

let s: SalonFixture;
beforeAll(async () => {
  s = await makeSalon();
  await s.run((tx) => tx`update booking_policies set deposit_mode = 'none', allow_on_site = true`);
});
const cust = (userId: string): Actor => ({ kind: 'customer', userId, tenantId: s.tenantId });
let n = 0;
const slot = () => at(futureDate(n % 7, 15 + 7 * Math.floor(n++ / 7)), '09:00');

describe('benefits wired into holds and checkout', () => {
  it('a coupon discounts the hold and its use is returned when the hold is cancelled', async () => {
    await s.run((tx) => tx`insert into coupons (tenant_id, code, kind, value, max_redemptions, per_customer_limit) values (${s.tenantId}, 'WELCOME10', 'percent', 1000, 1, 1)`);
    const c = await makeCustomer(s, 'Coupon');
    const h = await s.run((tx) => createHold(tx, cust(c.user.userId), { branchId: s.branchId, items: [{ serviceId: s.services.haircut, staffId: s.staff.sara, startsAt: slot(), addonIds: [] }], termsKind: 'on_site', couponCode: 'WELCOME10', tenantCustomerId: c.tenantCustomerId, customerUserId: c.user.userId, source: 'online' }));
    expect(h.totalMinor).toBe(13500);
    let [cp] = await s.run((tx) => tx`select redeemed_count from coupons where code = 'WELCOME10'`);
    expect(cp.redeemedCount).toBe(1);
    // the single-use coupon cannot be used by a second hold
    const c2 = await makeCustomer(s, 'Coupon2');
    await expect(s.run((tx) => createHold(tx, cust(c2.user.userId), { branchId: s.branchId, items: [{ serviceId: s.services.haircut, staffId: s.staff.sara, startsAt: slot(), addonIds: [] }], termsKind: 'on_site', couponCode: 'WELCOME10', tenantCustomerId: c2.tenantCustomerId, customerUserId: c2.user.userId, source: 'online' }))).rejects.toMatchObject({ code: 'validation' });
    await s.run((tx) => transition(tx, cust(c.user.userId), h.bookingId, 'cancelled'));
    [cp] = await s.run((tx) => tx`select redeemed_count from coupons where code = 'WELCOME10'`);
    expect(cp.redeemedCount).toBe(0);
  });

  it('a prepaid membership session covers the service, is reserved on hold, consumed on completion', async () => {
    const c = await makeCustomer(s, 'Member');
    const ent = await s.run(async (tx) => {
      const [p] = await tx<{ id: string }[]>`insert into membership_plans (tenant_id, name, price_minor, validity_days, entitlements) values (${s.tenantId}, 'Nails x2', 15000, 90, ${tx.json([{ service_id: s.services.nails, sessions: 2 }] as never)}) returning id`;
      const [m] = await tx<{ id: string }[]>`insert into memberships (tenant_id, plan_id, tenant_customer_id, customer_user_id, ends_at) values (${s.tenantId}, ${p.id}, ${c.tenantCustomerId}, ${c.user.userId}, now() + interval '90 days') returning id`;
      const [e] = await tx<{ id: string }[]>`insert into membership_entitlements (tenant_id, membership_id, service_id, total) values (${s.tenantId}, ${m.id}, ${s.services.nails}, 2) returning id`;
      return e.id;
    });
    const d = futureDate(2, 16);
    const h = await s.run((tx) => createHold(tx, cust(c.user.userId), { branchId: s.branchId, items: [{ serviceId: s.services.nails, staffId: s.staff.lama, startsAt: at(d, '13:00'), addonIds: [] }], termsKind: 'on_site', useMembership: true, tenantCustomerId: c.tenantCustomerId, customerUserId: c.user.userId, source: 'online' }));
    expect(h.totalMinor).toBe(0);
    let [e] = await s.run((tx) => tx`select reserved, consumed from membership_entitlements where id = ${ent}`);
    expect([e.reserved, e.consumed]).toEqual([1, 0]);
    await s.run((tx) => transition(tx, cust(c.user.userId), h.bookingId, 'confirmed'));
    const owner = await s.ctx();
    await s.run((tx) => transition(tx, { kind: 'staff', ctx: owner }, h.bookingId, 'in_service', { now: new Date(at(d, '13:00')) }));
    await s.run((tx) => transition(tx, { kind: 'staff', ctx: owner }, h.bookingId, 'completed', { now: new Date(at(d, '13:45')) }));
    [e] = await s.run((tx) => tx`select reserved, consumed from membership_entitlements where id = ${ent}`);
    expect([e.reserved, e.consumed]).toEqual([0, 1]);
  });

  it('a gift card pays part of a booking and a refund goes back to the card', async () => {
    const c = await makeCustomer(s, 'GC');
    const code = 'ABCD-EFGH-JKMN-PQRS';
    const [g] = await s.run((tx) => tx<{ id: string }[]>`insert into gift_cards (tenant_id, code_hash, code_last4, initial_minor, balance_minor, status, activated_at)
      values (${s.tenantId}, ${codeHash(code)}, 'PQRS', 10000, 10000, 'active', now()) returning id`);
    const h = await s.run((tx) => createHold(tx, cust(c.user.userId), { branchId: s.branchId, items: [{ serviceId: s.services.haircut, staffId: s.staff.hana, startsAt: at(futureDate(4, 22), '11:00'), addonIds: [] }], termsKind: 'on_site', tenantCustomerId: c.tenantCustomerId, customerUserId: c.user.userId, source: 'online' }));
    const r = await s.run((tx) => redeemGiftCard(tx, { tenantId: s.tenantId, userId: c.user.userId, callerKey: 'test' }, code, 15000, { bookingId: h.bookingId }));
    expect(r.appliedMinor).toBe(10000);
    await s.run((tx) => createRefund(tx, { paymentId: r.paymentId!, amountMinor: 4000, reason: 'test', requestedBy: null, idempotencyKey: `gcref-${h.bookingId}` }));
    const [card] = await s.run((tx) => tx`select balance_minor, status from gift_cards where id = ${g.id}`);
    expect(card.balanceMinor).toBe(4000);
    const [rf] = await s.run((tx) => tx`select status from refunds where idempotency_key = ${`gcref-${h.bookingId}`}`);
    expect(rf.status).toBe('succeeded');
  });

  it('an order coupon discounts the total; a 100% coupon needs no payment', async () => {
    await s.run((tx) => tx`insert into coupons (tenant_id, code, kind, value) values (${s.tenantId}, 'FREEBIE', 'percent', 10000)`);
    const [prod] = await s.run((tx) => tx<{ id: string }[]>`insert into products (tenant_id, name, price_minor) values (${s.tenantId}, 'Comb', 2000) returning id`);
    await s.run((tx) => tx`insert into inventory_items (tenant_id, branch_id, usage, product_id, name, on_hand) values (${s.tenantId}, ${s.branchId}, 'retail', ${prod.id}, 'Comb', 3)`);
    const c = await makeCustomer(s, 'Shopper');
    const cart = await s.run(async (tx) => {
      const id = await getOrCreateCart(tx, s.tenantId, { userId: c.user.userId });
      await setCartLine(tx, s.tenantId, id, { productId: prod.id, quantity: 1 });
      return id;
    });
    const o = await s.run((tx) => checkoutCart(tx, s.tenantId, { userId: c.user.userId, tenantCustomerId: c.tenantCustomerId }, cart, { branchId: s.branchId, acceptedSubtotalMinor: 2000, payAtPickup: true, couponCode: 'FREEBIE' }));
    expect([o.discountMinor, o.totalMinor]).toEqual([2000, 0]);
    const owner = await s.ctx();
    await s.run((tx) => transitionOrder(tx, owner, o.orderId, 'ready'));
    await s.run((tx) => transitionOrder(tx, owner, o.orderId, 'collected'));
  });
});
