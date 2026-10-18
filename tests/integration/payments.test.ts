import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, withSystem } from '@/server/db';
import { createHold, transition, type Actor } from '@/server/booking/service';
import { connectSandbox, createRefund, processProviderEvent, recordOnSitePayment, sandboxEmit, startBookingPayment, startOrderPayment } from '@/server/payments/service';
import { runDueJobs } from '@/server/jobs';
import { checkoutCart, getOrCreateCart, setCartLine, expireUnpaidOrders, transitionOrder } from '@/server/commerce/orders';
import { at, futureDate, makeCustomer, makeSalon, type SalonFixture } from '../booking-fixtures';
import { uniq } from '../fixtures';

afterAll(closeDb);

let s: SalonFixture;
beforeAll(async () => {
  s = await makeSalon();
  const owner = await s.ctx();
  await s.run((tx) => connectSandbox(tx, owner));
  await s.run((tx) => tx`update booking_policies set deposit_mode = 'percent', deposit_value = 3000, allow_full_online = true`);
});

const cust = (userId: string): Actor => ({ kind: 'customer', userId, tenantId: s.tenantId });
let slot = 0;
const nextSlot = () => {
  const d = futureDate(slot % 7, 10 + Math.floor(slot / 7) * 7);
  const time = ['09:00', '10:15', '11:30', '12:45', '14:00', '15:15'][Math.floor(slot / 7) % 6];
  slot++;
  return at(d, time);
};

async function heldBooking(terms: 'deposit' | 'full' = 'deposit', startsAt = nextSlot()) {
  const c = await makeCustomer(s, `P${uniq()}`);
  const h = await s.run((tx) => createHold(tx, cust(c.user.userId), { branchId: s.branchId, items: [{ serviceId: s.services.haircut, staffId: s.staff.sara, startsAt, addonIds: [] }], termsKind: terms, tenantCustomerId: c.tenantCustomerId, customerUserId: c.user.userId, source: 'online' }));
  return { c, h, startsAt };
}

