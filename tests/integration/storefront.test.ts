import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, withTenant } from '@/server/db';
import { getDraft, saveDraft, applyDraftPatch, sanitizeRichText } from '@/server/storefront/drafts';
import { createPreviewToken, listVersions, publishDraft, restoreVersion } from '@/server/storefront/publish';
import { loadPublicStorefront } from '@/server/storefront/public';
import { importLegacy } from '@/server/storefront/legacy-import';
import { socialUrl } from '@/server/storefront/profile';
import { newBlock, type StorefrontDocument } from '@/lib/builder/schema';
import { makeTenant, type TenantFixture } from '../fixtures';

afterAll(closeDb);

let a: TenantFixture;
let b: TenantFixture;
let bService: string;
let aService: string;
let aCategory: string;

const run = <T>(t: TenantFixture, fn: Parameters<typeof withTenant<T>>[1]) => withTenant({ tenantId: t.tenantId, userId: t.owner.userId }, fn);

beforeAll(async () => {
  a = await makeTenant({ name: 'Salon Alpha' });
  b = await makeTenant({ name: 'Salon Beta' });
  [{ id: aCategory }] = await run(a, (tx) => tx<{ id: string }[]>`insert into categories (tenant_id, kind, name) values (${a.tenantId}, 'service', 'Hair') returning id`);
  [{ id: aService }] = await run(a, (tx) => tx<{ id: string }[]>`insert into services (tenant_id, name, price_minor, duration_min, category_id) values (${a.tenantId}, 'Blowdry', 9000, 45, ${aCategory}) returning id`);
  [{ id: bService }] = await run(b, (tx) => tx<{ id: string }[]>`insert into services (tenant_id, name, price_minor, duration_min) values (${b.tenantId}, 'B secret', 1, 30) returning id`);
});

async function draft(t: TenantFixture) {
  return run(t, (tx) => getDraft(tx));
}

describe('storefront drafts', () => {
  it('stale version → 409 version_conflict, never a silent overwrite', async () => {
    const ctx = await a.ctx();
    const d = await draft(a);
    await run(a, (tx) => saveDraft(tx, ctx, d.document, d.version));
    await expect(run(a, (tx) => saveDraft(tx, ctx, d.document, d.version))).rejects.toMatchObject({ code: 'version_conflict' });
  });

  it("rejects another tenant's service id at save and at publish", async () => {
    const ctx = await a.ctx();
    const d = await draft(a);
    const doc = structuredClone(d.document) as StorefrontDocument;
    doc.layout.pages[0].blocks.push(newBlock('service', { serviceId: bService }));
    await expect(run(a, (tx) => saveDraft(tx, ctx, doc, d.version))).rejects.toMatchObject({ code: 'validation' });
    // even if it got into the draft row directly, publishing refuses it
    await run(a, (tx) => tx`update storefront_drafts set document = ${tx.json(doc as never)}`);
    await expect(run(a, (tx) => publishDraft(tx, ctx, d.version))).rejects.toMatchObject({ code: 'validation' });
    await run(a, (tx) => tx`update storefront_drafts set document = ${tx.json(d.document as never)}`);
  });

  it('rejects javascript: and data: URLs in actions', async () => {
    const ctx = await a.ctx();
    for (const url of ['javascript:alert(1)', 'data:text/html,<script>x</script>', 'http://insecure.example', 'https://user:pw@evil.example']) {
      const d = await draft(a);
      const doc = structuredClone(d.document) as StorefrontDocument;
      doc.layout.pages[0].blocks.push(newBlock('cta', { label: { ar: 'اضغطي' } }, { type: 'external', url }));
      await expect(run(a, (tx) => saveDraft(tx, ctx, doc, d.version))).rejects.toMatchObject({ code: 'validation' });
    }
  });

  it('sanitizes rich text (scripts, handlers, unsafe links)', async () => {
    expect(sanitizeRichText('<p onclick="x()">Hi<script>alert(1)</script><a href="javascript:x">j</a><a href="https://ok.example">ok</a><img src=x onerror=1></p>')).toBe(
      '<p>Hij<a href="https://ok.example" rel="noopener noreferrer nofollow" target="_blank">ok</a></p>',
    );
    const ctx = await a.ctx();
    const d = await draft(a);
    const r = await run(a, (tx) => applyDraftPatch(tx, ctx, (doc) => {
      doc.layout.pages[0].blocks.push(newBlock('text', { html: { ar: '<p>مرحبا<script>bad()</script></p>' } }));
      return doc;
    }, d.version, { source: 'assistant' }));
    const t = r.document.layout.pages[0].blocks.find((x) => x.type === 'text')!;
    expect((t.props.html as { ar: string }).ar).toBe('<p>مرحبا</p>');
  });

  it('enforces the plan custom pages limit', async () => {
    const ctx = await a.ctx();
    const d = await draft(a);
    const doc = structuredClone(d.document) as StorefrontDocument;
    for (let i = 0; i < 4; i++) doc.layout.pages.push({ id: `p-custom-${i}x`, kind: 'custom', slug: `extra-${i}`, title: { ar: `صفحة ${i}` }, showInNav: false, showInFooter: true, blocks: [] });
    await expect(run(a, (tx) => saveDraft(tx, ctx, doc, d.version))).rejects.toMatchObject({ code: 'plan_limit' });
  });
});

