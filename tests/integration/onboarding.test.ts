import { afterAll, describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { closeDb, withTenant } from '@/server/db';
import { decidePalette, ensureExpertStaff, generateFromAnswers, getSession, readiness, saveStep } from '@/server/services/onboarding';
import { processImageUpload } from '@/server/services/assets';
import { createService } from '@/server/services/catalog';
import { createStaff, setWeeklyHours } from '@/server/services/team';
import { serviceInput } from '@/lib/validation/catalog';
import { makeTenant } from '../fixtures';
import type { TenantContext } from '@/server/tenancy/context';
import type { StorefrontDocument } from '@/lib/builder/schema';

afterAll(closeDb);

const run = <T>(ctx: TenantContext, fn: Parameters<typeof withTenant<T>>[1]) => withTenant({ tenantId: ctx.tenant.id, userId: ctx.user.userId }, fn);

async function save(ctx: TenantContext, step: number, answers: unknown, extra: { skip?: boolean; goTo?: number } = {}) {
  const s = await run(ctx, (tx) => getSession(tx));
  return run(ctx, (tx) => saveStep(tx, ctx, { step, answers, skip: extra.skip ?? false, goTo: extra.goTo, expectedVersion: s.version }));
}

describe('seven-step onboarding', () => {
  it('saves every step, resumes from current_step, supports back and skip, rejects stale versions', async () => {
    const t = await makeTenant({ name: 'Onb Salon' });
    const ctx = await t.ctx();
    let s = await run(ctx, (tx) => getSession(tx));
    expect(s.currentStep).toBe(2); // step 1 captured by business creation
    await save(ctx, 1, { name: 'Noura Studio', businessType: 'salon', city: 'Jeddah', branchName: 'Al Shati' });
    await save(ctx, 2, { mode: 'wordmark', wordmark: 'NOURA' });
    await save(ctx, 3, { character: ['luxurious', 'warm'], description: 'calm luxury' });
    await save(ctx, 4, { primary: null, useSuggested: 'rose', excluded: ['#00FF00'], fonts: { heading: 'el-messiri', body: 'tajawal' } });
    await save(ctx, 5, {}, { skip: true });
    await save(ctx, 6, { priorities: ['portfolio', 'booking'] });
    // back to step 3 then forward again
    s = await save(ctx, 3, { character: ['minimal'] }, { goTo: 3 });
    expect(s.currentStep).toBe(3);
    s = await save(ctx, 7, {
      intro: 'Welcome', tagline: 'Beauty, calmly', phone: '0551234567', whatsapp: '0551234567', email: 'hi@noura.test', address: 'Jeddah',
      hours: [0, 1, 2, 3, 4].map((weekday) => ({ weekday, start: '10:00', end: '22:00' })),
      socials: { instagram: '@noura.studio' },
      policy: { allowOnSite: true, depositMode: 'percent', depositValue: 2000, cancellationWindowHours: 24 },
    });
    expect(s.completedSteps).toEqual(expect.arrayContaining([1, 2, 3, 4, 6, 7]));
    expect(s.skippedSteps).toContain(5);
    expect(s.currentStep).toBe(8);
    // a different session/device reopens the same state
    const again = await run(ctx, (tx) => getSession(tx));
    expect((again.answers['3'] as { character: string[] }).character).toEqual(['minimal']);
    const [tenant] = await run(ctx, (tx) => tx`select name, city from tenants where id = ${ctx.tenant.id}`);
    expect(tenant).toMatchObject({ name: 'Noura Studio', city: 'Jeddah' });
    const hours = await run(ctx, (tx) => tx`select count(*)::int as n from working_hours where staff_id is null`);
    expect(hours[0].n).toBe(5);
    // stale version → 409
    await expect(run(ctx, (tx) => saveStep(tx, ctx, { step: 3, answers: { character: [] }, skip: false, expectedVersion: 1 }))).rejects.toMatchObject({ code: 'version_conflict' });
    // step 1 cannot be skipped; invalid social handle rejected
    await expect(save(ctx, 1, {}, { skip: true })).rejects.toMatchObject({ code: 'validation' });
    await expect(save(ctx, 7, { socials: { instagram: 'javascript:alert(1)' } })).rejects.toMatchObject({ code: 'validation' });
  });

  it('logo palette is only a suggestion until explicitly accepted', async () => {
    const t = await makeTenant({ name: 'Logo Salon' });
    const ctx = await t.ctx();
    const png = await sharp({ create: { width: 200, height: 200, channels: 3, background: { r: 120, g: 40, b: 90 } } }).png().toBuffer();
    const asset = await run(ctx, (tx) => processImageUpload(tx, ctx, { bytes: png, purpose: 'logo', altAr: 'شعار' }));
    let s = await save(ctx, 2, { mode: 'logo', logoAssetId: asset.id });
    expect(s.paletteSuggestions?.colors[0]).toBe('#78285A');
    // not applied yet
    const before = await run(ctx, (tx) => generateFromAnswers(tx, ctx, { overwrite: true }));
    expect(before.document.brand.colors.primary).not.toBe('#78285A');
    s = await run(ctx, (tx) => getSession(tx));
    s = await run(ctx, (tx) => decidePalette(tx, ctx, true, s.version));
    const after = await run(ctx, (tx) => generateFromAnswers(tx, ctx, { overwrite: true }));
    expect(after.document.brand.colors.primary).toBe('#78285A');
    expect(after.document.brand.logoAssetId).toBe(asset.id);
  });

  it('generates a deterministic draft that invents no services and requires confirmation to overwrite edits', async () => {
    const t = await makeTenant({ name: 'Draft Salon' });
    const ctx = await t.ctx();
    await save(ctx, 3, { character: ['natural'] });
    const a = await run(ctx, (tx) => generateFromAnswers(tx, ctx));
    const b = await run(ctx, (tx) => generateFromAnswers(tx, ctx, { overwrite: true }));
    const strip = (d: StorefrontDocument) => JSON.stringify(d).replace(/"b-[a-z0-9]+"/g, '"id"');
    expect(strip(a.document)).toBe(strip(b.document));
    expect(JSON.stringify(a.document)).not.toMatch(/"(serviceId|productId|staffId)":"|"(serviceIds|productIds|staffIds|packageIds)":\["|"priceMinor"/);
    const svc = await run(ctx, (tx) => tx`select count(*)::int as n from services`);
    expect(svc[0].n).toBe(0);
    // simulate a builder edit, then generation must ask before overwriting
    await run(ctx, (tx) => tx`update storefront_drafts set version = version + 1, updated_at = now() + interval '1 minute'`);
    await expect(run(ctx, (tx) => generateFromAnswers(tx, ctx))).rejects.toMatchObject({ code: 'conflict' });
  });

  it('readiness checklist reflects real bookability', async () => {
    const t = await makeTenant({ name: 'Ready Salon' });
    const ctx = await t.ctx();
    let r = await run(ctx, (tx) => readiness(tx));
    expect(r.ready).toBe(false);
    const staff = await run(ctx, (tx) => createStaff(tx, ctx, { displayName: 'Amal', branchIds: [t.branchId], serviceIds: [], publicVisible: true, allocationWeight: 100 }));
    await run(ctx, (tx) => createService(tx, ctx, serviceInput.parse({ name: 'Blowout', priceMinor: 12000, durationMin: 45, staffIds: [staff.id] })));
    r = await run(ctx, (tx) => readiness(tx));
    expect(r.items.find((i) => i.key === 'staff')?.ok).toBe(true);
    expect(r.items.find((i) => i.key === 'schedule')?.ok).toBe(false);
    await run(ctx, (tx) => setWeeklyHours(tx, ctx, { branchId: t.branchId, staffId: staff.id, days: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, ranges: weekday < 5 ? [{ start: '10:00', end: '18:00' }] : [] })), breaks: [] }));
    await save(ctx, 7, { phone: '0550000000', hours: [], socials: {}, policy: { allowOnSite: true, depositMode: 'none', depositValue: 0, cancellationWindowHours: 24 } });
    r = await run(ctx, (tx) => readiness(tx));
    expect(r.ready).toBe(true);
  });

  it('an expert owner becomes her own provider', async () => {
    const t = await makeTenant({ name: 'Expert Reem', businessType: 'expert' });
    const ctx = await t.ctx();
    const staffId = await run(ctx, (tx) => ensureExpertStaff(tx, ctx));
    expect(staffId).toBeTruthy();
    const ctx2 = await t.ctx();
    expect(ctx2.staffProfileId).toBe(staffId);
    expect(await run(ctx, (tx) => ensureExpertStaff(tx, ctx))).toBe(staffId); // idempotent
  });
});