describe('booking payments via signed provider events', () => {
  it('deposit: redirect alone never marks paid; signed webhook confirms; duplicate is a no-op', async () => {
    const { c, h } = await heldBooking('deposit');
    expect(h.dueNowMinor).toBe(4500); // 30% of 150 SAR
    const p = await s.run((tx) => startBookingPayment(tx, c.user.userId, h.bookingId, `k-${uniq()}`));
    let [b] = await s.run((tx) => tx`select status, financial_status from bookings where id = ${h.bookingId}`);
    expect(b.status).toBe('pending_payment');
    const ev = await sandboxEmit(p.paymentId, 'succeeded', { eventId: `evt-${uniq()}` });
    expect(await processProviderEvent('sandbox', ev.body, ev.headers)).toBe('applied');
    expect(await processProviderEvent('sandbox', ev.body, ev.headers)).toBe('duplicate');
    [b] = await s.run((tx) => tx`select status, financial_status, paid_minor from bookings where id = ${h.bookingId}`);
    expect(b).toMatchObject({ status: 'confirmed', financialStatus: 'deposit_paid', paidMinor: 4500 });
    // deposit is a liability, not revenue, until service completion
    const [j] = await s.run((tx) => tx`select coalesce(sum(credit_minor - debit_minor),0)::int as rev from financial_entries where account = 'service_revenue'`);
    expect(j.rev).toBe(0);
  });

  it('forged signature, stale timestamp and amount mismatch are rejected', async () => {
    const { c, h } = await heldBooking('full');
    const p = await s.run((tx) => startBookingPayment(tx, c.user.userId, h.bookingId, `k-${uniq()}`));
    const ev = await sandboxEmit(p.paymentId, 'succeeded');
    const forged = new Headers({ 'x-sandbox-signature': ev.headers.get('x-sandbox-signature')!.replace(/.$/, (x) => (x === 'a' ? 'b' : 'a')) });
    expect(await processProviderEvent('sandbox', ev.body, forged)).toBe('rejected');
    const stale = await sandboxEmit(p.paymentId, 'succeeded', { ts: Math.floor(Date.now() / 1000) - 3600 });
    expect(await processProviderEvent('sandbox', stale.body, stale.headers)).toBe('rejected');
    const wrong = await sandboxEmit(p.paymentId, 'succeeded', { amountMinor: 1 });
    expect(await processProviderEvent('sandbox', wrong.body, wrong.headers)).toBe('mismatch');
    const [b] = await s.run((tx) => tx`select status, paid_minor from bookings where id = ${h.bookingId}`);
    expect(b.status).toBe('pending_payment');
    expect(b.paidMinor).toBe(0);
    const currency = await sandboxEmit(p.paymentId, 'succeeded', { currency: 'USD' });
    expect(await processProviderEvent('sandbox', currency.body, currency.headers)).toBe('ignored'); // payment already needs_review
  });

  it('out-of-order: a failure event after success is ignored', async () => {
    const { c, h } = await heldBooking('full');
    const p = await s.run((tx) => startBookingPayment(tx, c.user.userId, h.bookingId, `k-${uniq()}`));
    const ok = await sandboxEmit(p.paymentId, 'succeeded');
    await processProviderEvent('sandbox', ok.body, ok.headers);
    const fail = await sandboxEmit(p.paymentId, 'failed');
    expect(await processProviderEvent('sandbox', fail.body, fail.headers)).toBe('ignored');
    const [pay] = await s.run((tx) => tx`select status from payments where id = ${p.paymentId}`);
    expect(pay.status).toBe('succeeded');
  });

  it('late success after the hold expired and the slot was taken → automatic refund, no double booking', async () => {
    const startsAt = nextSlot();
    const { c, h } = await heldBooking('full', startsAt);
    const p = await s.run((tx) => startBookingPayment(tx, c.user.userId, h.bookingId, `k-${uniq()}`));
    // hold expires; someone else books the same time
    await s.run((tx) => tx`update bookings set hold_expires_at = now() - interval '1 s' where id = ${h.bookingId}`);
    await s.run((tx) => tx`update booking_allocations set expires_at = now() - interval '1 s' where booking_id = ${h.bookingId}`);
    const other = await makeCustomer(s, 'Other');
    await s.run((tx) => tx`update booking_policies set deposit_mode = 'none', allow_on_site = true`);
    await s.run((tx) => createHold(tx, cust(other.user.userId), { branchId: s.branchId, items: [{ serviceId: s.services.haircut, staffId: s.staff.sara, startsAt, addonIds: [] }], termsKind: 'on_site', tenantCustomerId: other.tenantCustomerId, customerUserId: other.user.userId, source: 'online' }));
    await s.run((tx) => tx`update booking_policies set deposit_mode = 'percent', deposit_value = 3000`);
    const ev = await sandboxEmit(p.paymentId, 'succeeded');
    expect(await processProviderEvent('sandbox', ev.body, ev.headers)).toBe('late_success_refunded');
    const [b] = await s.run((tx) => tx`select status, financial_status from bookings where id = ${h.bookingId}`);
    expect(b.status).toBe('expired');
    expect(b.financialStatus).toBe('refund_pending'); // pending ≠ refunded
    await runDueJobs(5);
    const [b2] = await s.run((tx) => tx`select financial_status, refunded_minor from bookings where id = ${h.bookingId}`);
    expect(b2.financialStatus).toBe('refunded');
    const active = await s.run((tx) => tx`select count(*)::int as n from booking_allocations where active and during && tstzrange(${startsAt}, ${new Date(+new Date(startsAt) + 60000)}) and staff_id = ${s.staff.sara}`);
    expect(active[0].n).toBe(1);
  });

  it('refunds: dedup by idempotency key, cannot exceed paid, cancelled ≠ refunded', async () => {
    const { c, h } = await heldBooking('full');
    const p = await s.run((tx) => startBookingPayment(tx, c.user.userId, h.bookingId, `k-${uniq()}`));
    const ev = await sandboxEmit(p.paymentId, 'succeeded');
    await processProviderEvent('sandbox', ev.body, ev.headers);
    const r1 = await s.run((tx) => createRefund(tx, { paymentId: p.paymentId, amountMinor: 5000, reason: 'goodwill', requestedBy: null, idempotencyKey: 'dup-1' + h.bookingId }));
    const r2 = await s.run((tx) => createRefund(tx, { paymentId: p.paymentId, amountMinor: 5000, reason: 'goodwill', requestedBy: null, idempotencyKey: 'dup-1' + h.bookingId }));
    expect(r1.id).toBe(r2.id);
    await expect(s.run((tx) => createRefund(tx, { paymentId: p.paymentId, amountMinor: 999999, reason: 'x', requestedBy: null, idempotencyKey: 'big' + h.bookingId }))).rejects.toMatchObject({ code: 'validation' });
    await runDueJobs(5);
    const [b] = await s.run((tx) => tx`select financial_status, refunded_minor from bookings where id = ${h.bookingId}`);
    expect(b).toMatchObject({ financialStatus: 'partially_refunded', refundedMinor: 5000 });
  });

  it('customer cancellation inside the window keeps the late fee per booking-time terms', async () => {
    await s.run((tx) => tx`update booking_policies set late_cancel_fee_bps = 5000, cancellation_window_hours = 336`);
    const { c, h } = await heldBooking('full', at(futureDate(2, 3), '15:00'));
    await s.run((tx) => tx`update booking_policies set late_cancel_fee_bps = 0, cancellation_window_hours = 24`); // later policy change does not apply
    const p = await s.run((tx) => startBookingPayment(tx, c.user.userId, h.bookingId, `k-${uniq()}`));
    const ev = await sandboxEmit(p.paymentId, 'succeeded');
    await processProviderEvent('sandbox', ev.body, ev.headers);
    const r = await s.run((tx) => transition(tx, cust(c.user.userId), h.bookingId, 'cancelled'));
    expect(r.refundDueMinor).toBe(7500); // 50% of 150 SAR kept
  });

  it('on-site collection requires the capability, a reference, and never exceeds the outstanding amount', async () => {
    await s.run((tx) => tx`update booking_policies set deposit_mode = 'none', allow_on_site = true`);
    const c = await makeCustomer(s, 'OnSite');
    const h = await s.run((tx) => createHold(tx, cust(c.user.userId), { branchId: s.branchId, items: [{ serviceId: s.services.nails, staffId: s.staff.lama, startsAt: nextSlot().replace(/T\d\d:\d\d/, 'T15:00'), addonIds: [] }], termsKind: 'on_site', tenantCustomerId: c.tenantCustomerId, customerUserId: c.user.userId, source: 'online' }));
    const owner = await s.ctx();
    await expect(s.run((tx) => recordOnSitePayment(tx, owner, { bookingId: h.bookingId, amountMinor: 20000, method: 'cash', reference: 'R1', idempotencyKey: uniq() }))).rejects.toMatchObject({ code: 'validation' });
    await expect(s.run((tx) => recordOnSitePayment(tx, owner, { bookingId: h.bookingId, amountMinor: 10000, method: 'cash', reference: '  ', idempotencyKey: uniq() }))).rejects.toMatchObject({ code: 'validation' });
    await s.run((tx) => recordOnSitePayment(tx, owner, { bookingId: h.bookingId, amountMinor: 10000, method: 'cash', reference: 'RCPT-1', idempotencyKey: uniq() }));
    const [b] = await s.run((tx) => tx`select financial_status from bookings where id = ${h.bookingId}`);
    expect(b.financialStatus).toBe('paid');
  });
});

