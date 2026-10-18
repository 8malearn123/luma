import type { ReactNode } from 'react';
import { translate } from '@/lib/i18n';
import { formatDuration, formatMoney } from '@/lib/format';
import type { PageKind } from './pageKinds';
import { L, LT, type RenderCtx } from './types';
import { BlocksView, Contact, Hours, link, PolicyText, ProductCollection, ServiceCollection, Socials } from './Blocks';
import { SectionTitle } from './Frame';
import { AddToCart } from './AddToCart';

/**
 * Generated storefront pages. Each resolves a path to content; unknown paths
 * return null (→ 404). Pages present in the document render their blocks;
 * system pages fall back to generated content so services stay bookable even
 * if the owner removed every catalog block.
 */
const tt = (ctx: RenderCtx, k: string, v?: Record<string, string | number>) => translate(ctx.locale, k, v);

function docPage(ctx: RenderCtx, kind: PageKind, slug?: string) {
  return ctx.data.doc.layout.pages.find((p) => p.kind === kind && (kind !== 'custom' || p.slug === slug));
}

export function HomePage({ ctx }: { ctx: RenderCtx }) {
  const p = docPage(ctx, 'home');
  return <BlocksView ctx={ctx} blocks={p?.blocks ?? []} />;
}

export function ServicesPage({ ctx, categoryId }: { ctx: RenderCtx; categoryId?: string | null }) {
  const p = docPage(ctx, 'services');
  const cats = ctx.data.catalog.categories.filter((c) => c.kind === 'service');
  const services = ctx.data.catalog.services.filter((s) => !categoryId || s.categoryId === categoryId);
  return (
    <>
      <SectionTitle title={p ? LT(ctx.locale, p.title) : tt(ctx, 'sf.services')} />
      {p && <BlocksView ctx={ctx} blocks={p.blocks.filter((b) => b.type !== 'service_list')} />}
      <section className="sf-section">
        <div className="sf-container">
          {cats.length > 0 && (
            <nav className="sf-row" aria-label={tt(ctx, 'sf.categories')} style={{ marginBottom: 18 }}>
              <a className={categoryId ? 'sf-btn-secondary' : 'sf-btn'} href={link(ctx, '/services')}>{tt(ctx, 'common.all')}</a>
              {cats.map((c) => (
                <a key={c.id} className={c.id === categoryId ? 'sf-btn' : 'sf-btn-secondary'} href={link(ctx, `/services?category=${c.id}`)} aria-current={c.id === categoryId ? 'page' : undefined}>
                  {L(ctx.locale, c.name, c.nameEn)}
                </a>
              ))}
            </nav>
          )}
          <ServiceCollection ctx={ctx} services={services} display={ctx.data.doc.appearance.serviceDisplay} />
        </div>
      </section>
    </>
  );
}

export function ServicePage({ ctx, id }: { ctx: RenderCtx; id: string }): ReactNode {
  const s = ctx.data.catalog.services.find((x) => x.id === id);
  if (!s) return null;
  const staff = ctx.data.catalog.staff.filter((m) => s.staffIds.includes(m.id));
  const price = s.priceIsFrom ? tt(ctx, 'sf.price_from', { price: formatMoney(s.priceMinor, ctx.data.tenant.currency, ctx.locale) }) : formatMoney(s.priceMinor, ctx.data.tenant.currency, ctx.locale);
  return (
    <section className="sf-section">
      <div className="sf-container sf-grid cols-2" style={{ alignItems: 'start' }}>
        <div className="sf-media r-4-3">{s.imageUrl && <img src={s.imageUrl} alt={L(ctx.locale, s.name, s.nameEn)} width={640} height={480} />}</div>
        <div>
          <p className="sf-small"><a href={link(ctx, '/services')}>← {tt(ctx, 'sf.all_services')}</a></p>
          <h1 className="sf-h1">{L(ctx.locale, s.name, s.nameEn)}</h1>
          <p className="sf-row"><span className="sf-price">{price}</span><span className="sf-muted">{formatDuration(s.durationMin, ctx.locale)}</span></p>
          {L(ctx.locale, s.description, s.descriptionEn).split(/\n+/).filter(Boolean).map((l, i) => <p key={i}>{l}</p>)}
          <a className="sf-btn" href={link(ctx, `/booking?service=${s.id}`)}>{tt(ctx, 'sf.book')}</a>
          {staff.length > 0 && (
            <div style={{ marginTop: 24 }}>
              <h2 className="sf-h2">{tt(ctx, 'sf.who_performs')}</h2>
              <ul className="sf-row" style={{ listStyle: 'none', padding: 0 }}>
                {staff.map((m) => <li key={m.id}><a className="sf-btn-secondary" href={link(ctx, `/booking?service=${s.id}&staff=${m.id}`)}>{L(ctx.locale, m.displayName, m.displayNameEn)}</a></li>)}
              </ul>
            </div>
          )}
          <p className="sf-small sf-muted" style={{ marginTop: 18 }}><a href={link(ctx, '/policies')}>{tt(ctx, 'sf.booking_policy')}</a></p>
        </div>
      </div>
    </section>
  );
}

