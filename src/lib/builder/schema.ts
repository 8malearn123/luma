import { z } from 'zod';

/**
 * Storefront document — the single source of truth for a storefront's design.
 *
 *   brand      theme tokens (colors, fonts, radius, button/card style, density, logo)
 *   appearance component display variants (nav style, service/product display)
 *   layout     pages → blocks
 *
 * Blocks store IDs (service/product/staff/category/package/asset), never copied
 * prices or names: the renderer reads live catalog data. No block can carry
 * executable code; rich text is sanitized; URLs are protocol-allowlisted.
 */
export const SCHEMA_VERSION = 1;

export const LIMITS = {
  pages: 15,
  blocksPerPage: 60,
  childrenPerContainer: 6,
  depth: 2,
  galleryItems: 40,
  faqItems: 30,
  listIds: 50,
  textLength: 6000,
} as const;

const id = z.string().regex(/^[a-z0-9-]{6,40}$/i, 'invalid id');
const uuid = z.string().uuid();
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'errors.color_invalid');
const shortText = (max = 160) => z.string().max(max);

/** Localized text: Arabic required where text is shown, English optional. */
export const i18nText = (max = 160) => z.object({ ar: shortText(max).default(''), en: shortText(max).optional() });
export type I18nText = z.infer<ReturnType<typeof i18nText>>;

// ── safe URLs ──
const SAFE_PROTOCOLS = ['https:', 'mailto:', 'tel:'];
export function isSafeUrl(u: string): boolean {
  try {
    const url = new URL(u);
    if (!SAFE_PROTOCOLS.includes(url.protocol)) return false;
    if (url.protocol === 'https:' && (!url.hostname || url.username || url.password)) return false;
    return true;
  } catch {
    return false;
  }
}
export const safeUrl = z.string().max(500).refine(isSafeUrl, 'errors.url_unsafe');

// ── fonts: only supported, loadable families ──
export const FONTS = {
  'ibm-plex-arabic': { family: "'IBM Plex Sans Arabic'", google: 'IBM+Plex+Sans+Arabic:wght@300;400;500;600;700', label: 'IBM Plex Sans Arabic' },
  cairo: { family: "'Cairo'", google: 'Cairo:wght@300;400;600;700', label: 'Cairo' },
  tajawal: { family: "'Tajawal'", google: 'Tajawal:wght@300;400;500;700', label: 'Tajawal' },
  almarai: { family: "'Almarai'", google: 'Almarai:wght@300;400;700', label: 'Almarai' },
  'el-messiri': { family: "'El Messiri'", google: 'El+Messiri:wght@400;500;600;700', label: 'El Messiri' },
  'noto-naskh': { family: "'Noto Naskh Arabic'", google: 'Noto+Naskh+Arabic:wght@400;500;600;700', label: 'Noto Naskh Arabic' },
  'bodoni-moda': { family: "'Bodoni Moda'", google: 'Bodoni+Moda:opsz,wght@6..96,400..700', label: 'Bodoni Moda' },
  cormorant: { family: "'Cormorant Garamond'", google: 'Cormorant+Garamond:wght@400;500;600', label: 'Cormorant Garamond' },
} as const;
export type FontKey = keyof typeof FONTS;
const fontKey = z.enum(Object.keys(FONTS) as [FontKey, ...FontKey[]]);

export const brandSchema = z.object({
  colors: z.object({
    background: color,
    surface: color,
    text: color,
    mutedText: color,
    primary: color,
    primaryText: color,
    accent: color,
    border: color,
  }),
  fonts: z.object({ heading: fontKey, body: fontKey }),
  radius: z.enum(['none', 'sm', 'md', 'lg', 'pill']),
  buttonStyle: z.enum(['solid', 'outline', 'soft']),
  cardStyle: z.enum(['flat', 'bordered', 'elevated']),
  density: z.enum(['compact', 'comfortable', 'airy']),
  logoAssetId: uuid.nullable().default(null),
  wordmark: shortText(60).default(''),
});
export type Brand = z.infer<typeof brandSchema>;

export const appearanceSchema = z.object({
  navStyle: z.enum(['simple', 'pill', 'bottom']),
  serviceDisplay: z.enum(['list', 'cards']),
  productDisplay: z.enum(['grid', 'list']),
  showPoweredBy: z.boolean().default(true),
});
export type Appearance = z.infer<typeof appearanceSchema>;

