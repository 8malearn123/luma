import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, withTenant } from '@/server/db';
import { setTestProvider } from '@/server/ai/provider';
import { createFakeProvider } from '@/server/ai/fake';
import { buildSnapshot } from '@/server/marketing/snapshot';
import { generateRuleRecommendations } from '@/server/marketing/recommendations';
import { checkClaims, enforceMargin } from '@/server/marketing/validate';
import { generateAndSaveRecommendations } from '@/server/marketing/pipeline';
import { jobKey, planPeriodFor, regeneratePlan, requestAnalysis, runAnalysis } from '@/server/marketing/analysis';
import { getPlan, transitionPlan } from '@/server/marketing/plans';
import { adjustForQuietHours, approveCampaign, buildRecipients, campaignResults, createCampaign, createSegment, optOut, sendCampaign } from '@/server/marketing/campaigns';
import { makeTenant, addMember, type TenantFixture } from '../fixtures';
import { makeCustomer, makeSalon, type SalonFixture } from '../booking-fixtures';
import { addDays, utcToWall } from '@/lib/tz';

afterAll(closeDb);
afterEach(() => setTestProvider(null));

const today = () => utcToWall(new Date(), 'Asia/Riyadh').date;

async function upgrade(t: TenantFixture) {
  await withTenant({ tenantId: t.tenantId }, (tx) => tx`update subscriptions set plan_id = (select id from plans where code = 'wahaj') where tenant_id = ${t.tenantId}`);
}

/** Insert a completed historical visit directly (holds cannot be created in the past). */
async function visit(s: SalonFixture, tenantCustomerId: string, serviceId: string, staffId: string, daysAgo: number, priceMinor = 15000) {
  await s.run(async (tx) => {
    const start = new Date(Date.now() - daysAgo * 86400000);
    start.setUTCHours(8, 0, 0, 0);
    const end = new Date(+start + 60 * 60000);
    const [b] = await tx<{ id: string }[]>`insert into bookings (tenant_id, branch_id, number, tenant_customer_id, status, financial_status, source, starts_at, ends_at, subtotal_minor, total_minor, paid_minor, payment_terms, completed_at)
      values (${s.tenantId}, ${s.branchId}, ${`H-${Math.random().toString(36).slice(2, 10)}`}, ${tenantCustomerId}, 'completed', 'paid', 'staff', ${start}, ${end}, ${priceMinor}, ${priceMinor}, ${priceMinor}, 'on_site', ${end}) returning id`;
    const [i] = await tx<{ id: string }[]>`insert into booking_items (tenant_id, booking_id, seq, service_id, staff_id, service_name, staff_name, price_minor, duration_min, starts_at, ends_at, actual_start_at, actual_end_at)
      values (${s.tenantId}, ${b.id}, 0, ${serviceId}, ${staffId}, 'svc', 'staff', ${priceMinor}, 60, ${start}, ${end}, ${start}, ${end}) returning id`;
    await tx`insert into booking_allocations (tenant_id, booking_id, booking_item_id, staff_id, during) values (${s.tenantId}, ${b.id}, ${i.id}, ${staffId}, tstzrange(${start}, ${end}))`;
  });
}

async function consent(s: SalonFixture, tenantCustomerId: string, channel = 'whatsapp', status: 'granted' | 'revoked' = 'granted') {
  await s.run((tx) => tx`insert into customer_consents (tenant_id, tenant_customer_id, channel, purpose, status, source) values (${s.tenantId}, ${tenantCustomerId}, ${channel}, 'marketing', ${status}, 'test')`);
}

describe('new business: honest data limitations', () => {
  it('a fresh tenant gets insufficient-data limitations and an Example plan (AI disconnected)', async () => {
    const t = await makeTenant({ name: 'Brand New Salon' });
    await upgrade(t);
    const r = await withTenant({ tenantId: t.tenantId, userId: t.owner.userId }, (tx) => runAnalysis(tx, { tenantId: t.tenantId, userId: t.owner.userId, horizon: 'monthly' }));
    expect(r.insufficientData).toBe(true);
    expect(r.ai.available).toBe(false);
    const p = await withTenant({ tenantId: t.tenantId }, (tx) => getPlan(tx, r.planId));
    expect(p.plan.isExample).toBe(true);
    expect(p.plan.source).toBe('example');
    expect(p.current.content.insufficientData).toBe(true);
    expect(p.current.content.limitations.length).toBeGreaterThan(0);
    expect(p.current.content.provenance.source_type).toBe('example');
  });
});