export function TeamPage({ ctx }: { ctx: RenderCtx }) {
  const p = docPage(ctx, 'team');
  const blocks = p?.blocks.length ? p.blocks : [{ id: 'gen-team', type: 'team' as const, schemaVersion: 1, props: { heading: { ar: '' }, staffIds: [], showBio: true }, visibility: { enabled: true } }];
  return (
    <>
      <SectionTitle title={p ? LT(ctx.locale, p.title) : tt(ctx, 'sf.team')} />
      <BlocksView ctx={ctx} blocks={blocks} />
    </>
  );
}

export function StaffPage({ ctx, id }: { ctx: RenderCtx; id: string }): ReactNode {
  const m = ctx.data.catalog.staff.find((x) => x.id === id);
  if (!m) return null;
  const services = ctx.data.catalog.services.filter((s) => s.staffIds.includes(m.id));
  return (
    <>
      <section className="sf-section">
        <div className="sf-container sf-grid cols-2" style={{ alignItems: 'start' }}>
          <div className="sf-media r-1-1" style={{ maxWidth: 360 }}>{m.photoUrl && <img src={m.photoUrl} alt={L(ctx.locale, m.displayName, m.displayNameEn)} width={640} height={640} />}</div>
          <div>
            <p className="sf-small"><a href={link(ctx, '/team')}>← {tt(ctx, 'sf.team')}</a></p>
            <h1 className="sf-h1">{L(ctx.locale, m.displayName, m.displayNameEn)}</h1>
            {m.specialty && <p className="sf-muted">{m.specialty}</p>}
            {m.bio?.split(/\n+/).map((l, i) => <p key={i}>{l}</p>)}
            <a className="sf-btn" href={link(ctx, `/booking?staff=${m.id}`)}>{tt(ctx, 'sf.book_with')}</a>
          </div>
        </div>
      </section>
      <section className="sf-section">
        <div className="sf-container">
          <h2 className="sf-h2">{tt(ctx, 'sf.her_services')}</h2>
          <ServiceCollection ctx={ctx} services={services} display={ctx.data.doc.appearance.serviceDisplay} />
        </div>
      </section>
    </>
  );
}

export function ProductsPage({ ctx, categoryId }: { ctx: RenderCtx; categoryId?: string | null }): ReactNode {
  if (!ctx.data.productsEnabled) return null;
  const cats = ctx.data.catalog.categories.filter((c) => c.kind === 'product');
  return (
    <>
      <SectionTitle title={tt(ctx, 'sf.products')} />
      <section className="sf-section">
        <div className="sf-container">
          {cats.length > 0 && (
            <nav className="sf-row" aria-label={tt(ctx, 'sf.categories')} style={{ marginBottom: 18 }}>
              <a className={categoryId ? 'sf-btn-secondary' : 'sf-btn'} href={link(ctx, '/products')}>{tt(ctx, 'common.all')}</a>
              {cats.map((c) => <a key={c.id} className={c.id === categoryId ? 'sf-btn' : 'sf-btn-secondary'} href={link(ctx, `/products?category=${c.id}`)}>{L(ctx.locale, c.name, c.nameEn)}</a>)}
            </nav>
          )}
          <ProductCollection ctx={ctx} categoryId={categoryId} display={ctx.data.doc.appearance.productDisplay} />
          <p className="sf-small sf-muted" style={{ marginTop: 16 }}>{tt(ctx, 'sf.pickup_only')}</p>
        </div>
      </section>
    </>
  );
}

