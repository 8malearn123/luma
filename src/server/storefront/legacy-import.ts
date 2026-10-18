import { z } from 'zod';
import { generateDraft, paletteFromPrimary, PALETTES } from '@/lib/builder/defaults';
import { newBlock, type Brand, type FontKey, type StorefrontDocument } from '@/lib/builder/schema';

/**
 * Converts the legacy browser-only settings (public/dash-site.js `luma_site`,
 * public/salon-page.js `luma_page_cfg`) into ONE StorefrontDocument draft.
 *
 * The legacy prototype stored the same visual choices in several places.
 * Explicit precedence (highest first) for theme colors:
 *   1. luma_page_cfg.themeCustom   (owner's fully custom theme: bg/card/ac/tx/rad)
 *   2. luma_page_cfg.theme         (preset key: dark-luxury | rose-velvet | minimal-emerald | pearl-light)
 *   3. luma_site.palette           (gold | rose | emerald | plum | sand)
 *   4. default palette
 * Fonts: luma_site.font (serif|modern) > luma_page_cfg.font (plex|…) > palette default.
 * Sections: luma_site.sections booleans decide which home blocks exist;
 * luma_page_cfg.pagesOn / faqText / privacyText / returnsText feed FAQ/policies.
 * Contact & socials are returned separately for tenant_profiles (business facts
 * live in the profile, not in the design document).
 * Images (base64 in localStorage) are intentionally NOT imported: they must be
 * re-uploaded through the asset pipeline (size/type checks, re-encoding, alt text).
 * The result is only ever written as a DRAFT; publishing stays an explicit action.
 */
export const legacyInputSchema = z.object({
  luma_site: z
    .object({
      palette: z.string().max(30).optional(),
      layout: z.string().max(30).optional(),
      font: z.string().max(30).optional(),
      sections: z.record(z.string(), z.boolean()).optional(),
    })
    .partial()
    .optional(),
  luma_page_cfg: z
    .object({
      title: z.string().max(120).optional(),
      bio: z.string().max(1000).optional(),
      phone: z.string().max(40).optional(),
      address: z.string().max(300).optional(),
      theme: z.string().max(40).optional(),
      themeCustom: z.object({ bg: z.string(), card: z.string(), ac: z.string(), tx: z.string(), rad: z.number().optional() }).partial().nullable().optional(),
      font: z.string().max(30).optional(),
      welcome: z.string().max(300).optional(),
      social: z.record(z.string(), z.string().max(200)).optional(),
      about: z.string().max(4000).optional(),
      faqText: z.string().max(6000).optional(),
      privacyText: z.string().max(6000).optional(),
      returnsText: z.string().max(4000).optional(),
      pagesOn: z.record(z.string(), z.boolean()).optional(),
    })
    .partial()
    .optional(),
});
export type LegacyInput = z.infer<typeof legacyInputSchema>;

const LEGACY_PRESETS: Record<string, { bg: string; card: string; ac: string; tx: string; rad: number }> = {
  'dark-luxury': { bg: '#09090b', card: '#151517', ac: '#e5c158', tx: '#f5f1e8', rad: 18 },
  'rose-velvet': { bg: '#1a0e12', card: '#241318', ac: '#e08a9b', tx: '#f8eef1', rad: 18 },
  'minimal-emerald': { bg: '#0a1413', card: '#12201e', ac: '#8fd0c0', tx: '#eef6f4', rad: 18 },
  'pearl-light': { bg: '#f7f3ec', card: '#ffffff', ac: '#9c8047', tx: '#2e241b', rad: 18 },
};
const SITE_PALETTES: Record<string, string> = { gold: 'noir', rose: 'plum', emerald: 'sage', plum: 'plum', sand: 'pearl' };
const hex = (v: unknown) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toUpperCase() : null);

function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => [(s >> 16) & 255, (s >> 8) & 255, s & 255];
  const [x, y] = [ch(pa), ch(pb)];
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

function colorsFromLegacy(theme: { bg: string; card: string; ac: string; tx: string }): Brand['colors'] {
  const bg = hex(theme.bg) ?? '#0E0D10';
  const surface = hex(theme.card) ?? bg;
  const text = hex(theme.tx) ?? '#F5F1E8';
  const accent = hex(theme.ac) ?? '#C9A75E';
  const base = paletteFromPrimary(accent, true);
  return { ...base, background: bg, surface, text, mutedText: mix(text, bg, 0.35), primary: accent, accent, border: mix(surface, text, 0.15) };
}

const radiusOf = (rad?: number): Brand['radius'] => (rad === undefined ? 'md' : rad <= 2 ? 'none' : rad <= 8 ? 'sm' : rad <= 14 ? 'md' : rad <= 22 ? 'lg' : 'pill');

export interface LegacyImportResult {
  document: StorefrontDocument;
  profile: { tagline?: string; intro?: string; contactPhone?: string; address?: string; socials: Record<string, string> };
  precedence: string[];
}

