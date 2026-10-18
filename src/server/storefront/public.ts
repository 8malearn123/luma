import { cache } from 'react';
import { withTenant, type Tx } from '../db';
import { signedMediaUrl } from '../services/assets';
import { entitlements, featureEnabled } from '../tenancy/plan';
import { tenantBySlug, tenantById, type TenantInfo } from '../tenancy/context';
import { collectRefs, migrateDocument, type StorefrontDocument } from '@/lib/builder/schema';
import { sanitizeDocument } from './drafts';
import { resolvePreviewToken } from './publish';
import type { StorefrontData } from '@/components/storefront/types';

/**
 * Public storefront data. Visitors only ever get the PUBLISHED snapshot.
 * Drafts are returned only for a valid preview token (or `draft: true` from
 * an already-authorized builder page). All catalog columns are allowlisted.
 */
export async function buildStorefrontData(tx: Tx, t: TenantInfo, doc: StorefrontDocument, opts: { preview: boolean; versionId: string | null; includeHidden?: boolean }): Promise<StorefrontData> {
  doc = sanitizeDocument(migrateDocument(structuredClone(doc)));
  const hidden = opts.includeHidden ?? false;
  const [profile] = await tx<Record<string, unknown>[]>`
    select tagline, tagline_en, intro, intro_en, contact_phone, contact_email, whatsapp, address, socials, logo_asset_id, cover_asset_id, wordmark_text
    from tenant_profiles limit 1`;
  const branches = await tx<{ id: string; name: string; city: string | null; address: string | null; phone: string | null; latitude: string | null; longitude: string | null; isPrimary: boolean }[]>`
    select id, name, city, address, phone, latitude, longitude, is_primary from branches where status = 'active' order by is_primary desc, name`;
  const hours = await tx<{ branchId: string; weekday: number; s: string; e: string }[]>`
    select branch_id, weekday, to_char(start_time,'HH24:MI') as s, to_char(end_time,'HH24:MI') as e from working_hours where staff_id is null order by weekday, start_time`;
  const [policy] = await tx<StorefrontData['policy'][]>`
    select policy_text, policy_text_en, cancellation_window_hours, deposit_mode, deposit_value, allow_on_site, no_show_grace_min from booking_policies limit 1`;
  const categories = await tx<StorefrontData['catalog']['categories']>`
    select id, kind, name, name_en from categories where status = 'active' or ${hidden} order by sort, name`;
  const services = await tx<(Omit<StorefrontData['catalog']['services'][number], 'imageUrl' | 'staffIds'> & { imageAssetId: string | null; staffIds: string[] })[]>`
    select s.id, s.name, s.name_en, s.description, s.description_en, s.price_minor, s.price_is_from, s.duration_min, s.category_id, s.image_asset_id,
      coalesce((select array_agg(ss.staff_id) from service_staff ss join staff_profiles sp on sp.id = ss.staff_id
                where ss.service_id = s.id and sp.status = 'active' and sp.public_visible), '{}') as staff_ids
    from services s left join categories c on c.id = s.category_id
    where s.status = 'active' and s.group_capacity is null
      and (${hidden} or (s.is_visible and (c.id is null or c.status = 'active')))
    order by s.sort, s.name limit 300`;
  const staff = await tx<(Omit<StorefrontData['catalog']['staff'][number], 'photoUrl'> & { photoAssetId: string | null })[]>`
    select id, display_name, display_name_en, specialty, bio, photo_asset_id from staff_profiles
    where status = 'active' and (public_visible or ${hidden}) order by sort, display_name`;
  const ent = await entitlements(tx, t.id);
  const productsEnabled = featureEnabled(ent, 'products.enabled');
  const products = productsEnabled
    ? await tx<{ id: string; name: string; nameEn: string | null; description: string | null; descriptionEn: string | null; priceMinor: number; categoryId: string | null; imageAssetId: string | null; available: string | null; hideOos: boolean }[]>`
        select p.id, p.name, p.name_en, p.description, p.description_en, p.price_minor, p.category_id, p.hide_when_out_of_stock as hide_oos,
          (select asset_id from product_images pi where pi.product_id = p.id order by sort limit 1) as image_asset_id,
          (select sum(on_hand - reserved) from inventory_items i where i.product_id = p.id and i.status = 'active') as available
        from products p left join categories c on c.id = p.category_id
        where p.status = 'active' and (${hidden} or (p.is_visible and (c.id is null or c.status = 'active')))
        order by p.sort, p.name limit 300`
    : [];
  const variants = products.length
    ? await tx<{ id: string; productId: string; name: string; nameEn: string | null; priceMinor: number | null }[]>`
        select id, product_id, name, name_en, price_minor from product_variants where status = 'active' and product_id = any(${products.map((p) => p.id)}::uuid[])`
    : [];
  const packages = await tx<{ id: string; name: string; nameEn: string | null; description: string | null; priceMinor: number; items: { serviceId: string; name: string; quantity: number }[] }[]>`
    select p.id, p.name, p.name_en, p.description, p.price_minor,
      coalesce(json_agg(json_build_object('serviceId', i.service_id, 'name', s.name, 'quantity', i.quantity) order by i.sort) filter (where i.service_id is not null), '[]') as items
    from packages p left join package_items i on i.package_id = p.id left join services s on s.id = i.service_id
    where p.status = 'active' group by p.id order by p.created_at`;
  const reviews = await tx<{ rating: number; comment: string | null; displayName: string; createdAt: Date; staffName: string | null }[]>`
    select r.rating, r.comment, r.display_name, r.created_at, sp.display_name as staff_name
    from reviews r left join staff_profiles sp on sp.id = r.staff_id where r.status = 'published' order by r.created_at desc limit 30`;
  const [agg] = await tx<{ avg: string | null; n: number }[]>`select avg(rating)::numeric(3,2) as avg, count(*)::int as n from reviews where status = 'published'`;

  // signed URLs for every image the page might show
  const assetIds = new Set<string>(collectRefs(doc).assets);
  const p = profile ?? {};
  for (const id of [p.logoAssetId, p.coverAssetId, ...services.map((s) => s.imageAssetId), ...staff.map((s) => s.photoAssetId), ...products.map((x) => x.imageAssetId)]) if (typeof id === 'string') assetIds.add(id);
  const assetRows = assetIds.size
    ? await tx<{ id: string; altText: string | null; altTextEn: string | null }[]>`select id, alt_text, alt_text_en from assets where id = any(${[...assetIds]}::uuid[]) and status = 'ready' and purpose <> 'evidence'`
    : [];
  const assets: StorefrontData['assets'] = {};
  for (const a of assetRows) assets[a.id] = { w640: signedMediaUrl(a.id, 'w640'), w1280: signedMediaUrl(a.id, 'w1280'), alt: a.altText, altEn: a.altTextEn };
  const url = (id: unknown) => (typeof id === 'string' && assets[id] ? assets[id].w640 : null);

  return {
    tenant: { id: t.id, slug: t.slug, name: t.name, businessType: t.businessType, timezone: t.timezone, defaultLocale: t.defaultLocale, currency: t.currency },
    doc,
    profile: {
      tagline: (p.tagline as string) ?? null,
      taglineEn: (p.taglineEn as string) ?? null,
      intro: (p.intro as string) ?? null,
      introEn: (p.introEn as string) ?? null,
      contactPhone: (p.contactPhone as string) ?? null,
      contactEmail: (p.contactEmail as string) ?? null,
      whatsapp: (p.whatsapp as string) ?? null,
      address: (p.address as string) ?? null,
      socials: (p.socials as Record<string, string>) ?? {},
      logoUrl: url(p.logoAssetId),
      coverUrl: url(p.coverAssetId),
      wordmark: (p.wordmarkText as string) ?? null,
    },
    branches: branches.map((b) => ({
      ...b,
      latitude: b.latitude === null ? null : Number(b.latitude),
      longitude: b.longitude === null ? null : Number(b.longitude),
      hours: hours.filter((h) => h.branchId === b.id).map((h) => ({ weekday: h.weekday, start: h.s, end: h.e })),
    })),
    policy: policy ?? { policyText: null, policyTextEn: null, cancellationWindowHours: 24, depositMode: 'none', depositValue: 0, allowOnSite: true, noShowGraceMin: 15 },
    catalog: {
      services: services.map(({ imageAssetId, ...s }) => ({ ...s, imageUrl: url(imageAssetId) })),
      categories,
      staff: staff.map(({ photoAssetId, ...s }) => ({ ...s, photoUrl: url(photoAssetId) })),
      products: products
        .filter((x) => !(x.hideOos && Number(x.available ?? 0) <= 0) || hidden)
        .map((x) => ({
          id: x.id,
          name: x.name,
          nameEn: x.nameEn,
          description: x.description,
          descriptionEn: x.descriptionEn,
          priceMinor: x.priceMinor,
          categoryId: x.categoryId,
          imageUrl: url(x.imageAssetId),
          inStock: Number(x.available ?? 0) > 0,
          variants: variants.filter((v) => v.productId === x.id).map((v) => ({ id: v.id, name: v.name, nameEn: v.nameEn, priceMinor: v.priceMinor ?? x.priceMinor })),
        })),
      packages,
      reviews: reviews.map((r) => ({ ...r, createdAt: new Date(r.createdAt).toISOString() })),
      rating: { average: agg?.avg ? Number(agg.avg) : null, count: agg?.n ?? 0 },
    },
    assets,
    preview: opts.preview,
    versionId: opts.versionId,
    productsEnabled,
  };
}