// ── actions ──
export const ACTION_TYPES = ['start_booking', 'service', 'product', 'category', 'staff', 'page', 'section', 'external'] as const;
export const actionSchema = z
  .object({
    type: z.enum(ACTION_TYPES),
    targetId: z.string().max(60).optional(),
    url: safeUrl.optional(),
  })
  .superRefine((a, ctx) => {
    const needsUuid = ['service', 'product', 'category', 'staff'].includes(a.type);
    if (needsUuid && !uuid.safeParse(a.targetId).success) ctx.addIssue({ code: 'custom', message: 'errors.action_target_required', path: ['targetId'] });
    if (a.type === 'start_booking' && a.targetId && !uuid.safeParse(a.targetId).success) ctx.addIssue({ code: 'custom', message: 'errors.action_target_invalid', path: ['targetId'] });
    if ((a.type === 'page' || a.type === 'section') && !id.safeParse(a.targetId).success) ctx.addIssue({ code: 'custom', message: 'errors.action_target_required', path: ['targetId'] });
    if (a.type === 'external' && !a.url) ctx.addIssue({ code: 'custom', message: 'errors.url_unsafe', path: ['url'] });
    if (a.type !== 'external' && a.url) ctx.addIssue({ code: 'custom', message: 'errors.url_unexpected', path: ['url'] });
  });
export type BlockAction = z.infer<typeof actionSchema>;

const assetRef = uuid.nullable().default(null);
const display = z.enum(['inherit', 'list', 'cards', 'grid']).default('inherit');
const idList = z.array(uuid).max(LIMITS.listIds).default([]);

// ── block registry (props schemas) ──
export const BLOCK_PROPS = {
  hero: z.object({
    title: i18nText(120),
    subtitle: i18nText(240).default({ ar: '' }),
    imageAssetId: assetRef,
    imageAlt: i18nText(160).default({ ar: '' }),
    align: z.enum(['start', 'center']).default('center'),
    overlay: z.number().min(0).max(0.85).default(0.35),
    ctaLabel: i18nText(40).default({ ar: '' }),
  }),
  image_ad: z.object({ imageAssetId: assetRef, alt: i18nText(160), caption: i18nText(160).default({ ar: '' }), aspect: z.enum(['21:9', '16:9', '3:1']).default('3:1') }),
  image: z.object({ imageAssetId: assetRef, alt: i18nText(160), aspect: z.enum(['1:1', '4:3', '3:4', '16:9']).default('4:3') }),
  text: z.object({ heading: i18nText(120).default({ ar: '' }), html: z.object({ ar: z.string().max(LIMITS.textLength).default(''), en: z.string().max(LIMITS.textLength).optional() }) }),
  cta: z.object({ heading: i18nText(120).default({ ar: '' }), text: i18nText(300).default({ ar: '' }), label: i18nText(40) }),
  service_list: z.object({
    heading: i18nText(120).default({ ar: '' }),
    categoryId: uuid.nullable().default(null),
    serviceIds: idList,
    display,
    limit: z.number().int().min(1).max(50).default(12),
    showPrices: z.boolean().default(true),
  }),
  service: z.object({ serviceId: uuid }),
  categories: z.object({ heading: i18nText(120).default({ ar: '' }), kind: z.enum(['service', 'product']).default('service'), categoryIds: idList }),
  product_grid: z.object({
    heading: i18nText(120).default({ ar: '' }),
    categoryId: uuid.nullable().default(null),
    productIds: idList,
    display,
    limit: z.number().int().min(1).max(50).default(8),
  }),
  product: z.object({ productId: uuid }),
  team: z.object({ heading: i18nText(120).default({ ar: '' }), staffIds: idList, showBio: z.boolean().default(false) }),
  staff: z.object({ staffId: uuid }),
  gallery: z.object({
    heading: i18nText(120).default({ ar: '' }),
    items: z.array(z.object({ assetId: uuid, alt: i18nText(160) })).max(LIMITS.galleryItems).default([]),
    layout: z.enum(['grid', 'carousel']).default('grid'),
    lightbox: z.boolean().default(true),
  }),
  offers: z.object({ heading: i18nText(120).default({ ar: '' }), packageIds: idList }),
  reviews: z.object({ heading: i18nText(120).default({ ar: '' }), limit: z.number().int().min(1).max(30).default(6), minRating: z.number().int().min(1).max(5).default(1) }),
  intro: z.object({ heading: i18nText(120).default({ ar: '' }), useProfileIntro: z.boolean().default(true) }),
  map: z.object({ heading: i18nText(120).default({ ar: '' }), branchId: uuid.nullable().default(null) }),
  hours: z.object({ heading: i18nText(120).default({ ar: '' }), branchId: uuid.nullable().default(null) }),
  contact: z.object({ heading: i18nText(120).default({ ar: '' }), showPhone: z.boolean().default(true), showWhatsapp: z.boolean().default(true), showEmail: z.boolean().default(true), showAddress: z.boolean().default(true) }),
  social: z.object({ heading: i18nText(120).default({ ar: '' }) }),
  faq: z.object({ heading: i18nText(120).default({ ar: '' }), items: z.array(z.object({ q: i18nText(200), a: i18nText(1200) })).max(LIMITS.faqItems).default([]) }),
  policies: z.object({ heading: i18nText(120).default({ ar: '' }), showBookingPolicy: z.boolean().default(true), showReturns: z.boolean().default(false), returnsText: i18nText(2000).default({ ar: '' }), privacyText: i18nText(4000).default({ ar: '' }) }),
  welcome: z.object({ message: i18nText(200), tone: z.enum(['accent', 'neutral']).default('accent') }),
  columns: z.object({ columns: z.union([z.literal(2), z.literal(3)]).default(2) }),
  footer: z.object({ note: i18nText(200).default({ ar: '' }), showSocial: z.boolean().default(true) }),
} as const;