export function importLegacy(input: LegacyInput, businessName: string, businessType: string): LegacyImportResult {
  const site = input.luma_site ?? {};
  const cfg = input.luma_page_cfg ?? {};
  const precedence: string[] = [];
  const doc = generateDraft({ businessName: cfg.title || businessName, businessType, tagline: cfg.bio });

  if (cfg.themeCustom && hex(cfg.themeCustom.bg) && hex(cfg.themeCustom.ac)) {
    doc.brand.colors = colorsFromLegacy(cfg.themeCustom as { bg: string; card: string; ac: string; tx: string });
    doc.brand.radius = radiusOf(cfg.themeCustom.rad);
    precedence.push('colors: luma_page_cfg.themeCustom');
  } else if (cfg.theme && LEGACY_PRESETS[cfg.theme]) {
    doc.brand.colors = colorsFromLegacy(LEGACY_PRESETS[cfg.theme]);
    doc.brand.radius = radiusOf(LEGACY_PRESETS[cfg.theme].rad);
    precedence.push(`colors: luma_page_cfg.theme=${cfg.theme}`);
  } else if (site.palette && SITE_PALETTES[site.palette]) {
    const p = PALETTES.find((x) => x.key === SITE_PALETTES[site.palette!])!;
    doc.brand.colors = { ...p.colors };
    precedence.push(`colors: luma_site.palette=${site.palette}`);
  } else precedence.push('colors: default palette');

  let fonts: { heading: FontKey; body: FontKey } | null = null;
  if (site.font === 'serif') fonts = { heading: 'bodoni-moda', body: 'ibm-plex-arabic' };
  else if (site.font === 'modern') fonts = { heading: 'ibm-plex-arabic', body: 'ibm-plex-arabic' };
  else if (cfg.font === 'plex') fonts = { heading: 'ibm-plex-arabic', body: 'ibm-plex-arabic' };
  if (fonts) {
    doc.brand.fonts = fonts;
    precedence.push(`fonts: ${site.font ? 'luma_site.font' : 'luma_page_cfg.font'}`);
  }
  if (site.layout === 'minimal') Object.assign(doc.brand, { cardStyle: 'flat', density: 'airy' });
  if (site.layout === 'cards') Object.assign(doc.brand, { cardStyle: 'elevated' });

  const home = doc.layout.pages.find((p) => p.kind === 'home')!;
  const sec = site.sections;
  if (sec) {
    const drop = new Set<string>();
    if (sec.services === false) drop.add('service_list');
    if (sec.gallery === false) drop.add('gallery');
    if (sec.reviews === false) drop.add('reviews');
    if (sec.about === false) drop.add('intro');
    home.blocks = home.blocks.filter((b) => !drop.has(b.type));
    if (sec.faq) home.blocks.splice(home.blocks.length - 1, 0, newBlock('faq', { heading: { ar: 'الأسئلة الشائعة' }, items: parseFaq(cfg.faqText) }));
    precedence.push('home sections: luma_site.sections');
  }
  if (cfg.welcome?.trim()) home.blocks.unshift(newBlock('welcome', { message: { ar: cfg.welcome.trim().slice(0, 200) } }));

  const faqPage = doc.layout.pages.find((p) => p.kind === 'faq');
  if (faqPage && cfg.faqText) faqPage.blocks = [newBlock('faq', { heading: { ar: 'الأسئلة الشائعة' }, items: parseFaq(cfg.faqText) })];
  const pol = doc.layout.pages.find((p) => p.kind === 'policies');
  if (pol) {
    pol.blocks = [
      newBlock('policies', {
        heading: { ar: 'السياسات' },
        showBookingPolicy: true,
        showReturns: !!cfg.returnsText,
        returnsText: { ar: (cfg.returnsText ?? '').slice(0, 2000) },
        privacyText: { ar: (cfg.privacyText ?? '').slice(0, 4000) },
      }),
    ];
  }

  const socials: Record<string, string> = {};
  const map: Record<string, string> = { ig: 'instagram', tk: 'tiktok', sc: 'snapchat', x: 'x', wa: 'whatsapp' };
  for (const [k, v] of Object.entries(cfg.social ?? {})) if (map[k] && v.trim()) socials[map[k]] = v.trim().replace(/^@/, '').slice(0, 100);
  return {
    document: doc,
    profile: { tagline: cfg.bio?.slice(0, 160), intro: (cfg.about || cfg.bio)?.slice(0, 4000), contactPhone: cfg.phone, address: cfg.address, socials },
    precedence,
  };
}

/** Legacy FAQ text: "Q?\nA" pairs separated by blank lines (best effort). */
function parseFaq(text?: string) {
  if (!text) return [];
  return text
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim().split('\n'))
    .filter((l) => l.length >= 2)
    .slice(0, 30)
    .map(([q, ...a]) => ({ q: { ar: q.replace(/^[-•*\s]+/, '').slice(0, 200) }, a: { ar: a.join(' ').slice(0, 1200) } }));
}
