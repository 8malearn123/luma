import type { ReactNode } from 'react';
import { translate } from '@/lib/i18n';
import { formatDuration, formatMoney } from '@/lib/format';
import type { BlockAction, I18nText, PageBlock, StorePage } from '@/lib/builder/schema';
import { L, LT, type PublicService, type RenderCtx } from './types';
import { Gallery } from './Gallery';
import { AddToCart } from './AddToCart';
import { socialHref, SOCIAL_LABELS } from './social';

/**
 * Pure renderers for every block type. No data fetching, no secrets: they
 * render the allowlisted StorefrontData. Missing/archived targets degrade to
 * a clear fallback instead of a broken link.
 */
const t = (ctx: RenderCtx, k: string, v?: Record<string, string | number>) => translate(ctx.locale, k, v);
const tx = (ctx: RenderCtx, x: I18nText | undefined) => LT(ctx.locale, x);
const money = (ctx: RenderCtx, m: number) => formatMoney(m, ctx.data.tenant.currency, ctx.locale);

/** Build a storefront path; preview contexts route through ?path= */
export function link(ctx: RenderCtx, path: string): string {
  if (ctx.base.startsWith('/preview/')) return `${ctx.base}?path=${encodeURIComponent(path)}`;
  return `${ctx.base}${path === '/' ? '' : path}`;
}

export function pageHref(ctx: RenderCtx, page: Pick<StorePage, 'kind' | 'slug'>): string {
  switch (page.kind) {
    case 'home':
      return link(ctx, '/');
    case 'custom':
      return link(ctx, `/pages/${page.slug}`);
    default:
      return link(ctx, `/${page.kind}`);
  }
}

/** Resolve an action to an href, or null when its target is gone (→ fallback). */
export function actionHref(ctx: RenderCtx, a: BlockAction | undefined): string | null {
  if (!a) return null;
  const c = ctx.data.catalog;
  switch (a.type) {
    case 'start_booking':
      if (a.targetId && !c.services.some((s) => s.id === a.targetId)) return link(ctx, '/booking');
      return link(ctx, `/booking${a.targetId ? `?service=${a.targetId}` : ''}`);
    case 'service':
      return c.services.some((s) => s.id === a.targetId) ? link(ctx, `/services/${a.targetId}`) : null;
    case 'product':
      return c.products.some((s) => s.id === a.targetId) ? link(ctx, `/products/${a.targetId}`) : null;
    case 'category': {
      const cat = c.categories.find((x) => x.id === a.targetId);
      if (!cat) return null;
      return link(ctx, `/${cat.kind === 'product' ? 'products' : 'services'}?category=${cat.id}`);
    }
    case 'staff':
      return c.staff.some((s) => s.id === a.targetId) ? link(ctx, `/team/${a.targetId}`) : null;
    case 'page': {
      const p = ctx.data.doc.layout.pages.find((x) => x.id === a.targetId);
      return p ? pageHref(ctx, p) : null;
    }
    case 'section':
      return `#${a.targetId}`;
    case 'external':
      return a.url ?? null;
    default:
      return null;
  }
}

function ActionLink({ ctx, action, className, children }: { ctx: RenderCtx; action?: BlockAction; className?: string; children: ReactNode }) {
  const href = actionHref(ctx, action);
  if (!href) return <span className="sf-fallback" role="note">{t(ctx, 'sf.link_unavailable')}</span>;
  const ext = action?.type === 'external';
  return (
    <a href={href} className={className} {...(ext ? { rel: 'noopener noreferrer nofollow', target: '_blank' } : {})}>
      {children}
    </a>
  );
}

function Img({ ctx, id, alt, ratio, large }: { ctx: RenderCtx; id: string | null | undefined; alt: string; ratio: string; large?: boolean }) {
  const a = id ? ctx.data.assets[id] : undefined;
  return (
    <div className={`sf-media r-${ratio.replace(':', '-')}`}>
      {a ? <img src={large ? a.w1280 : a.w640} alt={alt || L(ctx.locale, a.alt, a.altEn)} loading="lazy" decoding="async" width={large ? 1280 : 640} height={large ? 720 : 480} /> : null}
    </div>
  );
}

function Heading({ ctx, text }: { ctx: RenderCtx; text?: I18nText }) {
  const s = tx(ctx, text);
  return s ? <h2 className="sf-h2">{s}</h2> : null;
}

