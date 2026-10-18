import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '@/server/db';
import { deviceOf, isBot, recordConversion, recordEvent, referrerHost } from '@/server/analytics/events';
import { storeMetrics } from '@/server/analytics/metrics';
import { computeOccupancy } from '@/server/analytics/occupancy';
import { staffPerformance } from '@/server/analytics/performance';
import { createHold, transition, type Actor } from '@/server/booking/service';
import { at, futureDate, makeCustomer, makeSalon, type SalonFixture } from '../booking-fixtures';

afterAll(closeDb);

let s: SalonFixture;
beforeAll(async () => {
  s = await makeSalon();
});

const ev = (type: Parameters<typeof recordEvent>[1]['type'], session: string, extra: Partial<Parameters<typeof recordEvent>[1]> = {}) =>
  s.run((tx) => recordEvent(tx, { tenantId: s.tenantId, eventId: randomUUID(), type, sessionRaw: session, visitorRaw: `v-${session}`, device: 'mobile', isBot: false, isInternal: false, ...extra }));

describe('event collection', () => {
  it('dedups by event id, classifies bots/devices, ignores self-referrals', async () => {
    const id = randomUUID();
    const base = { tenantId: s.tenantId, eventId: id, type: 'page_view' as const, sessionRaw: 'dedup', device: 'desktop' as const, isBot: false, isInternal: false, at: new Date(Date.now() - 3600e3) };
    expect(await s.run((tx) => recordEvent(tx, base))).toBe(true);
    expect(await s.run((tx) => recordEvent(tx, base))).toBe(false); // iframe refresh / retry re-sending the same id
    expect(isBot('Googlebot/2.1')).toBe(true);
    expect(isBot('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile')).toBe(false);
    expect(deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile')).toBe('mobile');
    expect(deviceOf(null)).toBe('unknown');
    expect(referrerHost('https://luma.test/s/x', 'luma.test')).toBeNull();
    expect(referrerHost('https://www.instagram.com/p/1', 'luma.test')).toBe('instagram.com');
  });

  it('conversion rate = converting eligible sessions ÷ eligible sessions; bookings/session can exceed 1; previews & bots excluded', async () => {
    const from = new Date(Date.now() - 60000);
    await ev('page_view', 's1');
    await ev('service_view', 's1', { entityType: 'service', entityId: s.services.haircut });
    await ev('page_view', 's2');
    await ev('page_view', 'bot', { isBot: true });
    await ev('page_view', 'preview', { isInternal: true });
    await ev('booking_confirmed', 's1');
    await ev('booking_confirmed', 's1');
    await ev('booking_confirmed', 's1');
    await s.run((tx) => recordConversion(tx, s.tenantId, 'order_paid', randomUUID(), null)); // no session → unattributed
    const m = await s.run((tx) => storeMetrics(tx, from, new Date(Date.now() + 60000)));
    expect(m.sessions).toBe(2);
    expect(m.convertingSessions).toBe(1);
    expect(m.conversionRate).toBe(0.5);
    expect(m.bookingsPerSession).toBe(1.5);
    expect(m.unattributedConversions).toBe(1);
    expect(m.excluded.bots).toBe(1);
    expect(m.excluded.internal).toBe(1);
    expect(m.topServiceViews[0]).toMatchObject({ serviceId: s.services.haircut, views: 1 });
    expect(m.sources[0].source).toBe('direct/unknown');
  });

  it('server-side conversions are counted once per booking', async () => {
    const ref = randomUUID();
    await s.run((tx) => recordConversion(tx, s.tenantId, 'booking_confirmed', ref, 'conv-session'));
    await s.run((tx) => recordConversion(tx, s.tenantId, 'booking_confirmed', ref, 'conv-session'));
    const { uuidFrom } = await import('@/server/analytics/events');
    const [r] = await s.run((tx) => tx`select count(*)::int as n from analytics_events where event_id = ${uuidFrom(`booking_confirmed:${ref}`)}`);
    expect(r.n).toBe(1);
  });
});

describe('occupancy and performance', () => {
  it('occupancy = booked minutes ÷ available minutes (after breaks); holds are not booked', async () => {
    const d = futureDate(2, 3);
    const c = await makeCustomer(s, 'Occ');
    const actor: Actor = { kind: 'customer', userId: c.user.userId, tenantId: s.tenantId };
    const h = await s.run((tx) => createHold(tx, actor, { branchId: s.branchId, items: [{ serviceId: s.services.color, staffId: s.staff.hana, startsAt: at(d, '10:00'), addonIds: [] }], termsKind: 'on_site', tenantCustomerId: c.tenantCustomerId, customerUserId: c.user.userId, source: 'online' }));
    let o = await s.run((tx) => computeOccupancy(tx, s.branchId, d, 1));
    const hana = () => o.staff.find((x) => x.staffId === s.staff.hana)!;
    expect(hana().availableMin).toBe(7 * 60); // 10–18 minus 1h break
    expect(hana().bookedMin).toBe(0); // only held
    await s.run((tx) => transition(tx, actor, h.bookingId, 'confirmed'));
    o = await s.run((tx) => computeOccupancy(tx, s.branchId, d, 1));
    expect(hana().bookedMin).toBe(90);
    expect(hana().occupancy).toBeCloseTo(90 / 420);
  });

  it('small samples show insufficient data instead of a ranking; composite only when sufficient', async () => {
    const from = new Date(Date.now() - 90 * 86400000);
    const perf = await s.run((tx) => staffPerformance(tx, s.tenantId, s.branchId, new Date(from).toISOString().slice(0, 10), 90, from, new Date()));
    for (const p of perf) {
      expect(p.satisfaction.sufficient).toBe(false);
      expect(p.satisfaction.value).toBeNull();
      expect(p.composite.value).toBeNull();
      expect(p.composite.weightsAreTestValues).toBe(true);
    }
  });
});
