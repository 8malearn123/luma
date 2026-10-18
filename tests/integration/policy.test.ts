import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, withSystem } from '@/server/db';
import { createHold, transition, type Actor } from '@/server/booking/service';
import { computePaymentTerms } from '@/server/booking/terms';
import { resolvePlatformContext } from '@/server/tenancy/context';
import {
  createPlatformDecision,
  createTenantDecision,
  customerPolicyView,
  expireDecisions,
  getIncident,
  listIncidents,
  reviewIncident,
  resolveAppealAsTenant,
  submitAppeal,
  submitIncident,
  suggestForCustomer,
  upsertRule,
} from '@/server/policy/service';
import { at, futureDate, makeCustomer, makeSalon, type SalonFixture } from '../booking-fixtures';
import { makeUser } from '../fixtures';

afterAll(closeDb);

let s: SalonFixture;
let other: SalonFixture;
beforeAll(async () => {
  s = await makeSalon();
  other = await makeSalon();
});

const cust = (f: SalonFixture, userId: string): Actor => ({ kind: 'customer', userId, tenantId: f.tenantId });
let n = 0;

/** Confirmed booking that ended in a no-show (clock simulated). */
async function noShowBooking(f: SalonFixture, c: Awaited<ReturnType<typeof makeCustomer>>) {
  const d = futureDate(n % 7, 4 + Math.floor(n / 7) * 7);
  const time = ['09:00', '10:30', '12:00', '14:00'][Math.floor(n / 7) % 4];
  n++;
  const h = await f.run((tx) => createHold(tx, cust(f, c.user.userId), { branchId: f.branchId, items: [{ serviceId: f.services.haircut, staffId: f.staff.sara, startsAt: at(d, time), addonIds: [] }], termsKind: 'on_site', tenantCustomerId: c.tenantCustomerId, customerUserId: c.user.userId, source: 'online' }));
  await f.run((tx) => transition(tx, cust(f, c.user.userId), h.bookingId, 'confirmed'));
  const owner = await f.ctx();
  await f.run((tx) => transition(tx, { kind: 'staff', ctx: owner }, h.bookingId, 'no_show', { now: new Date(+new Date(at(d, time)) + 20 * 60000) }));
  return h.bookingId;
}

async function platformUser(role: 'platform_owner' | 'policy_reviewer' | 'support_admin') {
  const u = await makeUser({ name: role });
  await withSystem('test', (tx) => tx`insert into platform_staff (user_id, role) values (${u.userId}, ${role})`);
  return { u, p: await resolvePlatformContext(u, randomUUID(), null) };
}