export type BlockType = keyof typeof BLOCK_PROPS;
export const BLOCK_TYPES = Object.keys(BLOCK_PROPS) as BlockType[];

export interface BlockMeta {
  category: 'media' | 'content' | 'catalog' | 'people' | 'trust' | 'info' | 'layout';
  /** Allowed to carry an action; 'required' means it must */
  action: 'none' | 'optional' | 'required';
  maxPerPage?: number;
  container?: boolean;
  /** may appear inside a container */
  childAllowed?: boolean;
  schemaVersion: number;
}

export const BLOCK_META: Record<BlockType, BlockMeta> = {
  hero: { category: 'media', action: 'optional', maxPerPage: 1, schemaVersion: 1 },
  image_ad: { category: 'media', action: 'optional', childAllowed: true, schemaVersion: 1 },
  image: { category: 'media', action: 'optional', childAllowed: true, schemaVersion: 1 },
  text: { category: 'content', action: 'none', childAllowed: true, schemaVersion: 1 },
  cta: { category: 'content', action: 'required', childAllowed: true, schemaVersion: 1 },
  service_list: { category: 'catalog', action: 'none', schemaVersion: 1 },
  service: { category: 'catalog', action: 'none', childAllowed: true, schemaVersion: 1 },
  categories: { category: 'catalog', action: 'none', schemaVersion: 1 },
  product_grid: { category: 'catalog', action: 'none', schemaVersion: 1 },
  product: { category: 'catalog', action: 'none', childAllowed: true, schemaVersion: 1 },
  team: { category: 'people', action: 'none', schemaVersion: 1 },
  staff: { category: 'people', action: 'none', childAllowed: true, schemaVersion: 1 },
  gallery: { category: 'media', action: 'none', schemaVersion: 1 },
  offers: { category: 'catalog', action: 'none', schemaVersion: 1 },
  reviews: { category: 'trust', action: 'none', maxPerPage: 1, schemaVersion: 1 },
  intro: { category: 'content', action: 'none', schemaVersion: 1 },
  map: { category: 'info', action: 'none', maxPerPage: 1, schemaVersion: 1 },
  hours: { category: 'info', action: 'none', maxPerPage: 1, schemaVersion: 1 },
  contact: { category: 'info', action: 'none', maxPerPage: 1, schemaVersion: 1 },
  social: { category: 'info', action: 'none', maxPerPage: 1, schemaVersion: 1 },
  faq: { category: 'trust', action: 'none', schemaVersion: 1 },
  policies: { category: 'trust', action: 'none', maxPerPage: 1, schemaVersion: 1 },
  welcome: { category: 'content', action: 'optional', maxPerPage: 1, schemaVersion: 1 },
  columns: { category: 'layout', action: 'none', container: true, schemaVersion: 1 },
  footer: { category: 'layout', action: 'none', maxPerPage: 1, schemaVersion: 1 },
};

/** Per-type prop migrations: (fromVersion, props) → props at fromVersion+1 */
export const BLOCK_MIGRATIONS: Partial<Record<BlockType, Record<number, (p: Record<string, unknown>) => Record<string, unknown>>>> = {};

export interface PageBlock {
  id: string;
  type: BlockType;
  schemaVersion: number;
  props: Record<string, unknown>;
  visibility: { enabled: boolean };
  action?: BlockAction;
  children?: PageBlock[];
}

