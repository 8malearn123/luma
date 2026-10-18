import type { CSSProperties } from 'react';
import { FONTS, type StorefrontDocument } from '@/lib/builder/schema';

const RADIUS: Record<StorefrontDocument['brand']['radius'], string> = { none: '0px', sm: '6px', md: '12px', lg: '20px', pill: '28px' };

/** Brand tokens → the storefront CSS variable contract. */
export function themeStyle(doc: StorefrontDocument): CSSProperties {
  const b = doc.brand;
  const c = b.colors;
  return {
    '--sf-bg': c.background,
    '--sf-surface': c.surface,
    '--sf-text': c.text,
    '--sf-muted': c.mutedText,
    '--sf-primary': c.primary,
    '--sf-primary-text': c.primaryText,
    '--sf-accent': c.accent,
    '--sf-border': c.border,
    '--sf-radius': RADIUS[b.radius],
    '--sf-font-heading': `${FONTS[b.fonts.heading].family}, system-ui, sans-serif`,
    '--sf-font-body': `${FONTS[b.fonts.body].family}, system-ui, sans-serif`,
  } as CSSProperties;
}

export function themeAttrs(doc: StorefrontDocument) {
  return {
    'data-density': doc.brand.density,
    'data-card': doc.brand.cardStyle,
    'data-button': doc.brand.buttonStyle,
    'data-nav': doc.appearance.navStyle,
  };
}

/** Google Fonts stylesheet for exactly the families the document uses (allowlisted keys only). */
export function fontHref(doc: StorefrontDocument): string {
  const fams = [...new Set([doc.brand.fonts.heading, doc.brand.fonts.body])].map((k) => `family=${FONTS[k].google}`);
  return `https://fonts.googleapis.com/css2?${fams.join('&')}&display=swap`;
}
