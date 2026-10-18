import { newBlock, SCHEMA_VERSION, type Appearance, type Brand, type FontKey, type PageBlock, type StorefrontDocument, type StorePage } from './schema';

/**
 * Deterministic first-draft generation from onboarding answers. Works with no
 * AI at all. Invents nothing: no services, prices, reviews or credentials —
 * catalog blocks render whatever real catalog data exists (or nothing).
 */
export interface Palette {
  key: string;
  nameAr: string;
  nameEn: string;
  colors: Brand['colors'];
  fonts: { heading: FontKey; body: FontKey };
}

export const PALETTES: Palette[] = [
  {
    key: 'pearl',
    nameAr: 'لؤلؤي',
    nameEn: 'Pearl',
    colors: { background: '#F7F3EC', surface: '#FFFFFF', text: '#2E241B', mutedText: '#6F6253', primary: '#9C8047', primaryText: '#FFFFFF', accent: '#C9AC7E', border: '#E6DCCB' },
    fonts: { heading: 'bodoni-moda', body: 'ibm-plex-arabic' },
  },
  {
    key: 'noir',
    nameAr: 'فخامة داكنة',
    nameEn: 'Noir',
    colors: { background: '#0E0D10', surface: '#18171C', text: '#F5F1E8', mutedText: '#A39C92', primary: '#E5C158', primaryText: '#16140F', accent: '#B8963E', border: '#2A282F' },
    fonts: { heading: 'bodoni-moda', body: 'ibm-plex-arabic' },
  },
  {
    key: 'rose',
    nameAr: 'وردي هادئ',
    nameEn: 'Soft rose',
    colors: { background: '#FBF4F3', surface: '#FFFFFF', text: '#3A2428', mutedText: '#7C6266', primary: '#B4636F', primaryText: '#FFFFFF', accent: '#E8B9BE', border: '#EFDDDD' },
    fonts: { heading: 'el-messiri', body: 'tajawal' },
  },
  {
    key: 'sage',
    nameAr: 'أخضر طبيعي',
    nameEn: 'Sage',
    colors: { background: '#F3F5F0', surface: '#FFFFFF', text: '#1F2A22', mutedText: '#5E6B61', primary: '#4F6B57', primaryText: '#FFFFFF', accent: '#A7B9A0', border: '#DCE3D8' },
    fonts: { heading: 'noto-naskh', body: 'almarai' },
  },
  {
    key: 'olive-cream',
    nameAr: 'كريمي وزيتوني',
    nameEn: 'Cream & olive',
    colors: { background: '#F6F0E1', surface: '#FFFCF4', text: '#2B2A1E', mutedText: '#6A6550', primary: '#6B6B2F', primaryText: '#FFFFFF', accent: '#B9B07A', border: '#E5DCC3' },
    fonts: { heading: 'cormorant', body: 'ibm-plex-arabic' },
  },
  {
    key: 'plum',
    nameAr: 'بنفسجي ملكي',
    nameEn: 'Royal plum',
    colors: { background: '#17121C', surface: '#221B29', text: '#F4EFF7', mutedText: '#B5A7C0', primary: '#C4A2D6', primaryText: '#1A1420', accent: '#9472A8', border: '#352A40' },
    fonts: { heading: 'el-messiri', body: 'cairo' },
  },
  {
    key: 'bold-coral',
    nameAr: 'مرجاني جريء',
    nameEn: 'Bold coral',
    colors: { background: '#FFFFFF', surface: '#FFF6F2', text: '#1D1B1A', mutedText: '#605956', primary: '#C8483B', primaryText: '#FFFFFF', accent: '#F2A38F', border: '#F0DED7' },
    fonts: { heading: 'cairo', body: 'cairo' },
  },
];

const CHARACTER_TO_PALETTE: Record<string, string> = {
  luxurious: 'noir',
  classic: 'pearl',
  warm: 'rose',
  natural: 'sage',
  minimal: 'pearl',
  bold: 'bold-coral',
  playful: 'rose',
  modern: 'plum',
};

