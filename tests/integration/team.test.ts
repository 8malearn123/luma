import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '@/server/db';
import { createStaff, decideLeave, requestLeave, setStaffStatus, updateOwnProfile, updateStaff, clock, correctAttendance, createStaffRequest, decideStaffRequest, createCommissionRule, listCommissionRules, setWeeklyHours } from '@/server/services/team';
import { findAvailability } from '@/server/booking/availability';
import { createHold, type Actor } from '@/server/booking/service';
import { selfProfileInput } from '@/lib/validation/team';
import { at, futureDate, makeCustomer, makeSalon, type SalonFixture } from '../booking-fixtures';
import { addMember } from '../fixtures';

afterAll(closeDb);
let s: SalonFixture;
beforeAll(async () => {
  s = await makeSalon();
});
const cust = (userId: string): Actor => ({ kind: 'customer', userId, tenantId: s.tenantId });

describe('team & HR', () => {
  it('specialist edits only allowed fields of her own profile', async () => {
    const u = await addMember(s, 'specialist', { staffProfileId: s.staff.hana });
    const ctx = await s.ctx(u);
    expect(selfProfileInput.strict().safeParse({ bio: 'x', displayName: 'Hacked' }).success).toBe(false);
    await s.run((tx) => updateOwnProfile(tx, ctx, { bio: 'Colour specialist' }));
    const [row] = await s.run((tx) => tx`select bio, display_name from staff_profiles where id = ${s.staff.hana}`);
    expect(row).toMatchObject({ bio: 'Colour specialist', displayName: 'Hana' });
    await expect(s.run((tx) => updateStaff(tx, ctx, s.staff.lama, { displayName: 'X', branchIds: [s.branchId], serviceIds: [], publicVisible: true, allocationWeight: 1 }, 1))).rejects.toMatchObject({ code: 'forbidden' });
    // she cannot request leave for someone else
    await expect(s.run((tx) => requestLeave(tx, ctx, { staffId: s.staff.lama, startsAt: at(futureDate(2, 20), '00:00'), endsAt: at(futureDate(2, 20), '23:00'), type: 'annual' }))).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('leave approval returns conflicting bookings and then blocks availability', async () => {
    const d = futureDate(4, 21);
    const c = await makeCustomer(s, 'LeaveCust');
    await s.run((tx) => createHold(tx, cust(c.user.userId), { branchId: s.branchId, items: [{ serviceId: s.services.nails, staffId: s.staff.lama, startsAt: at(d, '13:00'), addonIds: [] }], termsKind: 'on_site', tenantCustomerId: c.tenantCustomerId, customerUserId: c.user.userId, source: 'online' }));
    const lama = await addMember(s, 'specialist', { staffProfileId: s.staff.lama });
    const lamaCtx = await s.ctx(lama);
    const req = await s.run((tx) => requestLeave(tx, lamaCtx, { staffId: s.staff.lama, startsAt: at(d, '00:00'), endsAt: at(d, '23:59'), type: 'sick' }));
    expect(req.conflicts).toHaveLength(1);
    // specialist cannot approve her own leave
    await expect(s.run((tx) => decideLeave(tx, lamaCtx, req.id, 'approved'))).rejects.toMatchObject({ code: 'forbidden' });
    const owner = await s.ctx();
    const r = await s.run((tx) => decideLeave(tx, owner, req.id, 'approved'));
    expect(r.conflicts).toHaveLength(1);
    const avail = await s.run((tx) => findAvailability(tx, s.tenantId, { branchId: s.branchId, items: [{ serviceId: s.services.nails, staffId: s.staff.lama, addonIds: [] }], from: d, days: 1 }, 'public'));
    expect(avail.days[0].slots).toHaveLength(0);
    // overlapping second request is rejected by the database
    await expect(s.run((tx) => requestLeave(tx, lamaCtx, { staffId: s.staff.lama, startsAt: at(d, '10:00'), endsAt: at(d, '12:00'), type: 'other' }))).rejects.toMatchObject({ code: '23P01' });
  });

  it('deactivating staff keeps bookings and notifies management', async () => {
    const owner = await s.ctx();
    await s.run((tx) => tx`update plan_features set limit_value = 30 where feature_key = 'staff.max' and plan_id = (select plan_id from subscriptions limit 1)`);
    const staff = await s.run((tx) => createStaff(tx, owner, { displayName: 'Temp', branchIds: [s.branchId], serviceIds: [s.services.nails], publicVisible: true, allocationWeight: 100 }));
    await s.run((tx) => setWeeklyHours(tx, owner, { branchId: s.branchId, staffId: staff.id, days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, ranges: [{ start: '09:00', end: '21:00' }] })), breaks: [] }));
    const c = await makeCustomer(s, 'DeactCust');
    const h = await s.run((tx) => createHold(tx, cust(c.user.userId), { branchId: s.branchId, items: [{ serviceId: s.services.nails, staffId: staff.id, startsAt: at(futureDate(5, 22), '19:00'), addonIds: [] }], termsKind: 'on_site', tenantCustomerId: c.tenantCustomerId, customerUserId: c.user.userId, source: 'online' }));
    const r = await s.run((tx) => setStaffStatus(tx, owner, staff.id, 'inactive'));
    expect(r.affectedBookings.map((b) => b.bookingId)).toContain(h.bookingId);
    const [b] = await s.run((tx) => tx`select status from bookings where id = ${h.bookingId}`);
    expect(b.status).toBe('held');
    const notes = await s.run((tx) => tx`select count(*)::int as n from notifications where user_id = ${s.owner.userId} and type = 'staff.future_bookings_need_action'`);
    expect(notes[0].n).toBeGreaterThan(0);
  });

  it('staff limit from the plan is enforced', async () => {
    const owner = await s.ctx();
    const [plan] = await s.run((tx) => tx<{ planId: string }[]>`select plan_id from subscriptions limit 1`);
    await s.run((tx) => tx`update plan_features set limit_value = 1 where plan_id = ${plan.planId} and feature_key = 'staff.max'`);
    await expect(s.run((tx) => createStaff(tx, owner, { displayName: 'Over', branchIds: [s.branchId], serviceIds: [], publicVisible: true, allocationWeight: 100 }))).rejects.toMatchObject({ code: 'plan_limit' });
    await s.run((tx) => tx`update plan_features set limit_value = 30 where plan_id = ${plan.planId} and feature_key = 'staff.max'`);
  });

  it('attendance: clock in/out sequence, append-only manager corrections; staff requests flow', async () => {
    const u = await addMember(s, 'specialist', { staffProfileId: s.staff.sara });
    const ctx = await s.ctx(u);
    await expect(s.run((tx) => clock(tx, ctx, 'clock_out'))).rejects.toMatchObject({ code: 'invalid_transition' });
    await s.run((tx) => clock(tx, ctx, 'clock_in'));
    await expect(s.run((tx) => clock(tx, ctx, 'clock_in'))).rejects.toMatchObject({ code: 'invalid_transition' });
    await s.run((tx) => clock(tx, ctx, 'clock_out'));
    await expect(s.run((tx) => correctAttendance(tx, ctx, { staffId: s.staff.sara, kind: 'clock_in', at: new Date(Date.now() - 3600e3).toISOString(), note: 'forgot' }))).rejects.toMatchObject({ code: 'forbidden' });
    const owner = await s.ctx();
    await s.run((tx) => correctAttendance(tx, owner, { staffId: s.staff.sara, kind: 'clock_in', at: new Date(Date.now() - 3600e3).toISOString(), note: 'forgot to clock in' }));
    const req = await s.run((tx) => createStaffRequest(tx, ctx, { kind: 'equipment', details: 'New dryer' }));
    await expect(s.run((tx) => decideStaffRequest(tx, ctx, req.id, 'approved'))).rejects.toMatchObject({ code: 'forbidden' });
    await s.run((tx) => decideStaffRequest(tx, owner, req.id, 'approved', 'ok'));
  });

  it('commission rules are closed and replaced, never edited in place', async () => {
    const owner = await s.ctx();
    await s.run((tx) => createCommissionRule(tx, owner, { staffId: s.staff.hana, kind: 'percentage', rateBps: 1000, effectiveFrom: '2026-01-01' }));
    await s.run((tx) => createCommissionRule(tx, owner, { staffId: s.staff.hana, kind: 'percentage', rateBps: 1500, effectiveFrom: '2026-06-01' }));
    const rules = await s.run((tx) => listCommissionRules(tx));
    const hana = rules.filter((r) => r.staffId === s.staff.hana);
    expect(hana).toHaveLength(2);
    expect(hana.find((r) => r.rateBps === 1000)?.effectiveTo).toBe('2026-05-31');
    const rec = await s.ctx(await addMember(s, 'receptionist'));
    await expect(s.run((tx) => createCommissionRule(tx, rec, { kind: 'fixed', fixedMinor: 100, effectiveFrom: '2026-01-01' }))).rejects.toMatchObject({ code: 'forbidden' });
  });
});