function ServiceItem({ ctx, s, display, showPrices }: { ctx: RenderCtx; s: PublicService; display: 'list' | 'cards'; showPrices: boolean }) {
  const name = L(ctx.locale, s.name, s.nameEn);
  const desc = L(ctx.locale, s.description, s.descriptionEn);
  const price = showPrices ? (s.priceIsFrom ? t(ctx, 'sf.price_from', { price: money(ctx, s.priceMinor) }) : money(ctx, s.priceMinor)) : null;
  const book = link(ctx, `/booking?service=${s.id}`);
  if (display === 'cards') {
    return (
      <article className="sf-card">
        {s.imageUrl && (
          <div className="sf-media r-4-3" style={{ marginBottom: 12 }}>
            <img src={s.imageUrl} alt={name} loading="lazy" width={640} height={480} />
          </div>
        )}
        <h3 style={{ fontSize: '1.05rem' }}>
          <a href={link(ctx, `/services/${s.id}`)} style={{ color: 'inherit' }}>{name}</a>
        </h3>
        {desc && <p className="sf-muted sf-small" style={{ margin: '0 0 10px' }}>{desc.slice(0, 160)}</p>}
        <div className="sf-row between">
          <span className="sf-muted sf-small">{formatDuration(s.durationMin, ctx.locale)}</span>
          {price && <span className="sf-price">{price}</span>}
        </div>
        <a className="sf-btn" href={book} style={{ marginTop: 12, width: '100%' }}>{t(ctx, 'sf.book')}</a>
      </article>
    );
  }
  return (
    <div className="sf-row between">
      <div style={{ minWidth: 0, flex: 1 }}>
        <a href={link(ctx, `/services/${s.id}`)} style={{ color: 'inherit', fontWeight: 600 }}>{name}</a>
        <div className="sf-muted sf-small">{formatDuration(s.durationMin, ctx.locale)}{desc ? ` · ${desc.slice(0, 90)}` : ''}</div>
      </div>
      {price && <span className="sf-price">{price}</span>}
      <a className="sf-btn-secondary" href={book}>{t(ctx, 'sf.book')}</a>
    </div>
  );
}

export function ServiceCollection({ ctx, services, display, showPrices = true }: { ctx: RenderCtx; services: PublicService[]; display: 'list' | 'cards'; showPrices?: boolean }) {
  if (!services.length) return <p className="sf-muted">{t(ctx, 'sf.no_services')}</p>;
  return display === 'cards' ? (
    <div className="sf-grid">{services.map((s) => <ServiceItem key={s.id} ctx={ctx} s={s} display="cards" showPrices={showPrices} />)}</div>
  ) : (
    <div className="sf-card sf-list">{services.map((s) => <ServiceItem key={s.id} ctx={ctx} s={s} display="list" showPrices={showPrices} />)}</div>
  );
}

export function ProductCollection({ ctx, ids, categoryId, display, limit }: { ctx: RenderCtx; ids?: string[]; categoryId?: string | null; display: 'grid' | 'list'; limit?: number }) {
  if (!ctx.data.productsEnabled) return null;
  let items = ctx.data.catalog.products;
  if (ids?.length) items = ids.map((id) => items.find((p) => p.id === id)).filter((p): p is (typeof items)[number] => !!p);
  else if (categoryId) items = items.filter((p) => p.categoryId === categoryId);
  if (limit) items = items.slice(0, limit);
  if (!items.length) return <p className="sf-muted">{t(ctx, 'sf.no_products')}</p>;
  const labels = { add: t(ctx, 'sf.add_to_cart'), added: t(ctx, 'sf.added'), out: t(ctx, 'sf.out_of_stock'), error: t(ctx, 'sf.cart_error'), variant: t(ctx, 'sf.variant'), viewCart: t(ctx, 'sf.view_cart') };
  const card = (p: (typeof items)[number]) => (
    <article key={p.id} className={display === 'grid' ? 'sf-card' : 'sf-row between'}>
      {display === 'grid' && (
        <div className="sf-media r-1-1" style={{ marginBottom: 10 }}>
          {p.imageUrl && <img src={p.imageUrl} alt={L(ctx.locale, p.name, p.nameEn)} loading="lazy" width={640} height={640} />}
        </div>
      )}
      <div style={{ flex: 1 }}>
        <a href={link(ctx, `/products/${p.id}`)} style={{ color: 'inherit', fontWeight: 600 }}>{L(ctx.locale, p.name, p.nameEn)}</a>
        <div className="sf-price">{money(ctx, p.priceMinor)}</div>
        {!p.inStock && <span className="sf-badge">{t(ctx, 'sf.out_of_stock')}</span>}
      </div>
      {!ctx.editing && <AddToCart slug={ctx.data.tenant.slug} productId={p.id} variants={p.variants.map((v) => ({ id: v.id, name: L(ctx.locale, v.name, v.nameEn) }))} disabled={!p.inStock} labels={labels} />}
    </article>
  );
  return display === 'grid' ? <div className="sf-grid">{items.map(card)}</div> : <div className="sf-card sf-list">{items.map(card)}</div>;
}