describe('payment eligibility decisions', () => {
  it('require_full_payment blocks deposit and on-site even if the request is manipulated', async () => {
    await s.run((tx) => tx`update booking_policies set deposit_mode = 'percent', deposit_value = 3000, allow_on_site = true`);
    const c = await makeCustomer(s, 'Restricted');
    const reviewer = (await withSystem('t', (tx) => tx`select id from users limit 1`))[0].id;
    await withSystem('test decision', (tx) => tx`insert into policy_decisions (customer_user_id, scope, tenant_id, action, reason_code, reason_internal, customer_explanation, reviewer_user_id, reviewer_role, is_experimental)
      values (${c.user.userId}, 'tenant', ${s.tenantId}, 'require_full_payment', 'test', 'test', 'test', ${reviewer}, 'owner', true)`);
    for (const k of ['deposit', 'on_site'] as const) {
      await expect(s.run((tx) => createHold(tx, cust(c.user.userId), { branchId: s.branchId, items: [{ serviceId: s.services.haircut, staffId: s.staff.sara, startsAt: nextSlot(), addonIds: [] }], termsKind: k, tenantCustomerId: c.tenantCustomerId, customerUserId: c.user.userId, source: 'online' }))).rejects.toMatchObject({ code: 'payment_required' });
    }
    const ok = await s.run((tx) => createHold(tx, cust(c.user.userId), { branchId: s.branchId, items: [{ serviceId: s.services.haircut, staffId: s.staff.sara, startsAt: nextSlot(), addonIds: [] }], termsKind: 'full', tenantCustomerId: c.tenantCustomerId, customerUserId: c.user.userId, source: 'online' }));
    expect(ok.terms.appliedAction).toBe('require_full_payment');
  });
});

