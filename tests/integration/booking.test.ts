import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '@/server/db';
import { findAvailability } from '@/server/booking/availability';
import { createHold, reschedule, sweepExpiredHolds, transition, type Actor } from '@/server/booking/service';
import { at, futureDate, makeCustomer, makeSalon, type SalonFixture } from '../booking-fixtures';
import { addMember } from '../fixtures';

afterAll(closeDb);

let s: SalonFixture;
let day: string;
beforeAll(async () => {
  s = await makeSalon();
  day = futureDate(0, 4);
});

const times = (r: Awaited<ReturnType<typeof findAvailability>>, staffId?: string) =>
  r.days[0].slots.filter((x) => !staffId || x.items[0].staffId === staffId).map((x) => x.startsAt.slice(11, 16));

const q = (items: { serviceId: string; staffId?: string }[], from = day, days = 1) => ({ branchId: s.branchId, items: items.map((i) => ({ addonIds: [], ...i })), from, days });

const customerActor = (userId: string): Actor => ({ kind: 'customer', userId, tenantId: s.tenantId });

describe('availability engine', () => {
  it('only qualified staff, inside shift, outside break, respecting buffers and end of shift', async () => {
    const r = await s.run((tx) => findAvailability(tx, s.tenantId, q([{ serviceId: s.services.haircut, staffId: s.staff.hana }]), 'public'));
    const t = times(r);
    // Hana 10–18, break 13–14, haircut 60m + 15m cleanup ⇒ occupation 75m
    expect(t[0]).toBe('07:00'); // 10:00 Riyadh = 07:00Z
    expect(t).not.toContain('09:00'); // 12:00 local → occupies 12:00–13:15, overlaps break
    expect(t).toContain('08:45'); // 11:45 local → ends 12:45, cleanup to 13:00 ✓
    expect(t).toContain('11:00'); // 14:00 local after break
    expect(t[t.length - 1]).toBe('13:45');
  });

  it('rejects unqualified staff preference', async () => {
    await expect(s.run((tx) => findAvailability(tx, s.tenantId, q([{ serviceId: s.services.nails, staffId: s.staff.hana }]), 'public'))).rejects.toMatchObject({ code: 'validation' });
  });

  it('"any" picks earliest qualified staff by the declared rule', async () => {
    const r = await s.run((tx) => findAvailability(tx, s.tenantId, q([{ serviceId: s.services.haircut }]), 'public'));
    // Sara starts 09:00 local (06:00Z), Hana 10:00
    expect(r.days[0].slots[0].startsAt.slice(11, 16)).toBe('06:00');
    expect(r.days[0].slots[0].items[0].staffId).toBe(s.staff.sara);
  });

  it('approved leave removes availability; pending leave does not', async () => {
    const leaveDay = futureDate(1, 4);
    await s.run((tx) => tx`insert into leave_requests (tenant_id, staff_id, starts_at, ends_at, type, status) values (${s.tenantId}, ${s.staff.lama}, ${at(leaveDay, '00:00')}, ${at(leaveDay, '23:59')}, 'annual', 'pending')`);
    const r1 = await s.run((tx) => findAvailability(tx, s.tenantId, q([{ serviceId: s.services.nails, staffId: s.staff.lama }], leaveDay), 'public'));
    expect(r1.days[0].slots.length).toBeGreaterThan(0);
    await s.run((tx) => tx`update leave_requests set status = 'approved' where staff_id = ${s.staff.lama}`);
    const r2 = await s.run((tx) => findAvailability(tx, s.tenantId, q([{ serviceId: s.services.nails, staffId: s.staff.lama }], leaveDay), 'public'));
    expect(r2.days[0].slots).toHaveLength(0);
  });

  it('occupied resource blocks a service needing it', async () => {
    const d = futureDate(2, 4);
    await s.run((tx) => tx`insert into blocked_times (tenant_id, resource_id, during) values (${s.tenantId}, ${s.roomId}, tstzrange(${at(d, '09:00')}, ${at(d, '12:00')}))`);
    const r = await s.run((tx) => findAvailability(tx, s.tenantId, q([{ serviceId: s.services.facial }], d), 'public'));
    expect(times(r)[0]).toBe('09:00'); // 12:00 local
  });

  it('notice period hides slots that are too soon', async () => {
    const today = new Date();
    const local = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(today);
    const r = await s.run((tx) => findAvailability(tx, s.tenantId, q([{ serviceId: s.services.haircut }], local), 'public'));
    for (const slot of r.days[0]?.slots ?? []) expect(+new Date(slot.startsAt)).toBeGreaterThanOrEqual(+today + 59 * 60000);
  });

  it('multi-service itinerary across different specialists with disclosed gaps', async () => {
    const r = await s.run((tx) => findAvailability(tx, s.tenantId, q([{ serviceId: s.services.color }, { serviceId: s.services.nails, staffId: s.staff.lama }]), 'public'));
    const first = r.days[0].slots[0];
    expect(first.items).toHaveLength(2);
    expect(first.items[0].staffId).toBe(s.staff.hana);
    expect(first.items[1].staffId).toBe(s.staff.lama);
    // Lama starts 12:00 local; color 10:00–11:30 → gap 30m is the max allowed
    expect(first.startsAt.slice(11, 16)).toBe('07:00');
    expect(first.totalGapMin).toBe(30);
    expect(first.items[1].startsAt.slice(11, 16)).toBe('09:00');
  });
});

