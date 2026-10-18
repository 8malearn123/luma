import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { closeDb, sql } from '@/server/db';
import { createSession } from '@/server/auth/service';
import { addMember, makeTenant, makeUser, uniq } from '../fixtures';
import { at, futureDate, makeCustomer, makeSalon, type SalonFixture } from '../booking-fixtures';
import { createHold, transition, type Actor } from '@/server/booking/service';

// The API wrapper reads the session cookie via next/headers; supply it per request.
let currentToken: string | null = null;
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (n === 'luma_session' && currentToken ? { value: currentToken } : undefined) }),
  headers: async () => new Headers(),
}));

const tokens = new Map<string, string>();
async function tokenFor(userId: string) {
  if (!tokens.has(userId)) tokens.set(userId, (await createSession(userId, null, 'vitest')).token);
  return tokens.get(userId)!;
}

type Route = (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
async function call(route: Route, userId: string, url: string, params: Record<string, string>, init: { method?: string; body?: unknown; key?: string } = {}) {
  currentToken = await tokenFor(userId);
  const headers: Record<string, string> = { 'x-luma-request': '1' };
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  if (init.key || (init.method && init.method !== 'GET')) headers['idempotency-key'] = init.key ?? `k${uniq()}xx`;
  const req = new NextRequest(`http://localhost:3000${url}`, { method: init.method ?? 'GET', headers, body: init.body !== undefined ? JSON.stringify(init.body) : undefined });
  const res = await route(req, { params: Promise.resolve(params) });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

const finance = await import('@/app/api/v1/t/[tenant]/finance/route');
const bookingsRoute = await import('@/app/api/v1/t/[tenant]/bookings/route');
const bookingById = await import('@/app/api/v1/t/[tenant]/bookings/[id]/route');
const ordersById = await import('@/app/api/v1/t/[tenant]/orders/[id]/route');
const customersById = await import('@/app/api/v1/t/[tenant]/customers/[id]/route');
const members = await import('@/app/api/v1/t/[tenant]/members/route');
const memberById = await import('@/app/api/v1/t/[tenant]/members/[id]/route');
const refunds = await import('@/app/api/v1/t/[tenant]/finance/refunds/route');
const expenses = await import('@/app/api/v1/t/[tenant]/finance/expenses/route');
const expenseVoid = await import('@/app/api/v1/t/[tenant]/finance/expenses/[id]/void/route');
const capacity = await import('@/app/api/v1/t/[tenant]/inventory/capacity/route');
const products = await import('@/app/api/v1/t/[tenant]/products/route');
const accept = await import('@/app/api/v1/invitations/accept/route');

afterAll(closeDb);

let s: SalonFixture;
let other: Awaited<ReturnType<typeof makeTenant>>;
let receptionist: Awaited<ReturnType<typeof makeUser>>;
let financeUser: Awaited<ReturnType<typeof makeUser>>;
let manager: Awaited<ReturnType<typeof makeUser>>;
let hanaUser: Awaited<ReturnType<typeof makeUser>>;
let bookingHana: string;
let bookingLama: string;

const cust = (userId: string, tenantId: string): Actor => ({ kind: 'customer', userId, tenantId });

beforeAll(async () => {
  s = await makeSalon();
  other = await makeTenant({ name: 'Other Salon' });
  receptionist = await addMember(s, 'receptionist');
  financeUser = await addMember(s, 'finance');
  manager = await addMember(s, 'manager');
  hanaUser = await addMember(s, 'specialist', { staffProfileId: s.staff.hana });
  const d = futureDate(2, 5);
  const c = await makeCustomer(s, 'Dana');
  const mk = (staffId: string, serviceId: string, time: string) =>
    s.run((tx) => createHold(tx, cust(c.user.userId, s.tenantId), { branchId: s.branchId, items: [{ serviceId, staffId, startsAt: at(d, time), addonIds: [] }], termsKind: 'on_site', tenantCustomerId: c.tenantCustomerId, customerUserId: c.user.userId, source: 'online' }));
  bookingHana = (await mk(s.staff.hana, s.services.haircut, '10:00')).bookingId;
  bookingLama = (await mk(s.staff.lama, s.services.nails, '15:00')).bookingId;
  for (const b of [bookingHana, bookingLama]) await s.run((tx) => transition(tx, cust(c.user.userId, s.tenantId), b, 'confirmed'));
});

describe('capability gating at the API', () => {
  it('receptionist cannot read costs/profit (403); finance can', async () => {
    const r = await call(finance.GET as Route, receptionist.userId, `/api/v1/t/${s.slug}/finance`, { tenant: s.slug });
    expect(r.status).toBe(403);
    const f = await call(finance.GET as Route, financeUser.userId, `/api/v1/t/${s.slug}/finance`, { tenant: s.slug });
    expect(f.status).toBe(200);
    expect(f.json.figures.depositsHeld).toBeDefined();
  });

  it('receptionist product list hides confidential cost', async () => {
    await s.run((tx) => tx`insert into products (tenant_id, name, price_minor, cost_minor) values (${s.tenantId}, 'Cost test', 1000, 400)`);
    const r = await call(products.GET as Route, manager.userId, `/api/v1/t/${s.slug}/products`, { tenant: s.slug });
    // manager has inventory.manage → may list, but not costs without finance.view
    expect(r.status).toBe(200);
    expect(r.json.items.every((p: Record<string, unknown>) => !('costMinor' in p))).toBe(true);
  });

  it('specialist list shows only her assigned bookings', async () => {
    const r = await call(bookingsRoute.GET as Route, hanaUser.userId, `/api/v1/t/${s.slug}/bookings`, { tenant: s.slug });
    expect(r.status).toBe(200);
    const ids = r.json.items.map((b: { id: string }) => b.id);
    expect(ids).toContain(bookingHana);
    expect(ids).not.toContain(bookingLama);
    const direct = await call(bookingById.GET as Route, hanaUser.userId, `/api/v1/t/${s.slug}/bookings/${bookingLama}`, { tenant: s.slug, id: bookingLama });
    expect(direct.status).toBe(404);
  });

  it('finance gets a financial view without customer names', async () => {
    const r = await call(bookingsRoute.GET as Route, financeUser.userId, `/api/v1/t/${s.slug}/bookings`, { tenant: s.slug });
    expect(r.status).toBe(200);
    expect(r.json.scope).toBe('financial');
    expect(r.json.items.every((b: { customerName: string | null }) => b.customerName === null)).toBe(true);
  });
});

describe('identifier manipulation', () => {
  it("another tenant's booking/order/customer ids → 404, and a foreign tenant slug → 404", async () => {
    const oc = await makeCustomer(s, 'X'); // irrelevant; use other tenant's ids below
    void oc;
    const [ob] = await sql()`select 1`; // keep connection warm
    void ob;
    const otherOwner = other.owner;
    // other tenant's owner tries s's booking via her own tenant slug
    const r1 = await call(bookingById.GET as Route, otherOwner.userId, `/api/v1/t/${other.slug}/bookings/${bookingHana}`, { tenant: other.slug, id: bookingHana });
    expect(r1.status).toBe(404);
    // or via s's slug (not a member)
    const r2 = await call(bookingById.GET as Route, otherOwner.userId, `/api/v1/t/${s.slug}/bookings/${bookingHana}`, { tenant: s.slug, id: bookingHana });
    expect(r2.status).toBe(404);
    const [tc] = await s.run((tx) => tx<{ id: string }[]>`select id from tenant_customers limit 1`);
    const r3 = await call(customersById.GET as Route, otherOwner.userId, `/api/v1/t/${other.slug}/customers/${tc.id}`, { tenant: other.slug, id: tc.id });
    expect(r3.status).toBe(404);
    const r4 = await call(ordersById.GET as Route, otherOwner.userId, `/api/v1/t/${other.slug}/orders/${'00000000-0000-4000-8000-000000000000'}`, { tenant: other.slug, id: '00000000-0000-4000-8000-000000000000' });
    expect(r4.status).toBe(404);
  });

  it('staff booking creation cannot reference another tenant’s customer', async () => {
    const [foreign] = await other.ctx().then(() => sql()`select 1`);
    void foreign;
    const oc = await (async () => {
      const u = await makeUser({ name: 'Foreign' });
      const { ensureTenantCustomer } = await import('@/server/booking/service');
      const { withTenant } = await import('@/server/db');
      return withTenant({ tenantId: other.tenantId }, (tx) => ensureTenantCustomer(tx, other.tenantId, { userId: u.userId, displayName: 'Foreign' }));
    })();
    const r = await call(bookingsRoute.POST as Route, receptionist.userId, `/api/v1/t/${s.slug}/bookings`, { tenant: s.slug }, {
      method: 'POST',
      body: { branchId: s.branchId, items: [{ serviceId: s.services.haircut, staffId: s.staff.sara, startsAt: at(futureDate(4, 6), '09:00') }], termsKind: 'on_site', tenantCustomerId: oc },
    });
    expect(r.status).toBe(422); // invalid reference (RLS: not visible in this tenant)
  });
});

describe('customer self-read does not leak into staff APIs', () => {
  it('a receptionist at salon B cannot act on her OWN customer booking at salon A through B’s API', async () => {
    const c = await makeCustomer(s, 'DualRole');
    const h = await s.run((tx) => createHold(tx, cust(c.user.userId, s.tenantId), { branchId: s.branchId, items: [{ serviceId: s.services.nails, staffId: s.staff.lama, startsAt: at(futureDate(6, 6), '13:00'), addonIds: [] }], termsKind: 'on_site', tenantCustomerId: c.tenantCustomerId, customerUserId: c.user.userId, source: 'online' }));
    const { withTenant } = await import('@/server/db');
    await withTenant({ tenantId: other.tenantId }, (tx) => tx`insert into tenant_memberships (tenant_id, user_id, role) values (${other.tenantId}, ${c.user.userId}, 'receptionist')`);
    const get = await call(bookingById.GET as Route, c.user.userId, `/api/v1/t/${other.slug}/bookings/${h.bookingId}`, { tenant: other.slug, id: h.bookingId });
    expect(get.status).toBe(404);
    const transitionRoute = await import('@/app/api/v1/t/[tenant]/bookings/[id]/transition/route');
    const t = await call(transitionRoute.POST as Route, c.user.userId, `/api/v1/t/${other.slug}/bookings/${h.bookingId}/transition`, { tenant: other.slug, id: h.bookingId }, { method: 'POST', body: { to: 'confirmed' } });
    expect(t.status).toBe(404);
    const list = await call(bookingsRoute.GET as Route, c.user.userId, `/api/v1/t/${other.slug}/bookings`, { tenant: other.slug });
    expect(list.json.items.map((b: { id: string }) => b.id)).not.toContain(h.bookingId);
  });
});

describe('team administration', () => {
  it('receptionist cannot invite; manager cannot assign owner/manager or non-delegable caps', async () => {
    const r = await call(members.POST as Route, receptionist.userId, `/api/v1/t/${s.slug}/members`, { tenant: s.slug }, { method: 'POST', body: { email: `x${uniq()}@t.luma`, role: 'specialist' } });
    expect(r.status).toBe(403);
    await s.run((tx) => tx`update tenant_memberships set granted_caps = '{team.manage}' where user_id = ${manager.userId}`);
    const asOwner = await call(members.POST as Route, manager.userId, `/api/v1/t/${s.slug}/members`, { tenant: s.slug }, { method: 'POST', body: { email: `x${uniq()}@t.luma`, role: 'owner' } });
    expect(asOwner.status).toBe(422);
    const asMgr = await call(members.POST as Route, manager.userId, `/api/v1/t/${s.slug}/members`, { tenant: s.slug }, { method: 'POST', body: { email: `x${uniq()}@t.luma`, role: 'manager' } });
    expect(asMgr.status).toBe(403);
    const [recM] = await s.run((tx) => tx<{ id: string }[]>`select id from tenant_memberships where user_id = ${receptionist.userId}`);
    const bad = await call(memberById.PATCH as Route, manager.userId, `/api/v1/t/${s.slug}/members/${recM.id}`, { tenant: s.slug, id: recM.id }, { method: 'PATCH', body: { grantedCaps: ['finance.view'] } });
    expect(bad.status).toBe(422); // finance.view is not delegable to receptionists
    const own = await call(memberById.PATCH as Route, manager.userId, `/api/v1/t/${s.slug}/members/${recM.id}`, { tenant: s.slug, id: recM.id }, { method: 'PATCH', body: { grantedCaps: ['incidents.submit'] } });
    expect(own.status).toBe(403); // manager does not hold incidents.submit herself
  });

  it('invitations: accepted once by the invited contact; expired invitations rejected', async () => {
    const invitee = await makeUser({ name: 'Invitee' });
    const r = await call(members.POST as Route, s.owner.userId, `/api/v1/t/${s.slug}/members`, { tenant: s.slug }, { method: 'POST', body: { email: invitee.email, role: 'receptionist' } });
    expect(r.status).toBe(200);
    const token = r.json.link.split('/').pop();
    const stranger = await makeUser({ name: 'Stranger' });
    expect((await call(accept.POST as Route, stranger.userId, '/api/v1/invitations/accept', {}, { method: 'POST', body: { token } })).status).toBe(403);
    const ok = await call(accept.POST as Route, invitee.userId, '/api/v1/invitations/accept', {}, { method: 'POST', body: { token } });
    expect(ok.status).toBe(200);
    expect(ok.json.role).toBe('receptionist');
    expect((await call(accept.POST as Route, invitee.userId, '/api/v1/invitations/accept', {}, { method: 'POST', body: { token } })).status).toBe(404);

    const late = await makeUser({ name: 'Late' });
    const r2 = await call(members.POST as Route, s.owner.userId, `/api/v1/t/${s.slug}/members`, { tenant: s.slug }, { method: 'POST', body: { email: late.email, role: 'specialist' } });
    await s.run((tx) => tx`update invitations set expires_at = now() - interval '1 minute', created_at = now() - interval '8 days' where id = ${r2.json.id}`);
    const exp = await call(accept.POST as Route, late.userId, '/api/v1/invitations/accept', {}, { method: 'POST', body: { token: r2.json.link.split('/').pop() } });
    expect(exp.status).toBe(409);
  });
});

describe('finance', () => {
  it('issuing a refund requires a recent step-up', async () => {
    const r = await call(refunds.POST as Route, s.owner.userId, `/api/v1/t/${s.slug}/finance/refunds`, { tenant: s.slug }, { method: 'POST', body: { paymentId: '00000000-0000-4000-8000-000000000000', amountMinor: 100, reason: 'test' } });
    // the owner's fixture session is fresh (step_up_at = now) → passes step-up, then the unknown payment is 404
    expect(r.status).toBe(404);
    await sql()`update sessions set step_up_at = now() - interval '1 hour' where user_id = ${s.owner.userId}`;
    const r2 = await call(refunds.POST as Route, s.owner.userId, `/api/v1/t/${s.slug}/finance/refunds`, { tenant: s.slug }, { method: 'POST', body: { paymentId: '00000000-0000-4000-8000-000000000000', amountMinor: 100, reason: 'test' } });
    expect(r2.status).toBe(403);
    expect(r2.json.error.message).toBe('errors.step_up_required');
  });

  it('voiding an expense keeps history and offsets the journal', async () => {
    const e = await call(expenses.POST as Route, financeUser.userId, `/api/v1/t/${s.slug}/finance/expenses`, { tenant: s.slug }, { method: 'POST', body: { category: 'rent', amountMinor: 50000, incurredOn: new Date().toISOString().slice(0, 10) } });
    expect(e.status).toBe(200);
    const v = await call(expenseVoid.POST as Route, financeUser.userId, `/api/v1/t/${s.slug}/finance/expenses/${e.json.id}/void`, { tenant: s.slug, id: e.json.id }, { method: 'POST', body: { reason: 'entered twice' } });
    expect(v.status).toBe(200);
    const [row] = await s.run((tx) => tx`select voided_at, void_reason from expenses where id = ${e.json.id}`);
    expect(row.voidedAt).toBeTruthy();
    const [bal] = await s.run((tx) => tx`select coalesce(sum(debit_minor - credit_minor),0)::int as n from financial_entries where account = 'expenses' and ref_id = ${e.json.id}`);
    expect(bal.n).toBe(0);
  });

  it('deposits are a liability (not revenue) and profit reports "costs incomplete" when costs are missing', async () => {
    const { connectSandbox, startBookingPayment, sandboxEmit, processProviderEvent } = await import('@/server/payments/service');
    const ownerCtx = await s.ctx();
    await s.run((tx) => connectSandbox(tx, ownerCtx));
    await s.run((tx) => tx`update booking_policies set deposit_mode = 'percent', deposit_value = 3000, allow_full_online = true`);
    const c = await makeCustomer(s, 'Payer');
    const h = await s.run((tx) => createHold(tx, cust(c.user.userId, s.tenantId), { branchId: s.branchId, items: [{ serviceId: s.services.facial, staffId: s.staff.sara, startsAt: at(futureDate(5, 6), '09:00'), addonIds: [] }], termsKind: 'deposit', tenantCustomerId: c.tenantCustomerId, customerUserId: c.user.userId, source: 'online' }));
    const p = await s.run((tx) => startBookingPayment(tx, c.user.userId, h.bookingId, `k${uniq()}`));
    const ev = await sandboxEmit(p.paymentId, 'succeeded');
    await processProviderEvent('sandbox', ev.body, ev.headers);
    const today = new Date().toISOString().slice(0, 10);
    const f = await call(finance.GET as Route, financeUser.userId, `/api/v1/t/${s.slug}/finance?from=${today}&to=${today}`, { tenant: s.slug });
    expect(f.json.figures.depositsHeld.valueMinor).toBeGreaterThanOrEqual(6000);
    expect(f.json.figures.serviceRevenue.valueMinor).toBe(0);
    expect(f.json.figures.collectionsOnline.valueMinor).toBeGreaterThanOrEqual(6000);
    // a completed service without recipe or material cost → costs incomplete
    const ownerA = { kind: 'staff' as const, ctx: ownerCtx };
    await s.run((tx) => transition(tx, ownerA, bookingHana, 'checked_in', { now: new Date(at(futureDate(2, 5), '10:00')) }));
    await s.run((tx) => transition(tx, ownerA, bookingHana, 'completed', { now: new Date(at(futureDate(2, 5), '11:00')) }));
    const f2 = await call(finance.GET as Route, financeUser.userId, `/api/v1/t/${s.slug}/finance?from=${today}&to=${futureDate(2, 5)}`, { tenant: s.slug });
    expect(f2.json.profit.status).toBe('costs_incomplete');
    expect(f2.json.profit.missing).toContain('service_material_costs');
  });

  it('capacity estimate refuses without an approved recipe', async () => {
    const r = await call(capacity.GET as Route, manager.userId, `/api/v1/t/${s.slug}/inventory/capacity?serviceId=${s.services.facial}&branchId=${s.branchId}`, { tenant: s.slug });
    expect(r.status).toBe(200);
    expect(r.json.status).toBe('cannot_estimate');
    expect(r.json.missing).toContain('recipe');
    const [it] = await s.run((tx) => tx<{ id: string }[]>`insert into inventory_items (tenant_id, branch_id, usage, name, unit, on_hand) values (${s.tenantId}, ${s.branchId}, 'material', 'Mask gel', 'ml', 1000) returning id`);
    await s.run((tx) => tx`insert into service_material_recipes (tenant_id, service_id, inventory_item_id, quantity, unit, approved_at) values (${s.tenantId}, ${s.services.facial}, ${it.id}, 30, 'ml', now())`);
    const r2 = await call(capacity.GET as Route, manager.userId, `/api/v1/t/${s.slug}/inventory/capacity?serviceId=${s.services.facial}&branchId=${s.branchId}`, { tenant: s.slug });
    expect(r2.json).toMatchObject({ status: 'estimated', approxBookings: 33 });
  });
});
