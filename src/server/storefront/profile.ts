import { z } from 'zod';
import type { Tx } from '../db';
import { audit } from '../audit';
import type { TenantContext } from '../tenancy/context';

/** Social networks a storefront may link to. Values are handles or https URLs on that network only. */
export const SOCIAL_NETWORKS: Record<string, { hosts: string[]; base: string }> = {
  instagram: { hosts: ['instagram.com', 'www.instagram.com'], base: 'https://instagram.com/' },
  tiktok: { hosts: ['tiktok.com', 'www.tiktok.com'], base: 'https://www.tiktok.com/@' },
  snapchat: { hosts: ['snapchat.com', 'www.snapchat.com'], base: 'https://www.snapchat.com/add/' },
  x: { hosts: ['x.com', 'twitter.com', 'www.x.com', 'www.twitter.com'], base: 'https://x.com/' },
  whatsapp: { hosts: ['wa.me'], base: 'https://wa.me/' },
};

/** Normalize a handle/URL to a safe https URL on the network, or null. */
export function socialUrl(network: string, value: string): string | null {
  const n = SOCIAL_NETWORKS[network];
  if (!n || !value) return null;
  const v = value.trim();
  if (/^https:\/\//i.test(v)) {
    try {
      const u = new URL(v);
      return n.hosts.includes(u.hostname.toLowerCase()) && !u.username && !u.password ? u.toString() : null;
    } catch {
      return null;
    }
  }
  if (network === 'whatsapp') {
    let d = v.replace(/[\s+-]/g, '');
    if (/^05\d{8}$/.test(d)) d = `966${d.slice(1)}`;
    return /^\d{8,15}$/.test(d) ? `${n.base}${d}` : null;
  }
  const h = v.replace(/^@/, '');
  return /^[A-Za-z0-9._]{1,40}$/.test(h) ? `${n.base}${h}` : null;
}

const text = (max: number) => z.string().trim().max(max).nullable().optional();
export const profileInput = z.object({
  tagline: text(160),
  taglineEn: text(160),
  intro: text(4000),
  introEn: text(4000),
  contactPhone: z.string().trim().regex(/^[+0-9\s-]{7,20}$/, 'errors.phone_invalid').nullable().optional().or(z.literal('')),
  contactEmail: z.string().trim().email('errors.email_invalid').nullable().optional().or(z.literal('')),
  whatsapp: z.string().trim().regex(/^[+0-9\s-]{7,20}$/, 'errors.phone_invalid').nullable().optional().or(z.literal('')),
  address: text(300),
  socials: z.record(z.string(), z.string().max(200)).optional(),
  logoAssetId: z.string().uuid().nullable().optional(),
  coverAssetId: z.string().uuid().nullable().optional(),
  wordmarkText: text(60),
});

export async function getProfile(tx: Tx) {
  const [p] = await tx`select tagline, tagline_en, intro, intro_en, contact_phone, contact_email, whatsapp, address, socials,
                         logo_asset_id, cover_asset_id, wordmark_text, updated_at from tenant_profiles limit 1`;
  return p ?? null;
}

export async function updateProfile(tx: Tx, ctx: TenantContext, input: z.infer<typeof profileInput>) {
  const socials: Record<string, string> = {};
  const rejected: string[] = [];
  for (const [k, v] of Object.entries(input.socials ?? {})) {
    if (!v.trim()) continue;
    if (socialUrl(k, v)) socials[k] = v.trim();
    else rejected.push(k);
  }
  if (rejected.length) {
    const { AppError } = await import('../errors');
    throw new AppError('validation', 'errors.validation', { fieldErrors: Object.fromEntries(rejected.map((k) => [`socials.${k}`, ['builder.social_invalid']])) });
  }
  const has = (k: keyof typeof input) => Object.prototype.hasOwnProperty.call(input, k);
  const cur = (await getProfile(tx)) ?? {};
  const val = <T>(k: keyof typeof input, current: T) => (has(k) ? ((input[k] === '' ? null : input[k]) as T) : current);
  await tx`update tenant_profiles set
    tagline = ${val('tagline', cur.tagline ?? null)}, tagline_en = ${val('taglineEn', cur.taglineEn ?? null)},
    intro = ${val('intro', cur.intro ?? null)}, intro_en = ${val('introEn', cur.introEn ?? null)},
    contact_phone = ${val('contactPhone', cur.contactPhone ?? null)}, contact_email = ${val('contactEmail', cur.contactEmail ?? null)},
    whatsapp = ${val('whatsapp', cur.whatsapp ?? null)}, address = ${val('address', cur.address ?? null)},
    socials = ${tx.json((has('socials') ? socials : (cur.socials ?? {})) as never)},
    logo_asset_id = ${val('logoAssetId', cur.logoAssetId ?? null)}, cover_asset_id = ${val('coverAssetId', cur.coverAssetId ?? null)},
    wordmark_text = ${val('wordmarkText', cur.wordmarkText ?? null)}, updated_at = now()`;
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: 'storefront.profile_updated', requestId: ctx.requestId });
  return getProfile(tx);
}