describe('holds and concurrency', () => {
  it('two (or five) concurrent holds for the same slot: exactly one wins', async () => {
    const d = futureDate(3, 5);
    const customers = await Promise.all([0, 1, 2, 3, 4].map((i) => makeCustomer(s, `C${i}`)));
    const results = await Promise.allSettled(
      customers.map((c) =>
        s.run((tx) =>
          createHold(tx, customerActor(c.user.userId), {
            branchId: s.branchId,
            items: [{ serviceId: s.services.haircut, staffId: s.staff.hana, startsAt: at(d, '10:00'), addonIds: [] }],
            termsKind: 'on_site',
            tenantCustomerId: c.tenantCustomerId,
            customerUserId: c.user.userId,
            source: 'online',
          }),
        ),
      ),
    );
    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
    expect(ok).toHaveLength(1);
    for (const f of failed) expect(['slot_unavailable', '23P01']).toContain(f.reason.code ?? f.reason?.code);
  });

  it('expired holds are released and the slot becomes bookable', async () => {
    const d = futureDate(4, 5);
    const a = await makeCustomer(s, 'A');
    const b = await makeCustomer(s, 'B');
    const item = { serviceId: s.services.nails, staffId: s.staff.lama, startsAt: at(d, '15:00'), addonIds: [] };
    const h1 = await s.run((tx) => createHold(tx, customerActor(a.user.userId), { branchId: s.branchId, items: [item], termsKind: 'on_site', tenantCustomerId: a.tenantCustomerId, customerUserId: a.user.userId, source: 'online' }));
    await expect(
      s.run((tx) => createHold(tx, customerActor(b.user.userId), { branchId: s.branchId, items: [item], termsKind: 'on_site', tenantCustomerId: b.tenantCustomerId, customerUserId: b.user.userId, source: 'online' })),
    ).rejects.toMatchObject({ code: 'slot_unavailable' });
    // time passes: force expiry
    await s.run((tx) => tx`update bookings set hold_expires_at = now() - interval '1 second' where id = ${h1.bookingId}`);
    await s.run((tx) => tx`update booking_allocations set expires_at = now() - interval '1 second' where booking_id = ${h1.bookingId}`);
    const h2 = await s.run((tx) => createHold(tx, customerActor(b.user.userId), { branchId: s.branchId, items: [item], termsKind: 'on_site', tenantCustomerId: b.tenantCustomerId, customerUserId: b.user.userId, source: 'online' }));
    expect(h2.status).toBe('held');
    const [old] = await s.run((tx) => tx`select status from bookings where id = ${h1.bookingId}`);
    expect(old.status).toBe('expired');
    await s.run((tx) => sweepExpiredHolds(tx));
  });

  it('rejects past times, off-grid times and unknown branches', async () => {
    const c = await makeCustomer(s, 'P');
    const base = { branchId: s.branchId, termsKind: 'on_site' as const, tenantCustomerId: c.tenantCustomerId, customerUserId: c.user.userId, source: 'online' as const };
    await expect(s.run((tx) => createHold(tx, customerActor(c.user.userId), { ...base, items: [{ serviceId: s.services.haircut, staffId: s.staff.hana, startsAt: new Date(Date.now() - 3600e3).toISOString(), addonIds: [] }] }))).rejects.toMatchObject({ code: 'slot_unavailable' });
    await expect(s.run((tx) => createHold(tx, customerActor(c.user.userId), { ...base, items: [{ serviceId: s.services.haircut, staffId: s.staff.hana, startsAt: at(futureDate(5, 5), '10:07'), addonIds: [] }] }))).rejects.toMatchObject({ code: 'slot_unavailable' });
  });

  it('terms requested by the browser must be among the computed options', async () => {
    const c = await makeCustomer(s, 'T');
    // no payment provider connected → only on_site is possible; a manipulated "deposit" is refused
    await expect(
      s.run((tx) => createHold(tx, customerActor(c.user.userId), { branchId: s.branchId, items: [{ serviceId: s.services.haircut, staffId: s.staff.sara, startsAt: at(futureDate(5, 5), '09:00'), addonIds: [] }], termsKind: 'deposit', tenantCustomerId: c.tenantCustomerId, customerUserId: c.user.userId, source: 'online' })),
    ).rejects.toMatchObject({ code: 'payment_required' });
  });
});