describe('incidents', () => {
  it('no-show incident requires an eligible real booking; duplicates are prevented', async () => {
    const c = await makeCustomer(s, 'I1');
    const owner = await s.ctx();
    const d = futureDate(2, 9);
    const h = await s.run((tx) => createHold(tx, cust(s, c.user.userId), { branchId: s.branchId, items: [{ serviceId: s.services.nails, staffId: s.staff.lama, startsAt: at(d, '13:00'), addonIds: [] }], termsKind: 'on_site', tenantCustomerId: c.tenantCustomerId, customerUserId: c.user.userId, source: 'online' }));
    await expect(s.run((tx) => submitIncident(tx, owner, { bookingId: h.bookingId, type: 'no_show', description: 'did not arrive at all', evidence: [], requestPlatformReview: false }))).rejects.toMatchObject({ code: 'validation' });
    const bid = await noShowBooking(s, c);
    await s.run((tx) => submitIncident(tx, owner, { bookingId: bid, type: 'no_show', description: 'did not arrive at all', evidence: [], requestPlatformReview: false }));
    await expect(s.run((tx) => submitIncident(tx, owner, { bookingId: bid, type: 'no_show', description: 'did not arrive again', evidence: [], requestPlatformReview: false }))).rejects.toMatchObject({ code: '23505' });
    // a random/other-tenant booking id is invisible
    await expect(s.run((tx) => submitIncident(tx, owner, { bookingId: randomUUID(), type: 'no_show', description: 'did not arrive at all', evidence: [], requestPlatformReview: false }))).rejects.toMatchObject({ code: 'not_found' });
  });

  it('review flow: confirm → corrected; invalid transitions rejected; tenant B cannot see A', async () => {
    const c = await makeCustomer(s, 'I2');
    const owner = await s.ctx();
    const bid = await noShowBooking(s, c);
    const inc = await s.run((tx) => submitIncident(tx, owner, { bookingId: bid, type: 'no_show', description: 'no show without notice', evidence: [{ kind: 'note', ref: 'called twice' }], requestPlatformReview: false }));
    await s.run((tx) => reviewIncident(tx, owner, inc.id, 'confirmed', 'verified with front desk'));
    await expect(s.run((tx) => reviewIncident(tx, owner, inc.id, 'rejected', 'changed my mind'))).rejects.toMatchObject({ code: 'invalid_transition' });
    await s.run((tx) => reviewIncident(tx, owner, inc.id, 'corrected', 'customer showed proof'));
    const det = await s.run((tx) => getIncident(tx, inc.id));
    expect(det.reviews.map((r) => r.toStatus)).toEqual(['confirmed', 'corrected']);
    const otherOwner = await other.ctx();
    expect((await other.run((tx) => listIncidents(tx))).find((x) => x.id === inc.id)).toBeUndefined();
    await expect(other.run((tx) => getIncident(tx, inc.id))).rejects.toMatchObject({ code: 'not_found' });
    await expect(other.run((tx) => reviewIncident(tx, otherOwner, inc.id, 'confirmed', 'not mine to review'))).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('eligibility', () => {
  it('one confirmed report never changes platform-wide eligibility; rules only suggest', async () => {
    const c = await makeCustomer(s, 'E1');
    const owner = await s.ctx();
    const bid = await noShowBooking(s, c);
    const inc = await s.run((tx) => submitIncident(tx, owner, { bookingId: bid, type: 'no_show', description: 'no show without notice', evidence: [], requestPlatformReview: true }));
    await s.run((tx) => reviewIncident(tx, owner, inc.id, 'confirmed', 'verified'));
    // the OTHER business still sees default terms for this customer
    const terms = await other.run((tx) => computePaymentTerms(tx, other.tenantId, c.user.userId, 10000));
    expect(terms.appliedAction).toBe('default');
    // even an enabled, satisfied rule produces a suggestion only
    const { p } = await platformUser('policy_reviewer');
    await upsertRule(p, { name: 'test rule', incidentType: 'no_show', minConfirmedIncidents: 1, windowDays: 365, minDistinctTenants: 1, suggestedAction: 'require_deposit', isExperimental: true, enabled: true });
    const sug = await withSystem('t', (tx) => suggestForCustomer(tx, c.user.userId));
    expect(sug.length).toBeGreaterThan(0);
    const [{ count }] = await withSystem('t', (tx) => tx<{ count: number }[]>`select count(*)::int from policy_decisions where customer_user_id = ${c.user.userId}`);
    expect(count).toBe(0);
    await withSystem('t', (tx) => tx`update policy_rules set enabled = false where name = 'test rule'`);
  });

  it('tenant decision applies only to that tenant; expiry job restores default', async () => {
    const c = await makeCustomer(s, 'E2');
    await makeCustomer(other, 'E2-other');
    const owner = await s.ctx();
    const d = await s.run((tx) => createTenantDecision(tx, owner, { tenantCustomerId: c.tenantCustomerId, action: 'require_full_payment', reasonCode: 'repeat_no_show', reasonInternal: 'two confirmed no-shows', customerExplanation: 'Full prepayment is required for your next bookings.', evidenceIncidentIds: [], expiresAt: new Date(Date.now() + 86400e3).toISOString(), reviewAt: new Date(Date.now() + 3600e3).toISOString() }));
    expect((await s.run((tx) => computePaymentTerms(tx, s.tenantId, c.user.userId, 10000))).appliedAction).toBe('require_full_payment');
    expect((await other.run((tx) => computePaymentTerms(tx, other.tenantId, c.user.userId, 10000))).appliedAction).toBe('default');
    await withSystem('t', (tx) => tx`update policy_decisions set effective_at = now() - interval '2 hours', expires_at = now() - interval '1 second', review_at = null where id = ${d.id}`);
    const r = await withSystem('job', (tx) => expireDecisions(tx));
    expect(r.expired).toBeGreaterThanOrEqual(1);
    expect((await s.run((tx) => computePaymentTerms(tx, s.tenantId, c.user.userId, 10000))).appliedAction).toBe('default');
  });

  it('appeal overturned → decision revoked, incident corrected, terms back to default', async () => {
    const c = await makeCustomer(s, 'E3');
    const owner = await s.ctx();
    const bid = await noShowBooking(s, c);
    const inc = await s.run((tx) => submitIncident(tx, owner, { bookingId: bid, type: 'no_show', description: 'no show without notice', evidence: [], requestPlatformReview: false }));
    await s.run((tx) => reviewIncident(tx, owner, inc.id, 'confirmed', 'verified'));
    const d = await s.run((tx) => createTenantDecision(tx, owner, { tenantCustomerId: c.tenantCustomerId, action: 'require_deposit', reasonCode: 'no_show', reasonInternal: 'confirmed no-show on record', customerExplanation: 'A deposit is required for your next bookings.', evidenceIncidentIds: [inc.id], expiresAt: new Date(Date.now() + 86400e3 * 30).toISOString(), reviewAt: new Date(Date.now() + 86400e3 * 7).toISOString() }));
    const view = await customerPolicyView(c.user.userId);
    expect(view.decisions[0]).toMatchObject({ id: d.id, customerExplanation: 'A deposit is required for your next bookings.' });
    expect(view.decisions[0]).not.toHaveProperty('reasonInternal');
    expect(view.incidents[0]).not.toHaveProperty('description');
    const ap = await submitAppeal(c.user.userId, { decisionId: d.id, statement: 'I was in hospital that day, I have a report.' });
    await expect(submitAppeal(c.user.userId, { decisionId: d.id, statement: 'second appeal on same decision' })).rejects.toMatchObject({ code: '23505' });
    // another customer cannot appeal someone else's decision
    const stranger = await makeUser();
    await expect(submitAppeal(stranger.userId, { decisionId: d.id, statement: 'not my decision at all' })).rejects.toMatchObject({ code: 'not_found' });
    await resolveAppealAsTenant(owner, ap.id, 'overturned', 'medical report verified');
    const [dec] = await withSystem('t', (tx) => tx`select status from policy_decisions where id = ${d.id}`);
    expect(dec.status).toBe('revoked');
    const det = await s.run((tx) => getIncident(tx, inc.id));
    expect(det.incident.status).toBe('corrected');
    expect((await s.run((tx) => computePaymentTerms(tx, s.tenantId, c.user.userId, 10000))).appliedAction).toBe('default');
  });

  it('a salon cannot resolve another salon’s appeal; platform decisions need confirmed evidence', async () => {
    const c = await makeCustomer(s, 'E4');
    const owner = await s.ctx();
    const d = await s.run((tx) => createTenantDecision(tx, owner, { tenantCustomerId: c.tenantCustomerId, action: 'manual_approval', reasonCode: 'conduct', reasonInternal: 'conduct incident reviewed', customerExplanation: 'Bookings require approval by the business.', evidenceIncidentIds: [], expiresAt: new Date(Date.now() + 86400e3).toISOString(), reviewAt: new Date(Date.now() + 3600e3).toISOString() }));
    const ap = await submitAppeal(c.user.userId, { decisionId: d.id, statement: 'please review this decision' });
    const otherOwner = await other.ctx();
    await expect(resolveAppealAsTenant(otherOwner, ap.id, 'overturned', 'not my tenant')).rejects.toMatchObject({ code: 'not_found' });
    const { p } = await platformUser('policy_reviewer');
    await expect(createPlatformDecision(p, { customerUserId: c.user.userId, action: 'require_deposit', reasonCode: 'pattern', reasonInternal: 'no confirmed evidence', customerExplanation: 'Deposit required on LUMA.', evidenceIncidentIds: [randomUUID()], expiresAt: new Date(Date.now() + 86400e3).toISOString(), reviewAt: new Date(Date.now() + 3600e3).toISOString() })).rejects.toMatchObject({ code: 'validation' });
    // policy reviewer cannot suspend accounts
    await expect(createPlatformDecision(p, { customerUserId: c.user.userId, action: 'suspend_account', reasonCode: 'pattern', reasonInternal: 'no confirmed evidence', customerExplanation: 'Suspended.', evidenceIncidentIds: [randomUUID()], expiresAt: new Date(Date.now() + 86400e3).toISOString(), reviewAt: new Date(Date.now() + 3600e3).toISOString() })).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('specialist without delegation cannot submit incidents', async () => {
    const { addMember } = await import('../fixtures');
    const spec = await addMember(s, 'specialist', { staffProfileId: s.staff.hana });
    const ctx = await s.ctx(spec);
    await expect(s.run((tx) => submitIncident(tx, ctx, { bookingId: randomUUID(), type: 'no_show', description: 'did not arrive at all', evidence: [], requestPlatformReview: false }))).rejects.toMatchObject({ code: 'forbidden' });
  });
});