/** Published storefront by slug (null when not found or never published). Cached per request. */
export const loadPublicStorefront = cache(async (slug: string, opts: { previewToken?: string } = {}): Promise<StorefrontData | null> => {
  if (opts.previewToken) {
    const tenantId = await resolvePreviewToken(opts.previewToken);
    if (!tenantId) return null;
    const t = await tenantById(tenantId);
    if (!t || (slug && t.slug !== slug)) return null;
    return withTenant({ tenantId: t.id }, async (tx) => {
      const [d] = await tx<{ document: StorefrontDocument }[]>`select document from storefront_drafts`;
      if (!d) return null;
      return buildStorefrontData(tx, t, d.document, { preview: true, versionId: null });
    });
  }
  const t = await tenantBySlug(slug);
  if (!t || t.status === 'suspended' || !t.publishedVersionId) return null;
  return withTenant({ tenantId: t.id }, async (tx) => {
    const [v] = await tx<{ document: StorefrontDocument; id: string }[]>`select id, document from page_versions where id = ${t.publishedVersionId}`;
    if (!v) return null;
    return buildStorefrontData(tx, t, v.document, { preview: false, versionId: v.id });
  });
});

/** Draft data for the builder canvas (already-authorized caller; includes hidden items for pickers). */
export async function loadDraftForBuilder(tx: Tx, t: TenantInfo, doc: StorefrontDocument) {
  return buildStorefrontData(tx, t, doc, { preview: true, versionId: null, includeHidden: false });
}