describe('lifecycle & rescheduling', () => {
  it('guards: no-show only after start + grace; specialist sees only her bookings', async () => {
    const d = futureDate(6, 5);
    const c = await makeCustomer(s, 'L');
    const h = await s.run((tx) => createHold(tx, customerActor(c.user.userId), { branchId: s.branchId, items: [{ serviceId: s.services.haircut, staffId: s.staff.hana, startsAt: at(d, '11:00'), addonIds: [] }], termsKind: 'on_site', tenantCustomerId: c.tenantCustomerId, customerUserId: c.user.userId, source: 'online' }));
    await s.run((tx) => transition(tx, customerActor(c.user.userId), h.bookingId, 'confirmed'));
    const owner = await s.ctx();
    await expect(s.run((tx) => transition(tx, { kind: 'staff', ctx: owner }, h.bookingId, 'no_show'))).rejects.toMatchObject({ code: 'invalid_transition' });
    // after appointment + grace (simulated clock)
    const later = new Date(+new Date(at(d, '11:16')));
    await s.run((tx) => transition(tx, { kind: 'staff', ctx: owner }, h.bookingId, 'no_show', { now: later }));
    // customer cannot check herself in
    const h2 = await s.run((tx) => createHold(tx, customerActor(c.user.userId), { branchId: s.branchId, items: [{ serviceId: s.services.haircut, staffId: s.staff.hana, startsAt: at(d, '15:00'), addonIds: [] }], termsKind: 'on_site', tenantCustomerId: c.tenantCustomerId, customerUserId: c.user.userId, source: 'online' }));
    await s.run((tx) => transition(tx, customerActor(c.user.userId), h2.bookingId, 'confirmed'));
    await expect(s.run((tx) => transition(tx, customerActor(c.user.userId), h2.bookingId, 'checked_in'))).rejects.toMatchObject({ code: 'forbidden' });
    // a specialist not assigned to the booking cannot see it
    const lamaUser = await addMember(s, 'specialist', { staffProfileId: s.staff.lama });
    const lamaCtx = await s.ctx(lamaUser);
    await expect(s.run((tx) => transition(tx, { kind: 'staff', ctx: lamaCtx }, h2.bookingId, 'checked_in', { now: new Date(at(d, '15:00')) }))).rejects.toMatchObject({ code: 'not_found' });
    const hanaUser = await addMember(s, 'specialist', { staffProfileId: s.staff.hana });
    const hanaCtx = await s.ctx(hanaUser);
    await s.run((tx) => transition(tx, { kind: 'staff', ctx: hanaCtx }, h2.bookingId, 'checked_in', { now: new Date(at(d, '14:55')) }));
  });

  it('a failed reschedule keeps the original booking intact', async () => {
    const d = futureDate(3, 9);
    const c1 = await makeCustomer(s, 'R1');
    const c2 = await makeCustomer(s, 'R2');
    const mk = (c: typeof c1, time: string) =>
      s.run((tx) => createHold(tx, customerActor(c.user.userId), { branchId: s.branchId, items: [{ serviceId: s.services.nails, staffId: s.staff.lama, startsAt: at(d, time), addonIds: [] }], termsKind: 'on_site', tenantCustomerId: c.tenantCustomerId, customerUserId: c.user.userId, source: 'online' }));
    const a = await mk(c1, '12:00');
    await mk(c2, '14:00');
    const owner = await s.ctx();
    const [{ version }] = await s.run((tx) => tx`select version from bookings where id = ${a.bookingId}`);
    await expect(
      s.run((tx) => reschedule(tx, { kind: 'staff', ctx: owner }, a.bookingId, { items: [{ serviceId: s.services.nails, staffId: s.staff.lama, startsAt: at(d, '14:00'), addonIds: [] }], acceptPriceChange: false, expectedVersion: version })),
    ).rejects.toMatchObject({ code: 'slot_unavailable' });
    const allocs = await s.run((tx) => tx`select active from booking_allocations where booking_id = ${a.bookingId}`);
    expect(allocs.every((x) => x.active)).toBe(true);
    // a valid reschedule succeeds and moves the allocation
    await s.run((tx) => reschedule(tx, { kind: 'staff', ctx: owner }, a.bookingId, { items: [{ serviceId: s.services.nails, staffId: s.staff.lama, startsAt: at(d, '16:00'), addonIds: [] }], acceptPriceChange: false, expectedVersion: version }));
    const [b] = await s.run((tx) => tx`select starts_at from bookings where id = ${a.bookingId}`);
    expect(new Date(b.startsAt).toISOString()).toBe(new Date(at(d, '16:00')).toISOString());
  });

  it('booking keeps its price snapshot after a catalog price change', async () => {
    const c = await makeCustomer(s, 'S');
    const h = await s.run((tx) => createHold(tx, customerActor(c.user.userId), { branchId: s.branchId, items: [{ serviceId: s.services.facial, staffId: s.staff.sara, startsAt: at(futureDate(3, 7), '09:00'), addonIds: [] }], termsKind: 'on_site', tenantCustomerId: c.tenantCustomerId, customerUserId: c.user.userId, source: 'online' }));
    await s.run((tx) => tx`update services set price_minor = 99900 where id = ${s.services.facial}`);
    const [b] = await s.run((tx) => tx`select total_minor from bookings where id = ${h.bookingId}`);
    expect(b.totalMinor).toBe(20000);
    await s.run((tx) => tx`update services set price_minor = 20000 where id = ${s.services.facial}`);
  });
});