const blockBase: z.ZodType<PageBlock> = z.lazy(() =>
  z.object({
    id,
    type: z.enum(BLOCK_TYPES as [BlockType, ...BlockType[]]),
    schemaVersion: z.number().int().min(1),
    props: z.record(z.string(), z.unknown()),
    visibility: z.object({ enabled: z.boolean() }),
    action: actionSchema.optional(),
    children: z.array(blockBase).max(LIMITS.childrenPerContainer).optional(),
  }),
) as z.ZodType<PageBlock>;

export const PAGE_KINDS = ['home', 'services', 'products', 'team', 'about', 'contact', 'faq', 'policies', 'custom'] as const;
export const pageSchema = z.object({
  id,
  kind: z.enum(PAGE_KINDS),
  slug: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/, 'errors.slug_invalid'),
  title: i18nText(80),
  showInNav: z.boolean().default(true),
  showInFooter: z.boolean().default(false),
  blocks: z.array(blockBase).max(LIMITS.blocksPerPage),
});
export type StorePage = z.infer<typeof pageSchema>;

export const documentSchema = z.object({
  schemaVersion: z.literal(SCHEMA_VERSION),
  brand: brandSchema,
  appearance: appearanceSchema,
  layout: z.object({ pages: z.array(pageSchema).min(1).max(LIMITS.pages) }),
});
export type StorefrontDocument = z.infer<typeof documentSchema>;

/** Slugs reserved by the storefront router (system pages). */
export const RESERVED_SLUGS = new Set(['services', 'products', 'team', 'cart', 'checkout', 'booking', 'about', 'contact', 'policies', 'pages', 'api', 'preview']);

export interface ValidationIssue {
  path: string;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Structural validation (no DB): schema, per-type props, nesting, limits,
 * actions, uniqueness. Returns a normalized document (defaults applied).
 */
export function validateDocument(raw: unknown): { ok: true; doc: StorefrontDocument; issues: ValidationIssue[] } | { ok: false; issues: ValidationIssue[] } {
  const parsed = documentSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.slice(0, 50).map((i) => ({ path: i.path.join('.'), message: i.message, severity: 'error' as const })),
    };
  }
  const doc = parsed.data;
  const issues: ValidationIssue[] = [];
  const err = (path: string, message: string) => issues.push({ path, message, severity: 'error' });

  const pageIds = new Set<string>();
  const slugs = new Set<string>();
  const homeCount = doc.layout.pages.filter((p) => p.kind === 'home').length;
  if (homeCount !== 1) err('layout.pages', 'errors.builder_one_home');
  const allBlockIds = new Set<string>();

  doc.layout.pages.forEach((page, pi) => {
    const pp = `layout.pages.${pi}`;
    if (pageIds.has(page.id)) err(`${pp}.id`, 'errors.duplicate');
    pageIds.add(page.id);
    if (page.kind !== 'home') {
      if (slugs.has(page.slug)) err(`${pp}.slug`, 'errors.slug_taken');
      slugs.add(page.slug);
      if (page.kind === 'custom' && RESERVED_SLUGS.has(page.slug)) err(`${pp}.slug`, 'errors.slug_reserved');
    }
    if (!page.title.ar.trim()) err(`${pp}.title`, 'errors.required');

    const counts = new Map<BlockType, number>();
    const visit = (b: PageBlock, path: string, depth: number, parent: PageBlock | null) => {
      if (allBlockIds.has(b.id)) err(`${path}.id`, 'errors.duplicate');
      allBlockIds.add(b.id);
      const meta = BLOCK_META[b.type];
      counts.set(b.type, (counts.get(b.type) ?? 0) + 1);
      if (depth > LIMITS.depth) err(path, 'errors.builder_too_deep');
      if (parent && !meta.childAllowed) err(path, 'errors.builder_child_not_allowed');
      if (b.children?.length && !meta.container) err(`${path}.children`, 'errors.builder_not_container');
      if (meta.container && parent) err(path, 'errors.builder_nested_container');
      if (b.schemaVersion > meta.schemaVersion) err(`${path}.schemaVersion`, 'errors.builder_schema_version');
      const props = BLOCK_PROPS[b.type].safeParse(b.props);
      if (!props.success) {
        for (const i of props.error.issues.slice(0, 5)) err(`${path}.props.${i.path.join('.')}`, i.message);
      } else {
        b.props = props.data as Record<string, unknown>;
      }
      if (meta.action === 'none' && b.action) err(`${path}.action`, 'errors.builder_action_not_allowed');
      if (meta.action === 'required' && !b.action) err(`${path}.action`, 'errors.action_target_required');
      b.children?.forEach((c, ci) => visit(c, `${path}.children.${ci}`, depth + 1, b));
    };
    page.blocks.forEach((b, bi) => visit(b, `${pp}.blocks.${bi}`, 1, null));
    for (const [type, n] of counts) {
      const max = BLOCK_META[type].maxPerPage;
      if (max && n > max) err(pp, `errors.builder_max_per_page:${type}`);
    }
  });

  // internal action targets must exist
  const walk = (blocks: PageBlock[], fn: (b: PageBlock) => void) =>
    blocks.forEach((b) => {
      fn(b);
      if (b.children) walk(b.children, fn);
    });
  doc.layout.pages.forEach((page, pi) =>
    walk(page.blocks, (b) => {
      if (b.action?.type === 'page' && !pageIds.has(b.action.targetId!)) err(`layout.pages.${pi}`, 'errors.action_page_missing');
      if (b.action?.type === 'section') {
        const onPage = new Set<string>();
        walk(page.blocks, (x) => onPage.add(x.id));
        if (!onPage.has(b.action.targetId!)) err(`layout.pages.${pi}`, 'errors.action_section_missing');
      }
    }),
  );

  if (issues.some((i) => i.severity === 'error')) return { ok: false, issues };
  return { ok: true, doc, issues };
}

