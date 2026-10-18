import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { closeDb, withTenant } from '@/server/db';
import { getDraft, saveDraft } from '@/server/storefront/drafts';
import { publishDraft } from '@/server/storefront/publish';
import { loadPublicStorefront } from '@/server/storefront/public';
import { StoreFrame } from '@/components/storefront/Frame';
import { HomePage, resolvePath } from '@/components/storefront/Pages';
import { newBlock, type StorefrontDocument } from '@/lib/builder/schema';
import { makeTenant, type TenantFixture } from '../fixtures';

afterAll(closeDb);

let a: TenantFixture;
let svc: string;
beforeAll(async () => {
  a = await makeTenant({ name: 'Render Salon' });
  const run = <T>(fn: Parameters<typeof withTenant<T>>[1]) => withTenant({ tenantId: a.tenantId, userId: a.owner.userId }, fn);
  [{ id: svc }] = await run((tx) => tx<{ id: string }[]>`insert into services (tenant_id, name, price_minor, duration_min) values (${a.tenantId}, 'Keratin', 45000, 120) returning id`);
  const ctx = await a.ctx();
  const d = await run((tx) => getDraft(tx));
  const doc = structuredClone(d.document) as StorefrontDocument;
  const home = doc.layout.pages.find((p) => p.kind === 'home')!;
  // owner removed every catalog block, added a CTA to a service and rich text
  home.blocks = [
    newBlock('cta', { label: { ar: 'كيراتين' } }, { type: 'service', targetId: svc }),
    newBlock('text', { html: { ar: '<p>أهلاً<script>steal()</script></p>' } }),
  ];
  const s = await run((tx) => saveDraft(tx, ctx, doc, d.version));
  await run((tx) => publishDraft(tx, ctx, s.version));
});

const render = async (path = '/') => {
  const data = (await loadPublicStorefront(a.slug))!;
  const ctx = { data, locale: 'ar' as const, base: `/s/${a.slug}` };
  const page = path === '/' ? createElement(HomePage, { ctx }) : resolvePath(ctx, path, new URLSearchParams());
  return renderToStaticMarkup(createElement(StoreFrame, { ctx, currentPath: path, children: page }));
};

describe('storefront rendering', () => {
  it('always exposes booking even without catalog blocks, and links to the service', async () => {
    const html = await render();
    expect(html).toContain(`href="/s/${a.slug}/booking"`);
    expect(html).toContain(`href="/s/${a.slug}/services/${svc}"`);
    expect(html).not.toContain('<script');
    expect(html).toContain('مدعوم من لوما'); // plan without branding.remove_powered_by
  });

  it('archived targets render a clear fallback, never a broken link', async () => {
    await withTenant({ tenantId: a.tenantId }, (tx) => tx`update services set status = 'archived' where id = ${svc}`);
    const html = await render();
    expect(html).not.toContain(`/services/${svc}`);
    expect(html).toContain('هذا الرابط غير متاح حالياً');
    const page = await render(`/services/${svc}`);
    expect(page).not.toContain('Keratin');
    await withTenant({ tenantId: a.tenantId }, (tx) => tx`update services set status = 'active' where id = ${svc}`);
  });

  it('policies page shows booking terms before payment', async () => {
    const html = await render('/policies');
    expect(html).toContain('سياسة الحجز والإلغاء');
  });
});