// ── color math (WCAG contrast, hue distance for excluded colors) ──
export function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lum([r, g, b]: [number, number, number]) {
  const f = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function contrast(a: string, b: string): number {
  const [x, y] = [lum(hexToRgb(a)), lum(hexToRgb(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
function hue(hex: string): { h: number; s: number; l: number } {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}
export function colorsSimilar(a: string, b: string): boolean {
  const x = hue(a);
  const y = hue(b);
  if (x.s < 0.15 && y.s < 0.15) return Math.abs(x.l - y.l) < 0.12;
  const dh = Math.min(Math.abs(x.h - y.h), 360 - Math.abs(x.h - y.h));
  return dh < 22 && Math.abs(x.l - y.l) < 0.3 && x.s > 0.15 && y.s > 0.15;
}

/** Readability warnings for a brand (used by builder + AI patch validation). */
export function brandContrastIssues(c: Brand['colors']): string[] {
  const out: string[] = [];
  if (contrast(c.text, c.background) < 4.5) out.push('text_on_background');
  if (contrast(c.text, c.surface) < 4.5) out.push('text_on_surface');
  if (contrast(c.primaryText, c.primary) < 4.5) out.push('button_text');
  if (contrast(c.mutedText, c.background) < 3) out.push('muted_text');
  return out;
}

export function choosePalette(character: string[], excluded: string[]): Palette {
  const order = [...character.map((c) => CHARACTER_TO_PALETTE[c]).filter(Boolean), ...PALETTES.map((p) => p.key)];
  for (const key of order) {
    const p = PALETTES.find((x) => x.key === key)!;
    const clash = excluded.some((ex) => [p.colors.primary, p.colors.accent, p.colors.background].some((c) => colorsSimilar(c, ex)));
    if (!clash) return p;
  }
  return PALETTES[0];
}

/** Build a palette around an owner-provided primary color, keeping contrast. */
export function paletteFromPrimary(primary: string, dark: boolean): Brand['colors'] {
  const base = dark ? PALETTES[1].colors : PALETTES[0].colors;
  const primaryText = contrast('#FFFFFF', primary) >= contrast('#111111', primary) ? '#FFFFFF' : '#111111';
  return { ...base, primary, primaryText, accent: primary };
}

export interface OnboardingAnswers {
  businessName: string;
  businessType: string;
  character?: string[];
  colors?: { primary?: string | null; useSuggested?: string | null; excluded?: string[]; acceptedLogoPalette?: Brand['colors'] | null };
  fonts?: { heading?: FontKey; body?: FontKey };
  priorities?: string[]; // booking | portfolio | products
  wordmark?: string;
  logoAssetId?: string | null;
  coverAssetId?: string | null;
  tagline?: string;
  hasProducts?: boolean;
}

const page = (kind: StorePage['kind'], slug: string, ar: string, en: string, blocks: PageBlock[], showInNav = true, showInFooter = false): StorePage => ({
  id: `p-${kind}-${slug}`.slice(0, 40),
  kind,
  slug,
  title: { ar, en },
  showInNav,
  showInFooter,
  blocks,
});

export function generateDraft(a: OnboardingAnswers): StorefrontDocument {
  const character = a.character ?? [];
  const pal = choosePalette(character, a.colors?.excluded ?? []);
  let colors = pal.colors;
  if (a.colors?.acceptedLogoPalette) colors = a.colors.acceptedLogoPalette;
  else if (a.colors?.useSuggested) colors = PALETTES.find((p) => p.key === a.colors!.useSuggested)?.colors ?? colors;
  else if (a.colors?.primary && /^#[0-9a-fA-F]{6}$/.test(a.colors.primary)) {
    colors = paletteFromPrimary(a.colors.primary, contrast('#000000', pal.colors.background) < 5);
  }
  const minimal = character.includes('minimal');
  const bold = character.includes('bold') || character.includes('playful');
  const brand: Brand = {
    colors,
    fonts: { heading: a.fonts?.heading ?? pal.fonts.heading, body: a.fonts?.body ?? pal.fonts.body },
    radius: minimal ? 'sm' : bold ? 'lg' : 'md',
    buttonStyle: minimal ? 'outline' : 'solid',
    cardStyle: minimal ? 'flat' : character.includes('luxurious') ? 'bordered' : 'elevated',
    density: minimal ? 'airy' : 'comfortable',
    logoAssetId: a.logoAssetId ?? null,
    wordmark: (a.wordmark || a.businessName).slice(0, 60),
  };
  const appearance: Appearance = {
    navStyle: a.businessType === 'expert' ? 'pill' : 'simple',
    serviceDisplay: minimal ? 'list' : 'cards',
    productDisplay: 'grid',
    showPoweredBy: true,
  };

  const prio = a.priorities?.length ? a.priorities : ['booking', 'portfolio', 'products'];
  const sections: Record<string, PageBlock[]> = {
    booking: [newBlock('service_list', { heading: { ar: 'خدماتنا', en: 'Our services' } })],
    portfolio: [newBlock('gallery', { heading: { ar: 'من أعمالنا', en: 'Our work' } })],
    products: a.hasProducts === false ? [] : [newBlock('product_grid', { heading: { ar: 'منتجات مختارة', en: 'Featured products' } })],
  };
  const home: PageBlock[] = [
    newBlock(
      'hero',
      {
        title: { ar: a.businessName, en: a.businessName },
        subtitle: { ar: a.tagline ?? '' },
        imageAssetId: a.coverAssetId ?? null,
        ctaLabel: { ar: 'احجزي موعدكِ', en: 'Book now' },
      },
      { type: 'start_booking' },
    ),
    newBlock('intro', { heading: { ar: 'من نحن', en: 'About us' } }),
    ...prio.flatMap((p) => sections[p] ?? []),
    newBlock('team', { heading: { ar: 'فريقنا', en: 'Our team' } }),
    newBlock('reviews', { heading: { ar: 'آراء عميلاتنا', en: 'Reviews' } }),
    newBlock('hours', { heading: { ar: 'ساعات العمل', en: 'Opening hours' } }),
    newBlock('contact', { heading: { ar: 'تواصلي معنا', en: 'Contact' } }),
    newBlock('footer', {}),
  ];
  return {
    schemaVersion: SCHEMA_VERSION,
    brand,
    appearance,
    layout: {
      pages: [
        page('home', 'home', 'الرئيسية', 'Home', home),
        page('about', 'about', 'من نحن', 'About', [newBlock('intro', {}), newBlock('team', {}), newBlock('map', {})]),
        page('faq', 'faq', 'الأسئلة الشائعة', 'FAQ', [newBlock('faq', { heading: { ar: 'الأسئلة الشائعة', en: 'FAQ' } })], false, true),
        page('policies', 'policies', 'السياسات', 'Policies', [newBlock('policies', { heading: { ar: 'سياسة الحجز والخصوصية', en: 'Booking & privacy policy' } })], false, true),
        page('contact', 'contact', 'تواصل', 'Contact', [newBlock('contact', {}), newBlock('hours', {}), newBlock('social', {}), newBlock('map', {})]),
      ],
    },
  };
}