describe('publishing, versions, previews', () => {
  it('drafts are invisible until published; publish is atomic and versions are immutable', async () => {
    expect(await loadPublicStorefront(a.slug)).toBeNull();
    const ctx = await a.ctx();
    const d = await draft(a);
    const doc = structuredClone(d.document) as StorefrontDocument;
    doc.brand.colors.primary = '#6B6B2F';
    const s = await run(a, (tx) => saveDraft(tx, ctx, doc, d.version));
    const p1 = await run(a, (tx) => publishDraft(tx, ctx, s.version));
    expect(p1.number).toBe(1);
    const pub = await loadPublicStorefront(a.slug);
    expect(pub?.doc.brand.colors.primary).toBe('#6B6B2F');
    expect(pub?.preview).toBe(false);
    // edits after publishing do not leak to visitors
    const d2 = await draft(a);
    const doc2 = structuredClone(d2.document) as StorefrontDocument;
    doc2.brand.colors.primary = '#C8483B';
    await run(a, (tx) => saveDraft(tx, ctx, doc2, d2.version));
    const again = await withTenant({ tenantId: a.tenantId }, async () => null).then(() => loadPublicStorefront(a.slug));
    expect(again?.doc.brand.colors.primary).toBe('#6B6B2F');
    await expect(run(a, (tx) => tx`update page_versions set note = 'x'`)).rejects.toBeTruthy();
  });

  it('rollback restores design only and creates a new version with audit', async () => {
    const ctx = await a.ctx();
    let d = await draft(a);
    const p2 = await run(a, (tx) => publishDraft(tx, ctx, d.version)); // publishes #C8483B
    const versions = await run(a, (tx) => listVersions(tx));
    const v1 = versions.find((v) => v.number === 1)!;
    const [{ n: bookingsBefore }] = await run(a, (tx) => tx<{ n: number }[]>`select count(*)::int as n from bookings`);
    d = await draft(a);
    const r = await run(a, (tx) => restoreVersion(tx, ctx, v1.id, d.version, true));
    expect(r.published?.number).toBe(p2.number + 1);
    const [{ n: bookingsAfter }] = await run(a, (tx) => tx<{ n: number }[]>`select count(*)::int as n from bookings`);
    expect(bookingsAfter).toBe(bookingsBefore);
    const [audit] = await run(a, (tx) => tx`select action from audit_logs where tenant_id = ${a.tenantId} and action = 'storefront.rolled_back'`);
    expect(audit).toBeTruthy();
  });

  it('preview tokens expose the draft only with a valid token', async () => {
    const ctx = await a.ctx();
    const tok = await run(a, (tx) => createPreviewToken(tx, ctx, 2));
    const pv = await loadPublicStorefront(a.slug, { previewToken: tok.token });
    expect(pv?.preview).toBe(true);
    expect(await loadPublicStorefront(a.slug, { previewToken: 'x'.repeat(32) })).toBeNull();
    // a token never opens another tenant's draft
    expect(await loadPublicStorefront(b.slug, { previewToken: tok.token })).toBeNull();
  });

  it('public data is allowlisted and hides hidden categories', async () => {
    await run(a, (tx) => tx`update services set material_cost_minor = 777 where id = ${aService}`);
    const pub = await loadPublicStorefront(a.slug);
    expect(JSON.stringify(pub)).not.toContain('777');
    expect(pub?.catalog.services.map((s) => s.id)).toContain(aService);
    await run(a, (tx) => tx`update categories set status = 'hidden' where id = ${aCategory}`);
    const ctx = await a.ctx();
    const d = await draft(a);
    await run(a, (tx) => publishDraft(tx, ctx, d.version));
    const pub2 = await loadPublicStorefront(a.slug);
    expect(pub2?.catalog.services.map((s) => s.id)).not.toContain(aService);
    const [svc] = await run(a, (tx) => tx`select status from services where id = ${aService}`);
    expect(svc.status).toBe('active'); // hidden, not deleted
  });
});

describe('legacy import & socials', () => {
  it('maps legacy settings with documented precedence', () => {
    const r = importLegacy(
      {
        luma_site: { palette: 'emerald', font: 'serif', sections: { gallery: false, faq: true } },
        luma_page_cfg: { theme: 'rose-velvet', themeCustom: { bg: '#101010', card: '#202020', ac: '#E5C158', tx: '#FAFAFA', rad: 4 }, social: { ig: '@noura', wa: '0555123456' }, faqText: 'سؤال؟\nجواب' },
      },
      'Noura',
      'salon',
    );
    expect(r.precedence[0]).toBe('colors: luma_page_cfg.themeCustom');
    expect(r.document.brand.colors.background).toBe('#101010');
    expect(r.document.brand.radius).toBe('sm');
    expect(r.document.layout.pages[0].blocks.some((x) => x.type === 'gallery')).toBe(false);
    expect(r.profile.socials).toEqual({ instagram: 'noura', whatsapp: '0555123456' });
  });

  it('social links are restricted to their network', () => {
    expect(socialUrl('instagram', 'noura.salon')).toBe('https://instagram.com/noura.salon');
    expect(socialUrl('instagram', 'https://evil.example/x')).toBeNull();
    expect(socialUrl('whatsapp', '0555123456')).toBe('https://wa.me/966555123456');
    expect(socialUrl('instagram', 'javascript:alert(1)')).toBeNull();
  });
});
