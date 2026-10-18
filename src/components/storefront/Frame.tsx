import type { ReactNode } from 'react';
import { translate, dirOf } from '@/lib/i18n';
import type { I18nText, StorePage } from '@/lib/builder/schema';
import { L, LT, type RenderCtx } from './types';
import { link, pageHref, Socials } from './Blocks';
import { fontHref, themeAttrs, themeStyle } from './theme';

/**
 * Storefront chrome. Structure, navigation behavior and the Book entry are
 * LUMA's; colors, fonts, logo and layout tokens are the business's.
 */
export function StoreFrame({ ctx, currentPath, children, previewBanner }: { ctx: RenderCtx; currentPath: string; children: ReactNode; previewBanner?: string }) {
  const { doc, profile, tenant } = ctx.data;
  const t = (k: string) => translate(ctx.locale, k);
  const nav = doc.layout.pages.filter((p) => p.showInNav);
  const footerPages = doc.layout.pages.filter((p) => p.showInFooter);
  const home = doc.layout.pages.find((p) => p.kind === 'home');
  const footerBlock = home?.blocks.find((b) => b.type === 'footer');
  const footerNote = footerBlock ? LT(ctx.locale, (footerBlock.props as { note?: I18nText }).note) : '';
  const logo = doc.brand.logoAssetId ? ctx.data.assets[doc.brand.logoAssetId]?.w640 : profile.logoUrl;
  const brandName = doc.brand.wordmark || profile.wordmark || tenant.name;
  const isCurrent = (p: StorePage) => {
    const href = p.kind === 'home' ? '/' : p.kind === 'custom' ? `/pages/${p.slug}` : `/${p.kind}`;
    return currentPath === href;
  };
  const bookHref = link(ctx, '/booking');
  return (
    <div className="sf-root" style={themeStyle(doc)} {...themeAttrs(doc)} dir={dirOf(ctx.locale)} lang={ctx.locale}>
      {/* only the allowlisted font families this document selected */}
      <link rel="stylesheet" href={fontHref(doc)} />
      <a className="sf-skip" href="#sf-main">{t('nav.skip_to_content')}</a>
      {previewBanner && <div className="sf-preview-banner" role="note">{previewBanner}</div>}
      <header className="sf-header">
        <div className="sf-container">
          <a href={link(ctx, '/')} className="sf-brand">
            {logo ? <img src={logo} alt={brandName} width={120} height={40} /> : <span>{brandName}</span>}
          </a>
          <nav className="sf-nav" aria-label={t('sf.nav')}>
            {nav.map((p) => (
              <a key={p.id} href={pageHref(ctx, p)} aria-current={isCurrent(p) ? 'page' : undefined}>{LT(ctx.locale, p.title)}</a>
            ))}
            {!nav.some((p) => p.kind === 'services') && <a href={link(ctx, '/services')} aria-current={currentPath === '/services' ? 'page' : undefined}>{t('sf.services')}</a>}
            {ctx.data.productsEnabled && ctx.data.catalog.products.length > 0 && !nav.some((p) => p.kind === 'products') && <a href={link(ctx, '/products')}>{t('sf.products')}</a>}
          </nav>
          {ctx.data.productsEnabled && <a href={link(ctx, '/cart')} className="sf-btn-secondary" style={{ minHeight: 40 }}>{t('sf.cart')}</a>}
          {/* the booking entry is part of LUMA's fixed structure: always present */}
          <a href={bookHref} className="sf-btn" style={{ minHeight: 40 }}>{t('sf.book')}</a>
        </div>
      </header>
      <main id="sf-main" className="sf-main" tabIndex={-1}>{children}</main>
      <footer className="sf-footer">
        <div className="sf-container sf-row between">
          <div>
            <div style={{ fontWeight: 600, color: 'var(--sf-text)' }}>{tenant.name}</div>
            {footerNote && <div>{footerNote}</div>}
            {(footerBlock ? (footerBlock.props as { showSocial?: boolean }).showSocial !== false : true) && <div style={{ marginTop: 8 }}><Socials ctx={ctx} /></div>}
          </div>
          <nav aria-label={t('sf.footer_nav')} className="sf-row">
            {footerPages.map((p) => <a key={p.id} href={pageHref(ctx, p)}>{LT(ctx.locale, p.title)}</a>)}
            {!footerPages.some((p) => p.kind === 'policies') && <a href={link(ctx, '/policies')}>{t('sf.policies')}</a>}
          </nav>
          {doc.appearance.showPoweredBy && (
            <a className="sf-powered" href="/" rel="noopener">{translate(ctx.locale, 'common.powered_by')}</a>
          )}
        </div>
      </footer>
      <nav className="sf-bottom-nav" aria-label={t('sf.nav')}>
        <a href={link(ctx, '/')}>{home ? LT(ctx.locale, home.title) : t('sf.home')}</a>
        <a href={link(ctx, '/services')}>{t('sf.services')}</a>
        <a href={bookHref}>{t('sf.book')}</a>
        <a href={link(ctx, '/contact')}>{t('sf.contact')}</a>
      </nav>
    </div>
  );
}

export function SectionTitle({ title }: { title: string }) {
  return (
    <section className="sf-section" style={{ paddingBottom: 0 }}>
      <div className="sf-container">
        <h1 className="sf-h1">{title}</h1>
      </div>
    </section>
  );
}

export { L };