/** Every catalog/asset reference in a document, for tenant-scoped existence checks. */
export interface DocRefs {
  services: Set<string>;
  products: Set<string>;
  categories: Set<string>;
  staff: Set<string>;
  packages: Set<string>;
  assets: Set<string>;
  branches: Set<string>;
}

export function collectRefs(doc: StorefrontDocument): DocRefs {
  const r: DocRefs = { services: new Set(), products: new Set(), categories: new Set(), staff: new Set(), packages: new Set(), assets: new Set(), branches: new Set() };
  if (doc.brand.logoAssetId) r.assets.add(doc.brand.logoAssetId);
  const add = (set: Set<string>, v: unknown) => typeof v === 'string' && v && set.add(v);
  const visit = (b: PageBlock) => {
    const p = b.props as Record<string, unknown>;
    add(r.assets, p.imageAssetId);
    if (b.type === 'gallery') for (const it of (p.items as { assetId: string }[]) ?? []) add(r.assets, it.assetId);
    add(r.services, p.serviceId);
    for (const s of (p.serviceIds as string[]) ?? []) add(r.services, s);
    add(r.products, p.productId);
    for (const s of (p.productIds as string[]) ?? []) add(r.products, s);
    add(r.staff, p.staffId);
    for (const s of (p.staffIds as string[]) ?? []) add(r.staff, s);
    add(r.categories, p.categoryId);
    for (const s of (p.categoryIds as string[]) ?? []) add(r.categories, s);
    for (const s of (p.packageIds as string[]) ?? []) add(r.packages, s);
    add(r.branches, p.branchId);
    const a = b.action;
    if (a?.targetId) {
      if (a.type === 'service' || (a.type === 'start_booking' && a.targetId)) add(r.services, a.targetId);
      if (a.type === 'product') add(r.products, a.targetId);
      if (a.type === 'category') add(r.categories, a.targetId);
      if (a.type === 'staff') add(r.staff, a.targetId);
    }
    b.children?.forEach(visit);
  };
  doc.layout.pages.forEach((pg) => pg.blocks.forEach(visit));
  return r;
}

let counter = 0;
export function newBlockId(): string {
  counter = (counter + 1) % 1e6;
  const rnd = Math.random().toString(36).slice(2, 8);
  return `b-${Date.now().toString(36)}${counter.toString(36)}${rnd}`.slice(0, 40);
}

export function newBlock(type: BlockType, props: Record<string, unknown> = {}, action?: BlockAction): PageBlock {
  const parsed = BLOCK_PROPS[type].safeParse(props);
  return {
    id: newBlockId(),
    type,
    schemaVersion: BLOCK_META[type].schemaVersion,
    props: (parsed.success ? parsed.data : props) as Record<string, unknown>,
    visibility: { enabled: true },
    ...(action ? { action } : {}),
    ...(BLOCK_META[type].container ? { children: [] } : {}),
  };
}

/** Apply registered per-type migrations so old drafts render with current renderers. */
export function migrateDocument(doc: StorefrontDocument): StorefrontDocument {
  const up = (b: PageBlock): PageBlock => {
    let { props, schemaVersion } = b;
    const migs = BLOCK_MIGRATIONS[b.type];
    while (migs && schemaVersion < BLOCK_META[b.type].schemaVersion && migs[schemaVersion]) {
      props = migs[schemaVersion](props);
      schemaVersion++;
    }
    return { ...b, props, schemaVersion, children: b.children?.map(up) };
  };
  return { ...doc, layout: { pages: doc.layout.pages.map((p) => ({ ...p, blocks: p.blocks.map(up) })) } };
}
