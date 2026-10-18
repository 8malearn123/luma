import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NextRequest } from 'next/server';
import { closeDb, withTenant } from '@/server/db';
import { createHold, ensureTenantCustomer } from '@/server/booking/service';
import {
  customerActor,
  customerTenantRelationship,
  myBookingDetail,
  myBookings,
  myConsents,
  myPaymentStatus,
  publicBookingCatalog,
  setConsent,
} from '@/server/booking/customer';
import { resolveCart, cartView } from '@/server/booking/cart';
import { getOrCreateCart, setCartLine } from '@/server/commerce/orders';
import { connectSandbox, processProviderEvent, startBookingPayment } from '@/server/payments/service';
import type { BaseCtx } from '@/server/http/handler';
import { at, futureDate, makeSalon, type SalonFixture } from '../booking-fixtures';
import { makeUser, uniq } from '../fixtures';

afterAll(closeDb);

let a: SalonFixture;
let b: SalonFixture;
beforeAll(async () => {
  a = await makeSalon();
  b = await makeSalon();
});

async function bookAt(s: SalonFixture, userId: string, name: string, time: string, terms: 'on_site' | 'full' = 'on_site') {
  // run exactly like the API does: tenant scope + the CUSTOMER's user id (customer_self_read RLS active)
  return withTenant({ tenantId: s.tenantId, userId }, async (tx) => {
    const tc = await customerTenantRelationship(tx, s.tenantId, userId, name);
    return createHold(tx, customerActor(userId, s.tenantId), {
      branchId: s.branchId,
      items: [{ serviceId: s.services.nails, staffId: s.staff.lama, startsAt: at(futureDate(2, 6), time), addonIds: [] }],
      termsKind: terms,
      tenantCustomerId: tc,
      customerUserId: userId,
      source: 'online',
    });
  });
}

const fakeCtx = (user: { userId: string } | null, cartKey: string | null) =>
  ({ user, req: { cookies: { get: (n: string) => (n === 'luma_cart' && cartKey ? { value: cartKey } : undefined) } } as unknown as NextRequest }) as unknown as BaseCtx;

describe('central customer across two businesses', () => {
  it('each business sees only its own booking; the customer sees both', async () => {
    const u = await makeUser({ name: 'Reem' });
    const ha = await bookAt(a, u.userId, 'Reem', '12:00');
    const hb = await bookAt(b, u.userId, 'Reem', '13:00');
    const inA = await a.run((tx) => tx`select id from bookings where customer_user_id = ${u.userId}`);
    expect(inA.map((r) => r.id)).toEqual([ha.bookingId]);
    const inB = await b.run((tx) => tx`select id from bookings where customer_user_id = ${u.userId}`);
    expect(inB.map((r) => r.id)).toEqual([hb.bookingId]);
    // tenant A cannot read B's relationship row for the same person
    const rel = await a.run((tx) => tx`select tenant_id from tenant_customers where user_id = ${u.userId}`);
    expect(rel.every((r) => r.tenantId === a.tenantId)).toBe(true);
    const mine = await myBookings(u.userId);
    expect(new Set(mine.map((x) => x.id))).toEqual(new Set([ha.bookingId, hb.bookingId]));
    expect(mine.find((x) => x.id === ha.bookingId)?.services[0]).toContain('Nails');
  });

  it('another customer’s booking id is indistinguishable from a missing one (404)', async () => {
    const owner = await makeUser({ name: 'Owner of booking' });
    const intruder = await makeUser({ name: 'Intruder' });
    const h = await bookAt(a, owner.userId, 'Owner of booking', '14:00');
    await expect(myBookingDetail(intruder.userId, h.bookingId)).rejects.toMatchObject({ code: 'not_found' });
    await expect(myBookingDetail(intruder.userId, 'not-a-uuid')).rejects.toMatchObject({ code: 'not_found' });
    const d = await myBookingDetail(owner.userId, h.bookingId);
    expect(d.tenant.id).toBe(a.tenantId);
    expect(d.allowed).toContain('confirmed');
    expect(d.cancelRefundPreviewMinor).toBe(0);
  });

  it('payment status is only visible to the paying customer', async () => {
    const owner = await a.ctx();
    await a.run((tx) => connectSandbox(tx, owner));
    await a.run((tx) => tx`update booking_policies set allow_full_online = true`);
    const u = await makeUser({ name: 'Payer' });
    const other = await makeUser({ name: 'Other' });
    const h = await bookAt(a, u.userId, 'Payer', '15:00', 'full');
    const p = await a.run((tx) => startBookingPayment(tx, u.userId, h.bookingId, `k-${uniq()}`));
    expect((await myPaymentStatus(u.userId, p.paymentId)).status).toBe('processing');
    await expect(myPaymentStatus(other.userId, p.paymentId)).rejects.toMatchObject({ code: 'not_found' });
  });

  it('public catalog never exposes costs or hidden services', async () => {
    await a.run((tx) => tx`update services set material_cost_minor = 1234 where id = ${a.services.haircut}`);
    await a.run((tx) => tx`insert into services (tenant_id, name, price_minor, duration_min, is_visible) values (${a.tenantId}, 'Secret', 100, 30, false)`);
    const cat = await a.run((tx) => publicBookingCatalog(tx));
    expect(cat.services.some((s) => s.name === 'Secret')).toBe(false);
    expect(JSON.stringify(cat)).not.toContain('1234');
    expect(cat.services[0]).not.toHaveProperty('materialCostMinor');
  });
});

