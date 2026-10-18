import type { BlockType } from '@/lib/builder/schema';

/** Declarative property-editor fields per block type (keys match BLOCK_PROPS). */
export type FieldKind =
  | 'i18n'
  | 'i18nArea'
  | 'richtext'
  | 'bool'
  | 'number'
  | 'range'
  | 'select'
  | 'image'
  | 'service'
  | 'services'
  | 'product'
  | 'products'
  | 'category'
  | 'categories'
  | 'staff'
  | 'staffs'
  | 'packages'
  | 'branch'
  | 'galleryItems'
  | 'faqItems';

export interface FieldDef {
  key: string;
  kind: FieldKind;
  label: string; // i18n key
  options?: { value: string | number; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  /** category kind filter */
  catKind?: 'service' | 'product';
}

const heading: FieldDef = { key: 'heading', kind: 'i18n', label: 'builder.f.heading' };
const display = (vals: string[]): FieldDef => ({ key: 'display', kind: 'select', label: 'builder.f.display', options: vals.map((v) => ({ value: v, label: `builder.opt.${v}` })) });

export const FIELDS: Record<BlockType, FieldDef[]> = {
  hero: [
    { key: 'title', kind: 'i18n', label: 'builder.f.title' },
    { key: 'subtitle', kind: 'i18nArea', label: 'builder.f.subtitle' },
    { key: 'imageAssetId', kind: 'image', label: 'builder.f.image' },
    { key: 'imageAlt', kind: 'i18n', label: 'builder.f.alt' },
    { key: 'align', kind: 'select', label: 'builder.f.align', options: [{ value: 'center', label: 'builder.opt.center' }, { value: 'start', label: 'builder.opt.start' }] },
    { key: 'overlay', kind: 'range', label: 'builder.f.overlay', min: 0, max: 0.85, step: 0.05 },
    { key: 'ctaLabel', kind: 'i18n', label: 'builder.f.cta_label' },
  ],
  image_ad: [
    { key: 'imageAssetId', kind: 'image', label: 'builder.f.image' },
    { key: 'alt', kind: 'i18n', label: 'builder.f.alt' },
    { key: 'caption', kind: 'i18n', label: 'builder.f.caption' },
    { key: 'aspect', kind: 'select', label: 'builder.f.aspect', options: ['3:1', '21:9', '16:9'].map((v) => ({ value: v, label: v })) },
  ],
  image: [
    { key: 'imageAssetId', kind: 'image', label: 'builder.f.image' },
    { key: 'alt', kind: 'i18n', label: 'builder.f.alt' },
    { key: 'aspect', kind: 'select', label: 'builder.f.aspect', options: ['4:3', '1:1', '3:4', '16:9'].map((v) => ({ value: v, label: v })) },
  ],
  text: [heading, { key: 'html', kind: 'richtext', label: 'builder.f.text' }],
  cta: [heading, { key: 'text', kind: 'i18nArea', label: 'builder.f.text' }, { key: 'label', kind: 'i18n', label: 'builder.f.cta_label' }],
  service_list: [
    heading,
    { key: 'categoryId', kind: 'category', label: 'builder.f.category', catKind: 'service' },
    { key: 'serviceIds', kind: 'services', label: 'builder.f.services_pick' },
    display(['inherit', 'list', 'cards']),
    { key: 'limit', kind: 'number', label: 'builder.f.limit', min: 1, max: 50 },
    { key: 'showPrices', kind: 'bool', label: 'builder.f.show_prices' },
  ],
  service: [{ key: 'serviceId', kind: 'service', label: 'builder.f.service' }],
  categories: [
    heading,
    { key: 'kind', kind: 'select', label: 'builder.f.kind', options: [{ value: 'service', label: 'builder.opt.services' }, { value: 'product', label: 'builder.opt.products' }] },
    { key: 'categoryIds', kind: 'categories', label: 'builder.f.categories_pick' },
  ],
  product_grid: [
    heading,
    { key: 'categoryId', kind: 'category', label: 'builder.f.category', catKind: 'product' },
    { key: 'productIds', kind: 'products', label: 'builder.f.products_pick' },
    display(['inherit', 'grid', 'list']),
    { key: 'limit', kind: 'number', label: 'builder.f.limit', min: 1, max: 50 },
  ],
  product: [{ key: 'productId', kind: 'product', label: 'builder.f.product' }],
  team: [heading, { key: 'staffIds', kind: 'staffs', label: 'builder.f.staff_pick' }, { key: 'showBio', kind: 'bool', label: 'builder.f.show_bio' }],
  staff: [{ key: 'staffId', kind: 'staff', label: 'builder.f.staff' }],
  gallery: [
    heading,
    { key: 'items', kind: 'galleryItems', label: 'builder.f.images' },
    { key: 'layout', kind: 'select', label: 'builder.f.layout', options: [{ value: 'grid', label: 'builder.opt.grid' }, { value: 'carousel', label: 'builder.opt.carousel' }] },
    { key: 'lightbox', kind: 'bool', label: 'builder.f.lightbox' },
  ],
  offers: [heading, { key: 'packageIds', kind: 'packages', label: 'builder.f.packages_pick' }],
  reviews: [heading, { key: 'limit', kind: 'number', label: 'builder.f.limit', min: 1, max: 30 }, { key: 'minRating', kind: 'number', label: 'builder.f.min_rating', min: 1, max: 5 }],
  intro: [heading, { key: 'useProfileIntro', kind: 'bool', label: 'builder.f.use_profile_intro' }],
  map: [heading, { key: 'branchId', kind: 'branch', label: 'builder.f.branch' }],
  hours: [heading, { key: 'branchId', kind: 'branch', label: 'builder.f.branch' }],
  contact: [
    heading,
    { key: 'showPhone', kind: 'bool', label: 'builder.f.show_phone' },
    { key: 'showWhatsapp', kind: 'bool', label: 'builder.f.show_whatsapp' },
    { key: 'showEmail', kind: 'bool', label: 'builder.f.show_email' },
    { key: 'showAddress', kind: 'bool', label: 'builder.f.show_address' },
  ],
  social: [heading],
  faq: [heading, { key: 'items', kind: 'faqItems', label: 'builder.f.faq_items' }],
  policies: [
    heading,
    { key: 'showBookingPolicy', kind: 'bool', label: 'builder.f.show_booking_policy' },
    { key: 'showReturns', kind: 'bool', label: 'builder.f.show_returns' },
    { key: 'returnsText', kind: 'i18nArea', label: 'builder.f.returns_text' },
    { key: 'privacyText', kind: 'i18nArea', label: 'builder.f.privacy_text' },
  ],
  welcome: [
    { key: 'message', kind: 'i18n', label: 'builder.f.message' },
    { key: 'tone', kind: 'select', label: 'builder.f.tone', options: [{ value: 'accent', label: 'builder.opt.accent' }, { value: 'neutral', label: 'builder.opt.neutral' }] },
  ],
  columns: [{ key: 'columns', kind: 'select', label: 'builder.f.columns', options: [{ value: 2, label: '2' }, { value: 3, label: '3' }] }],
  footer: [{ key: 'note', kind: 'i18n', label: 'builder.f.footer_note' }, { key: 'showSocial', kind: 'bool', label: 'builder.f.show_social' }],
};