const HOURS_DAYS: [string, string][] = [
  ['الأحد', 'Sun'], ['الاثنين', 'Mon'], ['الثلاثاء', 'Tue'], ['الأربعاء', 'Wed'], ['الخميس', 'Thu'], ['الجمعة', 'Fri'], ['السبت', 'Sat'],
];

export function Hours({ ctx, branchId }: { ctx: RenderCtx; branchId?: string | null }) {
  const b = ctx.data.branches.find((x) => x.id === branchId) ?? ctx.data.branches[0];
  if (!b) return <p className="sf-muted">{t(ctx, 'sf.hours_unknown')}</p>;
  return (
    <div className="sf-card">
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <caption className="sf-small sf-muted" style={{ textAlign: 'start', marginBottom: 6 }}>{b.name} · {t(ctx, 'sf.local_time')}</caption>
        <tbody>
          {HOURS_DAYS.map(([ar, en], wd) => {
            const rows = b.hours.filter((h) => h.weekday === wd);
            return (
              <tr key={wd}>
                <th scope="row" style={{ textAlign: 'start', fontWeight: 500, padding: '4px 0' }}>{ctx.locale === 'ar' ? ar : en}</th>
                <td style={{ textAlign: 'end' }} dir="ltr">{rows.length ? rows.map((r) => `${r.start}–${r.end}`).join(', ') : t(ctx, 'sf.closed')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function Contact({ ctx, opts = { showPhone: true, showWhatsapp: true, showEmail: true, showAddress: true } }: { ctx: RenderCtx; opts?: { showPhone: boolean; showWhatsapp: boolean; showEmail: boolean; showAddress: boolean } }) {
  const p = ctx.data.profile;
  const b = ctx.data.branches[0];
  const phone = p.contactPhone ?? b?.phone;
  const address = p.address ?? b?.address;
  const wa = p.whatsapp ? socialHref('whatsapp', p.whatsapp) : null;
  const rows = [
    opts.showPhone && phone ? <li key="p">{t(ctx, 'sf.phone')}: <a href={`tel:${phone.replace(/[^+0-9]/g, '')}`} dir="ltr">{phone}</a></li> : null,
    opts.showWhatsapp && wa ? <li key="w"><a href={wa} rel="noopener noreferrer" target="_blank">{t(ctx, 'sf.whatsapp')}</a></li> : null,
    opts.showEmail && p.contactEmail ? <li key="e">{t(ctx, 'sf.email')}: <a href={`mailto:${p.contactEmail}`} dir="ltr">{p.contactEmail}</a></li> : null,
    opts.showAddress && address ? <li key="a">{t(ctx, 'sf.address')}: {address}</li> : null,
  ].filter(Boolean);
  if (!rows.length) return <p className="sf-muted">{t(ctx, 'sf.contact_unknown')}</p>;
  return <ul className="sf-card" style={{ listStyle: 'none', margin: 0, display: 'grid', gap: 8 }}>{rows}</ul>;
}

export function Socials({ ctx }: { ctx: RenderCtx }) {
  const entries = Object.entries(ctx.data.profile.socials).map(([k, v]) => [k, socialHref(k, v)] as const).filter(([, h]) => !!h);
  if (!entries.length) return null;
  return (
    <ul className="sf-row" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {entries.map(([k, h]) => (
        <li key={k}><a className="sf-btn-secondary" href={h!} rel="noopener noreferrer" target="_blank">{SOCIAL_LABELS[k]?.[ctx.locale === 'ar' ? 0 : 1] ?? k}</a></li>
      ))}
    </ul>
  );
}

export function PolicyText({ ctx }: { ctx: RenderCtx }) {
  const pol = ctx.data.policy;
  const text = L(ctx.locale, pol.policyText, pol.policyTextEn);
  return (
    <div className="sf-card">
      <h3>{t(ctx, 'sf.booking_policy')}</h3>
      {text ? text.split(/\n+/).map((line, i) => <p key={i}>{line}</p>) : null}
      <ul>
        <li>{t(ctx, 'sf.policy_cancel_window', { h: pol.cancellationWindowHours })}</li>
        <li>{t(ctx, 'sf.policy_no_show', { m: pol.noShowGraceMin })}</li>
        {pol.depositMode === 'percent' && <li>{t(ctx, 'sf.policy_deposit_percent', { p: pol.depositValue / 100 })}</li>}
        {pol.depositMode === 'fixed' && <li>{t(ctx, 'sf.policy_deposit_fixed', { a: money(ctx, pol.depositValue) })}</li>}
        {pol.allowOnSite && pol.depositMode === 'none' && <li>{t(ctx, 'sf.policy_on_site')}</li>}
      </ul>
    </div>
  );
}

function Stars({ n }: { n: number }) {
  return <span className="sf-stars" aria-label={`${n}/5`}>{'★'.repeat(n)}{'☆'.repeat(5 - n)}</span>;
}

export function BlockView({ ctx, block }: { ctx: RenderCtx; block: PageBlock }): ReactNode {
  const p = block.props as Record<string, unknown> & Record<string, never>;
  const c = ctx.data.catalog;
  const ap = ctx.data.doc.appearance;
  const wrap = (children: ReactNode, cls = 'sf-section') => (
    <section id={block.id} className={cls}>
      <div className="sf-container">{children}</div>
    </section>
  );
  switch (block.type) {
    case 'hero': {
      const img = p.imageAssetId ? ctx.data.assets[p.imageAssetId as string] : undefined;
      const label = tx(ctx, p.ctaLabel as I18nText) || t(ctx, 'sf.book');
      return (
        <section id={block.id} className={`sf-hero ${img ? 'has-image' : ''} ${p.align === 'center' ? 'center' : ''}`}>
          {img && <img src={img.w1280} alt={tx(ctx, p.imageAlt as I18nText) || L(ctx.locale, img.alt, img.altEn)} width={1280} height={720} fetchPriority="high" />}
          {img && <div className="shade" style={{ opacity: Number(p.overlay ?? 0.35) }} />}
          <div className="sf-container">
            <h1 className="sf-h1">{tx(ctx, p.title as I18nText) || ctx.data.tenant.name}</h1>
            {tx(ctx, p.subtitle as I18nText) && <p style={{ fontSize: '1.1rem', maxWidth: 640, marginInline: p.align === 'center' ? 'auto' : undefined }}>{tx(ctx, p.subtitle as I18nText)}</p>}
            <ActionLink ctx={ctx} action={block.action ?? { type: 'start_booking' }} className="sf-btn">{label}</ActionLink>
          </div>
        </section>
      );
    }
    case 'image_ad':
    case 'image': {
      const media = <Img ctx={ctx} id={p.imageAssetId as string} alt={tx(ctx, p.alt as I18nText)} ratio={String(p.aspect ?? '4:3')} large={block.type === 'image_ad'} />;
      const caption = block.type === 'image_ad' ? tx(ctx, p.caption as I18nText) : '';
      const body = block.action ? (actionHref(ctx, block.action) ? <a href={actionHref(ctx, block.action)!} aria-label={tx(ctx, p.alt as I18nText) || caption || t(ctx, 'sf.open')} {...(block.action.type === 'external' ? { rel: 'noopener noreferrer nofollow', target: '_blank' } : {})}>{media}</a> : <>{media}<span className="sf-fallback">{t(ctx, 'sf.link_unavailable')}</span></>) : media;
      return wrap(<figure style={{ margin: 0 }}>{body}{caption && <figcaption className="sf-muted sf-small" style={{ marginTop: 6 }}>{caption}</figcaption>}</figure>);
    }
    case 'text': {
      const html = (p.html as { ar?: string; en?: string }) ?? {};
      const content = ctx.locale === 'en' && html.en ? html.en : html.ar ?? '';
      // content was sanitized server-side (allowlist) on save and again on load
      return wrap(<><Heading ctx={ctx} text={p.heading as I18nText} /><div className="sf-rich" dangerouslySetInnerHTML={{ __html: content }} /></>);
    }
    case 'cta':
      return wrap(
        <div className="sf-card" style={{ textAlign: 'center' }}>
          <Heading ctx={ctx} text={p.heading as I18nText} />
          {tx(ctx, p.text as I18nText) && <p>{tx(ctx, p.text as I18nText)}</p>}
          <ActionLink ctx={ctx} action={block.action} className="sf-btn">{tx(ctx, p.label as I18nText) || t(ctx, 'sf.book')}</ActionLink>
        </div>,
      );
    case 'service_list': {
      let items = c.services;
      const ids = (p.serviceIds as string[]) ?? [];
      if (ids.length) items = ids.map((id) => items.find((s) => s.id === id)).filter((s): s is PublicService => !!s);
      else if (p.categoryId) items = items.filter((s) => s.categoryId === p.categoryId);
      items = items.slice(0, Number(p.limit ?? 12));
      const display = p.display === 'list' || p.display === 'cards' ? (p.display as 'list' | 'cards') : ap.serviceDisplay;
      return wrap(
        <>
          <Heading ctx={ctx} text={(p.heading as I18nText)?.ar ? (p.heading as I18nText) : { ar: t({ ...ctx, locale: 'ar' }, 'sf.services'), en: t({ ...ctx, locale: 'en' }, 'sf.services') }} />
          <ServiceCollection ctx={ctx} services={items} display={display} showPrices={p.showPrices !== false} />
          <p style={{ marginTop: 14 }}><a href={link(ctx, '/services')}>{t(ctx, 'sf.all_services')}</a></p>
        </>,
      );
    }
    case 'service': {
      const s = c.services.find((x) => x.id === p.serviceId);
      return wrap(s ? <ServiceCollection ctx={ctx} services={[s]} display="cards" /> : <p className="sf-fallback">{t(ctx, 'sf.service_unavailable')} <a href={link(ctx, '/services')}>{t(ctx, 'sf.all_services')}</a></p>);
    }
    case 'categories': {
      const kind = (p.kind as 'service' | 'product') ?? 'service';
      const ids = (p.categoryIds as string[]) ?? [];
      let cats = c.categories.filter((x) => x.kind === kind);
      if (ids.length) cats = ids.map((id) => cats.find((x) => x.id === id)).filter((x): x is (typeof cats)[number] => !!x);
      if (!cats.length) return null;
      return wrap(
        <>
          <Heading ctx={ctx} text={p.heading as I18nText} />
          <div className="sf-row">{cats.map((cat) => <a key={cat.id} className="sf-btn-secondary" href={link(ctx, `/${kind === 'product' ? 'products' : 'services'}?category=${cat.id}`)}>{L(ctx.locale, cat.name, cat.nameEn)}</a>)}</div>
        </>,
      );
    }
    case 'product_grid': {
      if (!ctx.data.productsEnabled) return null;
      const display = p.display === 'list' ? 'list' : p.display === 'grid' || p.display === 'cards' ? 'grid' : ap.productDisplay;
      return wrap(<><Heading ctx={ctx} text={p.heading as I18nText} /><ProductCollection ctx={ctx} ids={p.productIds as string[]} categoryId={p.categoryId as string | null} display={display} limit={Number(p.limit ?? 8)} /></>);
    }
    case 'product': {
      if (!ctx.data.productsEnabled) return null;
      const exists = c.products.some((x) => x.id === p.productId);
      return wrap(exists ? <ProductCollection ctx={ctx} ids={[p.productId as string]} display="grid" /> : <p className="sf-fallback">{t(ctx, 'sf.product_unavailable')}</p>);
    }
    case 'team':
    case 'staff': {
      const ids = block.type === 'staff' ? [p.staffId as string] : ((p.staffIds as string[]) ?? []);
      let staff = c.staff;
      if (ids.length) staff = ids.map((id) => staff.find((s) => s.id === id)).filter((s): s is (typeof staff)[number] => !!s);
      if (!staff.length) return block.type === 'staff' ? wrap(<p className="sf-fallback">{t(ctx, 'sf.staff_unavailable')}</p>) : null;
      return wrap(
        <>
          {block.type === 'team' && <Heading ctx={ctx} text={p.heading as I18nText} />}
          <div className="sf-grid">
            {staff.map((s) => (
              <article key={s.id} className="sf-card" style={{ textAlign: 'center' }}>
                <div className="sf-media r-1-1" style={{ marginBottom: 10, borderRadius: '50%', maxWidth: 140, marginInline: 'auto' }}>
                  {s.photoUrl && <img src={s.photoUrl} alt={L(ctx.locale, s.displayName, s.displayNameEn)} loading="lazy" width={320} height={320} />}
                </div>
                <h3 style={{ fontSize: '1.05rem' }}><a href={link(ctx, `/team/${s.id}`)} style={{ color: 'inherit' }}>{L(ctx.locale, s.displayName, s.displayNameEn)}</a></h3>
                {s.specialty && <div className="sf-muted sf-small">{s.specialty}</div>}
                {(p.showBio || block.type === 'staff') && s.bio && <p className="sf-small">{s.bio.slice(0, 220)}</p>}
                <a className="sf-btn-secondary" href={link(ctx, `/booking?staff=${s.id}`)} style={{ marginTop: 8 }}>{t(ctx, 'sf.book_with')}</a>
              </article>
            ))}
          </div>
        </>,
      );
    }
    case 'gallery': {
      const items = ((p.items as { assetId: string; alt: I18nText }[]) ?? [])
        .map((it) => ({ a: ctx.data.assets[it.assetId], alt: tx(ctx, it.alt) }))
        .filter((x) => x.a)
        .map((x) => ({ src: x.a.w640, large: x.a.w1280, alt: x.alt || L(ctx.locale, x.a.alt, x.a.altEn) || ctx.data.tenant.name }));
      if (!items.length) return ctx.editing ? wrap(<p className="sf-fallback">{t(ctx, 'sf.gallery_empty')}</p>) : null;
      return wrap(<><Heading ctx={ctx} text={p.heading as I18nText} /><Gallery items={items} layout={(p.layout as 'grid' | 'carousel') ?? 'grid'} lightbox={p.lightbox !== false && !ctx.editing} labels={{ close: t(ctx, 'common.close'), prev: t(ctx, 'common.prev_page'), next: t(ctx, 'common.next_page'), open: t(ctx, 'sf.open') }} /></>);
    }
    case 'offers': {
      const ids = (p.packageIds as string[]) ?? [];
      let pk = c.packages;
      if (ids.length) pk = ids.map((id) => pk.find((x) => x.id === id)).filter((x): x is (typeof pk)[number] => !!x);
      if (!pk.length) return null;
      return wrap(
        <>
          <Heading ctx={ctx} text={p.heading as I18nText} />
          <div className="sf-grid">
            {pk.map((x) => (
              <article key={x.id} className="sf-card">
                <h3 style={{ fontSize: '1.05rem' }}>{L(ctx.locale, x.name, x.nameEn)}</h3>
                {x.description && <p className="sf-small sf-muted">{x.description}</p>}
                <ul className="sf-small">{x.items.map((i) => <li key={i.serviceId}>{i.name}{i.quantity > 1 ? ` × ${i.quantity}` : ''}</li>)}</ul>
                <div className="sf-price">{money(ctx, x.priceMinor)}</div>
              </article>
            ))}
          </div>
        </>,
      );
    }
    case 'reviews': {
      const min = Number(p.minRating ?? 1);
      const list = c.reviews.filter((r) => r.rating >= min).slice(0, Number(p.limit ?? 6));
      if (!list.length) return ctx.editing ? wrap(<p className="sf-fallback">{t(ctx, 'sf.no_reviews')}</p>) : null;
      return wrap(
        <>
          <Heading ctx={ctx} text={p.heading as I18nText} />
          {c.rating.average !== null && <p className="sf-muted">{t(ctx, 'sf.rating_summary', { avg: c.rating.average.toFixed(1), n: c.rating.count })} · {t(ctx, 'sf.verified_visits')}</p>}
          <div className="sf-grid cols-3">
            {list.map((r, i) => (
              <figure key={i} className="sf-card" style={{ margin: 0 }}>
                <Stars n={r.rating} />
                {r.comment && <blockquote style={{ margin: '8px 0' }}>{r.comment}</blockquote>}
                <figcaption className="sf-small sf-muted">{r.displayName}{r.staffName ? ` · ${r.staffName}` : ''}</figcaption>
              </figure>
            ))}
          </div>
        </>,
      );
    }
    case 'intro': {
      const text = p.useProfileIntro !== false ? L(ctx.locale, ctx.data.profile.intro, ctx.data.profile.introEn) : '';
      if (!text && !ctx.editing) return null;
      return wrap(<><Heading ctx={ctx} text={p.heading as I18nText} />{text ? text.split(/\n+/).map((l, i) => <p key={i}>{l}</p>) : <p className="sf-fallback">{t(ctx, 'sf.intro_empty')}</p>}</>);
    }
    case 'map': {
      const b = ctx.data.branches.find((x) => x.id === p.branchId) ?? ctx.data.branches[0];
      if (!b) return null;
      const q = b.latitude !== null && b.longitude !== null ? `${b.latitude},${b.longitude}` : [b.address, b.city].filter(Boolean).join(' ');
      return wrap(
        <>
          <Heading ctx={ctx} text={p.heading as I18nText} />
          <div className="sf-card">
            <p style={{ margin: '0 0 10px' }}>{[b.name, b.address, b.city].filter(Boolean).join(' · ')}</p>
            {q && <a className="sf-btn-secondary" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`} rel="noopener noreferrer" target="_blank">{t(ctx, 'sf.open_map')}</a>}
          </div>
        </>,
      );
    }
    case 'hours':
      return wrap(<><Heading ctx={ctx} text={p.heading as I18nText} /><Hours ctx={ctx} branchId={p.branchId as string | null} /></>);
    case 'contact':
      return wrap(<><Heading ctx={ctx} text={p.heading as I18nText} /><Contact ctx={ctx} opts={{ showPhone: p.showPhone !== false, showWhatsapp: p.showWhatsapp !== false, showEmail: p.showEmail !== false, showAddress: p.showAddress !== false }} /></>);
    case 'social':
      return Object.keys(ctx.data.profile.socials).length ? wrap(<><Heading ctx={ctx} text={p.heading as I18nText} /><Socials ctx={ctx} /></>) : null;
    case 'faq': {
      const items = (p.items as { q: I18nText; a: I18nText }[]) ?? [];
      if (!items.length && !ctx.editing) return null;
      return wrap(
        <div className="sf-faq">
          <Heading ctx={ctx} text={p.heading as I18nText} />
          {items.map((it, i) => (
            <details key={i}>
              <summary>{tx(ctx, it.q)}</summary>
              <p>{tx(ctx, it.a)}</p>
            </details>
          ))}
        </div>,
      );
    }
    case 'policies':
      return wrap(
        <div className="sf-list" style={{ gap: 12 }}>
          <Heading ctx={ctx} text={p.heading as I18nText} />
          {p.showBookingPolicy !== false && <PolicyText ctx={ctx} />}
          {p.showReturns === true && tx(ctx, p.returnsText as I18nText) && <div className="sf-card"><h3>{t(ctx, 'sf.returns')}</h3>{tx(ctx, p.returnsText as I18nText).split(/\n+/).map((l, i) => <p key={i}>{l}</p>)}</div>}
          {tx(ctx, p.privacyText as I18nText) && <div className="sf-card"><h3>{t(ctx, 'sf.privacy')}</h3>{tx(ctx, p.privacyText as I18nText).split(/\n+/).map((l, i) => <p key={i}>{l}</p>)}</div>}
        </div>,
      );
    case 'welcome':
      return (
        <div id={block.id} className={`sf-welcome ${p.tone === 'neutral' ? 'neutral' : ''}`} role="note">
          {block.action && actionHref(ctx, block.action) ? <a href={actionHref(ctx, block.action)!}>{tx(ctx, p.message as I18nText)}</a> : tx(ctx, p.message as I18nText)}
        </div>
      );
    case 'columns':
      return wrap(
        <div className={`sf-columns c${p.columns === 3 ? 3 : 2}`}>
          {(block.children ?? []).filter((ch) => ch.visibility.enabled || ctx.editing).map((ch) => (
            <div key={ch.id} className="sf-column">{renderInline(ctx, ch)}</div>
          ))}
        </div>,
      );
    case 'footer':
      return null; // rendered once by the storefront frame (StoreFooter) using these props
    default:
      return null;
  }
}

/** Children inside a container render without their own section padding. */
function renderInline(ctx: RenderCtx, b: PageBlock): ReactNode {
  const el = BlockView({ ctx, block: b });
  return <div className="sf-inline">{el}</div>;
}

export function BlocksView({ ctx, blocks }: { ctx: RenderCtx; blocks: PageBlock[] }) {
  return (
    <>
      {blocks.filter((b) => b.visibility.enabled).map((b) => (
        <BlockView key={b.id} ctx={ctx} block={b} />
      ))}
    </>
  );
}