describe('cart', () => {
  it('an anonymous cart is adopted into the account cart after sign-in; customers never see cost', async () => {
    const [prod] = await a.run((tx) => tx<{ id: string }[]>`insert into products (tenant_id, name, price_minor, cost_minor) values (${a.tenantId}, 'Balm', 4000, 1500) returning id`);
    await a.run((tx) => tx`insert into inventory_items (tenant_id, branch_id, usage, product_id, name, on_hand) values (${a.tenantId}, ${a.branchId}, 'retail', ${prod.id}, 'Balm', 3)`);
    const anonKey = `anon_${uniq()}_${uniq()}`;
    await a.run(async (tx) => {
      const c = await getOrCreateCart(tx, a.tenantId, { anonKey });
      await setCartLine(tx, a.tenantId, c, { productId: prod.id, quantity: 2 });
    });
    const u = await makeUser({ name: 'Shopper' });
    const view = await withTenant({ tenantId: a.tenantId, userId: u.userId }, async (tx) => {
      const { cartId } = await resolveCart(tx, a.tenantId, fakeCtx(u, anonKey), false);
      return cartView(tx, cartId, a.branchId);
    });
    expect(view.lines).toHaveLength(1);
    expect(view.lines[0].quantity).toBe(2);
    expect(view.subtotalMinor).toBe(8000);
    expect(JSON.stringify(view)).not.toContain('1500');
    // the anonymous cart is gone (converted)
    const anon = await withTenant({ tenantId: a.tenantId }, async (tx) => resolveCart(tx, a.tenantId, fakeCtx(null, anonKey), false));
    const left = await withTenant({ tenantId: a.tenantId }, (tx) => cartView(tx, anon.cartId, a.branchId));
    expect(left.lines).toHaveLength(0);
  });
});

describe('consents', () => {
  it('opt-in then opt-out is recorded as history and the latest wins', async () => {
    const u = await makeUser({ name: 'Consent' });
    await a.run((tx) => ensureTenantCustomer(tx, a.tenantId, { userId: u.userId, displayName: 'Consent' }));
    await setConsent(u.userId, a.tenantId, 'whatsapp', true);
    expect((await myConsents(u.userId))[0].channels.whatsapp).toBe(true);
    await setConsent(u.userId, a.tenantId, 'whatsapp', false);
    const c = await myConsents(u.userId);
    expect(c).toHaveLength(1);
    expect(c[0].channels.whatsapp).toBe(false);
    const rows = await a.run((tx) => tx`select status from customer_consents where user_id = ${u.userId} order by recorded_at`);
    expect(rows.map((r) => r.status)).toEqual(['granted', 'revoked']);
    // no relationship with B → cannot set consent there
    await expect(setConsent(u.userId, b.tenantId, 'sms', true)).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('webhook inputs', () => {
  it('garbage and unknown-payment events are rejected without effects', async () => {
    expect(await processProviderEvent('sandbox', 'not json', new Headers())).toBe('rejected');
    expect(await processProviderEvent('sandbox', JSON.stringify({ id: 'e1', data: {} }), new Headers())).toBe('rejected');
    expect(await processProviderEvent('sandbox', JSON.stringify({ id: `e-${uniq()}`, data: { id: 'sbx_doesnotexist' } }), new Headers())).toBe('unknown_payment');
  });
});