describe('stock', () => {
  it('one unit, two concurrent checkouts: no negative stock, one winner; failed payment releases exactly once', async () => {
    const [prod] = await s.run((tx) => tx<{ id: string }[]>`insert into products (tenant_id, name, price_minor) values (${s.tenantId}, 'Serum', 8000) returning id`);
    const [inv] = await s.run((tx) => tx<{ id: string }[]>`insert into inventory_items (tenant_id, branch_id, usage, product_id, name, on_hand) values (${s.tenantId}, ${s.branchId}, 'retail', ${prod.id}, 'Serum', 1) returning id`);
    const buyers = await Promise.all([makeCustomer(s, 'B1'), makeCustomer(s, 'B2')]);
    const carts = await Promise.all(buyers.map((b) => s.run(async (tx) => {
      const cart = await getOrCreateCart(tx, s.tenantId, { userId: b.user.userId });
      await setCartLine(tx, s.tenantId, cart, { productId: prod.id, quantity: 1 });
      return cart;
    })));
    const results = await Promise.allSettled(buyers.map((b, i) => s.run((tx) => checkoutCart(tx, s.tenantId, { userId: b.user.userId, tenantCustomerId: b.tenantCustomerId }, carts[i], { branchId: s.branchId, acceptedSubtotalMinor: 8000, payAtPickup: false }))));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const winnerIdx = results.findIndex((r) => r.status === 'fulfilled');
    const order = (results[winnerIdx] as PromiseFulfilledResult<{ orderId: string }>).value;
    let [i] = await s.run((tx) => tx`select on_hand, reserved from inventory_items where id = ${inv.id}`);
    expect([Number(i.onHand), Number(i.reserved)]).toEqual([1, 1]);
    const p = await s.run((tx) => startOrderPayment(tx, buyers[winnerIdx].user.userId, order.orderId, `o-${uniq()}`));
    const fail = await sandboxEmit(p.paymentId, 'failed');
    await processProviderEvent('sandbox', fail.body, fail.headers);
    await s.run((tx) => tx`update orders set hold_expires_at = now() - interval '1 s' where id = ${order.orderId}`);
    await s.run((tx) => expireUnpaidOrders(tx)); // second release attempt must be a no-op
    [i] = await s.run((tx) => tx`select on_hand, reserved from inventory_items where id = ${inv.id}`);
    expect([Number(i.onHand), Number(i.reserved)]).toEqual([1, 0]);
    const moves = await s.run((tx) => tx`select kind from stock_movements where inventory_item_id = ${inv.id} order by created_at`);
    expect(moves.map((m) => m.kind)).toEqual(['reservation', 'release']);
  });

  it('collection deducts stock once and recognizes product revenue', async () => {
    const [prod] = await s.run((tx) => tx<{ id: string }[]>`insert into products (tenant_id, name, price_minor, cost_minor) values (${s.tenantId}, 'Oil', 5000, 2000) returning id`);
    const [inv] = await s.run((tx) => tx<{ id: string }[]>`insert into inventory_items (tenant_id, branch_id, usage, product_id, name, on_hand) values (${s.tenantId}, ${s.branchId}, 'retail', ${prod.id}, 'Oil', 5) returning id`);
    const b = await makeCustomer(s, 'Buyer');
    const cart = await s.run(async (tx) => {
      const id = await getOrCreateCart(tx, s.tenantId, { userId: b.user.userId });
      await setCartLine(tx, s.tenantId, id, { productId: prod.id, quantity: 2 });
      return id;
    });
    const o = await s.run((tx) => checkoutCart(tx, s.tenantId, { userId: b.user.userId, tenantCustomerId: b.tenantCustomerId }, cart, { branchId: s.branchId, acceptedSubtotalMinor: 10000, payAtPickup: false }));
    const p = await s.run((tx) => startOrderPayment(tx, b.user.userId, o.orderId, `o-${uniq()}`));
    const ok = await sandboxEmit(p.paymentId, 'succeeded');
    await processProviderEvent('sandbox', ok.body, ok.headers);
    const owner = await s.ctx();
    await s.run((tx) => transitionOrder(tx, owner, o.orderId, 'ready'));
    await s.run((tx) => transitionOrder(tx, owner, o.orderId, 'collected'));
    await expect(s.run((tx) => transitionOrder(tx, owner, o.orderId, 'collected'))).rejects.toMatchObject({ code: 'invalid_transition' });
    const [i] = await s.run((tx) => tx`select on_hand, reserved from inventory_items where id = ${inv.id}`);
    expect([Number(i.onHand), Number(i.reserved)]).toEqual([3, 0]);
  });

  it('price change between quote and checkout requires re-approval', async () => {
    const [prod] = await s.run((tx) => tx<{ id: string }[]>`insert into products (tenant_id, name, price_minor) values (${s.tenantId}, 'Mask', 3000) returning id`);
    await s.run((tx) => tx`insert into inventory_items (tenant_id, branch_id, usage, product_id, name, on_hand) values (${s.tenantId}, ${s.branchId}, 'retail', ${prod.id}, 'Mask', 5)`);
    const b = await makeCustomer(s, 'PC');
    const cart = await s.run(async (tx) => {
      const id = await getOrCreateCart(tx, s.tenantId, { userId: b.user.userId });
      await setCartLine(tx, s.tenantId, id, { productId: prod.id, quantity: 1 });
      return id;
    });
    await s.run((tx) => tx`update products set price_minor = 3500 where id = ${prod.id}`);
    await expect(s.run((tx) => checkoutCart(tx, s.tenantId, { userId: b.user.userId, tenantCustomerId: b.tenantCustomerId }, cart, { branchId: s.branchId, acceptedSubtotalMinor: 3000, payAtPickup: false }))).rejects.toMatchObject({ code: 'conflict' });
  });
});