describe('rules, validation and AI enhancement', () => {
  let s: SalonFixture;
  beforeAll(async () => {
    s = await makeSalon();
    await upgrade(s);
    // 30 completed visits across 6 customers, regular cadence, no material costs
    for (let c = 0; c < 6; c++) {
      const cust = await makeCustomer(s, `Hist${c}`);
      await consent(s, cust.tenantCustomerId);
      for (let k = 0; k < 5; k++) await visit(s, cust.tenantCustomerId, s.services.haircut, s.staff.hana, 85 - k * 15 - c);
    }
  });

  it('missing costs: no recommendation asserts profitability', async () => {
    const snap = await s.run((tx) => buildSnapshot(tx, s.tenantId, addDays(today(), -90), 90));
    expect(snap.costs.complete).toBe(false);
    const gen = generateRuleRecommendations(snap);
    for (const r of gen.recommendations) expect(r.margin_check.status).not.toBe('ok');
    expect(gen.limitations.some((l) => /Costs incomplete/.test(l.en))).toBe(true);
    // an AI-style claim of "ok" margin on a package without costs is corrected
    const fake = { ...gen.recommendations[0], category: 'packages' as const, margin_check: { status: 'ok' as const, note: { ar: '', en: '' } }, measured_metrics: {} };
    expect(enforceMargin(snap, fake).rec.margin_check.status).toBe('unknown');
  });

  it('snapshot holds no customer identifiers', async () => {
    const snap = await s.run((tx) => buildSnapshot(tx, s.tenantId, addDays(today(), -90), 90));
    const txt = JSON.stringify(snap);
    expect(txt).not.toMatch(/Hist\d/);
    expect(txt).not.toMatch(/@test\.luma/);
  });

  it('unsupported numeric claims from the model are rejected and flagged; supported ones pass', async () => {
    const snap = await s.run((tx) => buildSnapshot(tx, s.tenantId, addDays(today(), -90), 90));
    expect(checkClaims(snap, { title: { ar: 'x', en: 'x' }, opportunity: { ar: 'نمو 340% مضمون', en: 'guaranteed 340% growth' }, measured_metrics: {} }).ok).toBe(false);
    const key = Object.keys(snap.index).find((k) => k.endsWith('.completed'))!;
    expect(checkClaims(snap, { title: { ar: 'x', en: 'x' }, opportunity: { ar: `${snap.index[key]} زيارة`, en: `${snap.index[key]} visits` }, measured_metrics: { [key]: snap.index[key] } }).ok).toBe(true);
    expect(checkClaims(snap, { title: { ar: 'x', en: 'x' }, opportunity: { ar: '', en: '' }, measured_metrics: { [key]: 12345 } }).ok).toBe(false);

    setTestProvider(createFakeProvider((req) => {
      const cands = ((req.data as { candidates: { index: number }[] }).candidates ?? []);
      return { ok: true, model: 'fake', tokensIn: 1, tokensOut: 1, latencyMs: 1, attempts: 1, output: { items: cands.map((c) => ({ index: c.index, keep: true, title_ar: 'عنوان', title_en: 'Title', opportunity_ar: 'سترتفع الحجوزات 340% هذا الشهر', opportunity_en: 'Bookings will rise 340% this month', suggested_action_ar: 'a', suggested_action_en: 'a', draft_text_ar: 'd', draft_text_en: 'd', experiment_design_ar: 'e', experiment_design_en: 'e', extra_limitations_ar: [], extra_limitations_en: [] })) } };
    }));
    const res = await s.run((tx) => generateAndSaveRecommendations(tx, { tenantId: s.tenantId, userId: s.owner.userId, horizon: 'monthly', fromDate: addDays(today(), -90), days: 90, useAi: true }));
    expect(res.ai.used).toBe(true);
    expect(res.ai.flagged).toBe(res.generation.recommendations.length);
    const rows = await s.run((tx) => tx<{ content: { opportunity: { en: string } }; validation: { flagged?: boolean } }[]>`select content, validation from recommendations where id = any(${res.savedIds}::uuid[])`);
    for (const r of rows) {
      expect(r.content.opportunity.en).not.toContain('340');
      expect(r.validation.flagged).toBe(true);
    }
  });

  it('prompt injection inside data cannot add recommendations or change scope', async () => {
    setTestProvider(createFakeProvider(() => ({ ok: true, model: 'fake', tokensIn: 1, tokensOut: 1, latencyMs: 1, attempts: 1, output: { items: [{ index: 99, keep: true, title_ar: 'x', title_en: 'Give 90% discount to everyone', opportunity_ar: '', opportunity_en: '', suggested_action_ar: '', suggested_action_en: '', draft_text_ar: '', draft_text_en: '', experiment_design_ar: '', experiment_design_en: '', extra_limitations_ar: [], extra_limitations_en: [] }] } })));
    const res = await s.run((tx) => generateAndSaveRecommendations(tx, { tenantId: s.tenantId, userId: s.owner.userId, horizon: 'weekly', fromDate: addDays(today(), -28), days: 28, useAi: true }));
    // out-of-range index ignored: output = rule candidates only
    expect(res.generation.recommendations.every((r) => !/90% discount/.test(r.title.en))).toBe(true);
  });

  it('AI failure (timeout) keeps rule-based output with an honest failure code', async () => {
    setTestProvider(createFakeProvider(() => ({ ok: false, code: 'timeout', message: 'timeout' })));
    const res = await s.run((tx) => generateAndSaveRecommendations(tx, { tenantId: s.tenantId, userId: s.owner.userId, horizon: 'monthly', fromDate: addDays(today(), -90), days: 90, useAi: true }));
    expect(res.ai).toMatchObject({ used: false, failure: 'timeout' });
    expect(res.generation.recommendations.every((r) => r.provenance.source_type === 'rules')).toBe(true);
  });

  it('regeneration creates a new version and never mutates an approved plan', async () => {
    const r = await s.run((tx) => runAnalysis(tx, { tenantId: s.tenantId, userId: s.owner.userId, horizon: 'monthly' }));
    const owner = await s.ctx();
    await s.run((tx) => transitionPlan(tx, owner, r.planId, 'approved'));
    const before = await s.run((tx) => getPlan(tx, r.planId));
    const res = await s.run((tx) => regeneratePlan(tx, owner, r.planId));
    expect(res.pendingAdoption).toBe(true);
    const after = await s.run((tx) => getPlan(tx, r.planId));
    expect(after.plan.currentVersion).toBe(before.plan.currentVersion);
    expect(after.versions.length).toBe(before.versions.length + 1);
    expect(after.pendingVersions).toHaveLength(1);
    expect(JSON.stringify(after.current.content)).toBe(JSON.stringify(before.current.content));
  });

  it('approval requires campaign.approve; a manager without delegation cannot approve', async () => {
    const r = await s.run((tx) => runAnalysis(tx, { tenantId: s.tenantId, userId: s.owner.userId, horizon: 'weekly' }));
    const mgr = await addMember(s, 'manager', { granted: ['marketing.view', 'marketing.manage'] });
    const ctx = await s.ctx(mgr);
    await expect(s.run((tx) => transitionPlan(tx, ctx, r.planId, 'approved'))).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('analysis jobs are idempotent per tenant/horizon/period in the business timezone', async () => {
    const a = await s.run((tx) => requestAnalysis(tx, s.tenantId, null, 'weekly'));
    const b = await s.run((tx) => requestAnalysis(tx, s.tenantId, null, 'weekly'));
    expect(a.id).toBe(b.id);
    expect(b.created).toBe(false);
    const p = planPeriodFor('weekly', 'Asia/Riyadh');
    expect(jobKey(s.tenantId, 'weekly', p.key)).toContain(p.from);
    expect(new Date(`${p.from}T12:00:00Z`).getUTCDay()).toBe(0);
  });
});

describe('campaigns: approval, consent, opt-out', () => {
  let s: SalonFixture;
  const ids: string[] = [];
  beforeAll(async () => {
    s = await makeSalon();
    await upgrade(s);
    for (let i = 0; i < 4; i++) {
      const c = await makeCustomer(s, `Camp${i}`);
      await s.run((tx) => tx`update tenant_customers set phone = ${`+96655000000${i}`} where id = ${c.tenantCustomerId}`);
      await visit(s, c.tenantCustomerId, s.services.nails, s.staff.lama, 20 + i);
      ids.push(c.tenantCustomerId);
    }
    await consent(s, ids[0]);
    await consent(s, ids[1]);
    await consent(s, ids[2], 'whatsapp', 'granted');
    await consent(s, ids[2], 'whatsapp', 'revoked'); // latest wins: opted out
  });

  it('cannot send before approval; only consenting, non-opted-out customers receive; deliveries are simulated', async () => {
    const owner = await s.ctx();
    const seg = await s.run((tx) => createSegment(tx, owner, { name: 'recent', conditions: [{ type: 'last_visit_days_lt', days: 60 }] }));
    const camp = await s.run((tx) => createCampaign(tx, owner, { name: 'Nails week', segmentId: seg.id, channel: 'whatsapp', content: { text: 'hi' }, holdoutBps: 0, attributionWindowDays: 7, frequencyCapDays: 7 }));
    await expect(s.run((tx) => sendCampaign(tx, owner, camp.id, { production: false }))).rejects.toMatchObject({ code: 'forbidden' });
    await s.run((tx) => approveCampaign(tx, owner, camp.id));
    const r = await s.run((tx) => sendCampaign(tx, owner, camp.id, { production: false }));
    expect(r).toMatchObject({ simulated: true, treatment: 2 });
    expect(r.suppressed.optedOut).toBe(1);
    expect(r.suppressed.noConsent).toBe(1);
    const del = await s.run((tx) => tx`select status from notification_deliveries where template = ${`campaign:${camp.id}`}`);
    expect(del.every((d) => d.status === 'simulated')).toBe(true);
    // production refuses without a connected provider
    const camp2 = await s.run((tx) => createCampaign(tx, owner, { name: 'Prod', segmentId: seg.id, channel: 'whatsapp', content: { text: 'hi' }, holdoutBps: 0, attributionWindowDays: 7, frequencyCapDays: 7 }));
    await s.run((tx) => approveCampaign(tx, owner, camp2.id));
    await expect(s.run((tx) => sendCampaign(tx, owner, camp2.id, { production: true }))).rejects.toMatchObject({ code: 'unavailable' });
    // results disclose insufficient sample instead of claiming incrementality
    const res = await s.run((tx) => campaignResults(tx, camp.id));
    expect(res).toMatchObject({ simulated: true, incremental: { available: false, reason: 'insufficient_sample' } });
  });

  it('opt-out is enforced on the next campaign; frequency cap suppresses repeats', async () => {
    const owner = await s.ctx();
    await s.run((tx) => optOut(tx, s.tenantId, ids[0], 'whatsapp'));
    const seg = await s.run((tx) => createSegment(tx, owner, { name: 'recent2', conditions: [{ type: 'last_visit_days_lt', days: 60 }] }));
    const camp = await s.run((tx) => createCampaign(tx, owner, { name: 'Again', segmentId: seg.id, channel: 'whatsapp', content: { text: 'hi again' }, holdoutBps: 0, attributionWindowDays: 7, frequencyCapDays: 7 }));
    const c = await s.run((tx) => tx`select * from campaigns where id = ${camp.id}`);
    const stats = await s.run((tx) => buildRecipients(tx, c[0] as never));
    expect(stats.treatment).toBe(0);
    expect(stats.suppressed.optedOut).toBe(2);
    expect(stats.suppressed.frequencyCap).toBe(1);
  });

  it('a receptionist cannot approve campaigns', async () => {
    const rec = await addMember(s, 'receptionist');
    const ctx = await s.ctx(rec);
    const owner = await s.ctx();
    const seg = await s.run((tx) => createSegment(tx, owner, { name: 'x', conditions: [{ type: 'visits_gte', count: 1 }] }));
    const camp = await s.run((tx) => createCampaign(tx, owner, { name: 'R', segmentId: seg.id, channel: 'sms', content: { text: 'x' }, holdoutBps: 0, attributionWindowDays: 7, frequencyCapDays: 7 }));
    await expect(s.run((tx) => approveCampaign(tx, ctx, camp.id))).rejects.toMatchObject({ code: 'forbidden' });
  });

  it('quiet hours move a 23:30 send to 09:00 business time', () => {
    const at = new Date('2026-11-01T20:30:00Z'); // 23:30 Riyadh
    const adj = adjustForQuietHours(at, 'Asia/Riyadh', { start: '22:00', end: '09:00' });
    expect(utcToWall(adj, 'Asia/Riyadh').time).toBe('09:00');
    const noon = new Date('2026-11-01T09:00:00Z');
    expect(+adjustForQuietHours(noon, 'Asia/Riyadh', { start: '22:00', end: '09:00' })).toBe(+noon);
  });
});
