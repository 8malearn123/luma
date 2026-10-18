import type { StorefrontDocument } from '@/lib/builder/schema';
import type { Locale } from '@/lib/format';

/**
 * Data a storefront renderer may see. Built server-side from ALLOWLISTED
 * columns only: no costs, commissions, private notes, customer data or
 * stock quantities (only in/out of stock).
 */
export interface PublicService {
  id: string;
  name: string;
  nameEn: string | null;
  description: string | null;
  descriptionEn: string | null;
  priceMinor: number;
  priceIsFrom: boolean;
  durationMin: number;
  categoryId: string | null;
  imageUrl: string | null;
  staffIds: string[];
}
export interface PublicCategory {
  id: string;
  kind: 'service' | 'product';
  name: string;
  nameEn: string | null;
}
export interface PublicStaff {
  id: string;
  displayName: string;
  displayNameEn: string | null;
  specialty: string | null;
  bio: string | null;
  photoUrl: string | null;
}
export interface PublicProduct {
  id: string;
  name: string;
  nameEn: string | null;
  description: string | null;
  descriptionEn: string | null;
  priceMinor: number;
  categoryId: string | null;
  imageUrl: string | null;
  inStock: boolean;
  variants: { id: string; name: string; nameEn: string | null; priceMinor: number }[];
}
export interface PublicPackage {
  id: string;
  name: string;
  nameEn: string | null;
  description: string | null;
  priceMinor: number;
  items: { serviceId: string; name: string; quantity: number }[];
}
export interface PublicReview {
  rating: number;
  comment: string | null;
  displayName: string;
  createdAt: string;
  staffName: string | null;
}
export interface PublicBranch {
  id: string;
  name: string;
  city: string | null;
  address: string | null;
  phone: string | null;
  latitude: number | null;
  longitude: number | null;
  isPrimary: boolean;
  hours: { weekday: number; start: string; end: string }[];
}
export interface PublicProfile {
  tagline: string | null;
  taglineEn: string | null;
  intro: string | null;
  introEn: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  whatsapp: string | null;
  address: string | null;
  socials: Record<string, string>;
  logoUrl: string | null;
  coverUrl: string | null;
  wordmark: string | null;
}
export interface PublicPolicy {
  policyText: string | null;
  policyTextEn: string | null;
  cancellationWindowHours: number;
  depositMode: string;
  depositValue: number;
  allowOnSite: boolean;
  noShowGraceMin: number;
}

export interface StorefrontData {
  tenant: { id: string; slug: string; name: string; businessType: string; timezone: string; defaultLocale: Locale; currency: string };
  doc: StorefrontDocument;
  profile: PublicProfile;
  branches: PublicBranch[];
  policy: PublicPolicy;
  catalog: {
    services: PublicService[];
    categories: PublicCategory[];
    staff: PublicStaff[];
    products: PublicProduct[];
    packages: PublicPackage[];
    reviews: PublicReview[];
    rating: { average: number | null; count: number };
  };
  /** asset id → signed URLs */
  assets: Record<string, { w640: string; w1280: string; alt: string | null; altEn: string | null }>;
  preview: boolean;
  versionId: string | null;
  productsEnabled: boolean;
}

export interface RenderCtx {
  data: StorefrontData;
  locale: Locale;
  base: string; // e.g. /s/noura  (or /preview/<token>)
  /** true inside the builder canvas: links are inert */
  editing?: boolean;
}

export const L = (locale: Locale, ar: string | null | undefined, en: string | null | undefined) => (locale === 'en' && en ? en : ar ?? en ?? '');
export const LT = (locale: Locale, t: { ar?: string; en?: string } | undefined | null) => (t ? L(locale, t.ar, t.en) : '');