export function ProductPage({ ctx, id }: { ctx: RenderCtx; id: string }): ReactNode {
  if (!ctx.data.productsEnabled) return null;
  const p = ctx.data.catalog.products.find((x) => x.id === id);
  if (!p) return null;
  return (
    <section className="sf-section">
      <div className="sf-container sf-grid cols-2" style={{ alignItems: 'start' }}>
        <div className="sf-media r-1-1">{p.imageUrl && <img src={p.imageUrl} alt={L(ctx.locale, p.name, p.nameEn)} width={640} height={640} />}</div>
        <div>
          <p className="sf-small"><a href={link(ctx, '/products')}>← {tt(ctx, 'sf.products')}</a></p>
          <h1 className="sf-h1">{L(ctx.locale, p.name, p.nameEn)}</h1>
          <p className="sf-price" style={{ fontSize: '1.2rem' }}>{formatMoney(p.priceMinor, ctx.data.tenant.currency, ctx.locale)}</p>
          {L(ctx.locale, p.description, p.descriptionEn).split(/\n+/).filter(Boolean).map((l, i) => <p key={i}>{l}</p>)}
          {!ctx.editing && (
            <AddToCart
              slug={ctx.data.tenant.slug}
              productId={p.id}
              variants={p.variants.map((v) => ({ id: v.id, name: `${L(ctx.locale, v.name, v.nameEn)} — ${formatMoney(v.priceMinor, ctx.data.tenant.currency, ctx.locale)}` }))}
              disabled={!p.inStock}
              labels={{ add: tt(ctx, 'sf.add_to_cart'), added: tt(ctx, 'sf.added'), out: tt(ctx, 'sf.out_of_stock'), error: tt(ctx, 'sf.cart_error'), variant: tt(ctx, 'sf.variant'), viewCart: tt(ctx, 'sf.view_cart') }}
            />
          )}
          <p className="sf-small sf-muted" style={{ marginTop: 14 }}>{tt(ctx, 'sf.pickup_only')}</p>
        </div>
      </div>
    </section>
  );
}

/** About / contact / FAQ / policies / custom: document blocks, or generated defaults. */
export function InfoPage({ ctx, kind, slug }: { ctx: RenderCtx; kind: Exclude<PageKind, 'home' | 'services' | 'products' | 'team'>; slug?: string }): ReactNode {
  const p = docPage(ctx, kind, slug);
  if (kind === 'custom' && !p) return null;
  const titleKey: Record<string, string> = { about: 'sf.about', contact: 'sf.contact', faq: 'sf.faq', policies: 'sf.policies' };
  const title = p ? LT(ctx.locale, p.title) : tt(ctx, titleKey[kind] ?? 'sf.home');
  const hasPolicy = p?.blocks.some((b) => b.type === 'policies' && b.visibility.enabled);
  return (
    <>
      <SectionTitle title={title} />
      {p && p.blocks.length > 0 ? <BlocksView ctx={ctx} blocks={p.blocks} /> : <DefaultInfo ctx={ctx} kind={kind} />}
      {/* booking terms must be readable before payment, even if the owner removed the block */}
      {kind === 'policies' && !hasPolicy && p && p.blocks.length > 0 && (
        <section className="sf-section"><div className="sf-container"><PolicyText ctx={ctx} /></div></section>
      )}
    </>
  );
}

function DefaultInfo({ ctx, kind }: { ctx: RenderCtx; kind: string }) {
  const intro = L(ctx.locale, ctx.data.profile.intro, ctx.data.profile.introEn);
  return (
    <section className="sf-section">
      <div className="sf-container sf-list" style={{ gap: 16 }}>
        {kind === 'about' && (intro ? intro.split(/\n+/).map((l, i) => <p key={i}>{l}</p>) : <p className="sf-muted">{tt(ctx, 'sf.intro_empty')}</p>)}
        {kind === 'contact' && (
          <>
            <Contact ctx={ctx} />
            <Hours ctx={ctx} />
            <Socials ctx={ctx} />
          </>
        )}
        {kind === 'faq' && <p className="sf-muted">{tt(ctx, 'sf.faq_empty')}</p>}
        {kind === 'policies' && <PolicyText ctx={ctx} />}
      </div>
    </section>
  );
}

/** Path → page for /preview/<token>?path=… (and tests). Returns null for unknown paths. */
export function resolvePath(ctx: RenderCtx, path: string, query: URLSearchParams): ReactNode {
  const parts = path.split('/').filter(Boolean);
  const [a, b] = parts;
  if (!a) return <HomePage ctx={ctx} />;
  if (a === 'services') return b ? <ServicePage ctx={ctx} id={b} /> : <ServicesPage ctx={ctx} categoryId={query.get('category')} />;
  if (a === 'team') return b ? <StaffPage ctx={ctx} id={b} /> : <TeamPage ctx={ctx} />;
  if (a === 'products') return b ? <ProductPage ctx={ctx} id={b} /> : <ProductsPage ctx={ctx} categoryId={query.get('category')} />;
  if (a === 'pages' && b) return <InfoPage ctx={ctx} kind="custom" slug={b} />;
  if (a === 'about' || a === 'contact' || a === 'faq' || a === 'policies') return <InfoPage ctx={ctx} kind={a} />;
  if (a === 'booking' || a === 'cart' || a === 'checkout') {
    return (
      <section className="sf-section"><div className="sf-container"><p className="sf-alert">{tt(ctx, 'sf.preview_no_booking')}</p></div></section>
    );
  }
  return null;
}

export { LT };
