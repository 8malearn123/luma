import { randomUUID } from 'node:crypto';
import sharp, { type Metadata } from 'sharp';
import type { Tx } from '../db';
import { AppError, notFound } from '../errors';
import { storage } from '../storage';
import { hmacHex, safeEqual } from '../crypto';
import type { TenantContext } from '../tenancy/context';
import { audit } from '../audit';

/**
 * Image pipeline: size/type limits → content sniffing (sharp decodes the real
 * bytes; extension and declared MIME are ignored) → auto-orient → strip
 * metadata → re-encode to WebP at fixed widths. Nothing user-uploaded is ever
 * served in its original form or executed.
 */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp', 'gif', 'heif', 'avif']);
export const VARIANT_WIDTHS = { w320: 320, w640: 640, w1280: 1280, w1920: 1920 } as const;
export type Variant = keyof typeof VARIANT_WIDTHS;
const PURPOSES = ['general', 'logo', 'cover', 'service', 'product', 'staff', 'gallery', 'evidence'] as const;
export type AssetPurpose = (typeof PURPOSES)[number];
export const isPurpose = (p: string): p is AssetPurpose => (PURPOSES as readonly string[]).includes(p);

/** Private purposes are never served via public signed URLs. */
const PRIVATE_PURPOSES = new Set<AssetPurpose>(['evidence']);

export async function processImageUpload(tx: Tx, ctx: TenantContext, file: { bytes: Buffer; altAr?: string; altEn?: string; purpose: AssetPurpose }) {
  if (file.bytes.length === 0) throw new AppError('validation', 'errors.upload_empty');
  if (file.bytes.length > MAX_UPLOAD_BYTES) throw new AppError('validation', 'errors.upload_too_large');
  let meta: Metadata;
  try {
    meta = await sharp(file.bytes, { limitInputPixels: 40_000_000 }).metadata();
  } catch {
    throw new AppError('validation', 'errors.upload_not_image');
  }
  if (!meta.format || !ALLOWED_FORMATS.has(meta.format) || !meta.width || !meta.height) throw new AppError('validation', 'errors.upload_not_image');
  if (meta.width < 64 || meta.height < 64) throw new AppError('validation', 'errors.upload_too_small');

  const id = randomUUID();
  const prefix = `${ctx.tenant.id}/${id}`;
  const variants: Record<string, string> = {};
  const base = sharp(file.bytes, { limitInputPixels: 40_000_000, animated: false }).rotate();
  for (const [name, width] of Object.entries(VARIANT_WIDTHS)) {
    if (width > meta.width && name !== 'w320') continue; // never upscale (always keep the smallest)
    const out = await base.clone().resize({ width, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    const key = `${prefix}/${name}.webp`;
    await storage().put(key, out, 'image/webp');
    variants[name] = key;
  }
  const dims = await sharp(file.bytes).rotate().metadata();
  const colors = await dominantColors(file.bytes);
  const [row] = await tx<{ id: string }[]>`
    insert into assets (id, tenant_id, kind, status, storage_key, mime_type, byte_size, width, height, alt_text, alt_text_en,
                        purpose, variants, dominant_colors, uploaded_by, finalized_at)
    values (${id}, ${ctx.tenant.id}, 'image', 'ready', ${prefix}, 'image/webp', ${file.bytes.length},
            ${dims.autoOrient?.width ?? dims.width ?? null}, ${dims.autoOrient?.height ?? dims.height ?? null},
            ${file.altAr ?? null}, ${file.altEn ?? null}, ${file.purpose}, ${tx.json(variants as never)}, ${colors},
            ${ctx.user.userId}, now())
    returning id`;
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: 'asset.uploaded', targetType: 'asset', targetId: id, requestId: ctx.requestId, metadata: { purpose: file.purpose } });
  return { id: row.id, width: dims.width, height: dims.height, dominantColors: colors };
}

/** Coarse palette extraction (5 distinct dominant colors), deterministic. */
export async function dominantColors(bytes: Buffer): Promise<string[]> {
  const { data, info } = await sharp(bytes).rotate().resize(48, 48, { fit: 'inside' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < info.width * info.height; i++) {
    const r = data[i * 3];
    const g = data[i * 3 + 1];
    const b = data[i * 3 + 2];
    const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const e = buckets.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++;
    e.r += r;
    e.g += g;
    e.b += b;
    buckets.set(k, e);
  }
  const sorted = [...buckets.values()].sort((a, b) => b.n - a.n).map((e) => [Math.round(e.r / e.n), Math.round(e.g / e.n), Math.round(e.b / e.n)] as const);
  const out: (readonly [number, number, number])[] = [];
  for (const c of sorted) {
    if (out.every((o) => Math.abs(o[0] - c[0]) + Math.abs(o[1] - c[1]) + Math.abs(o[2] - c[2]) > 60)) out.push(c);
    if (out.length === 5) break;
  }
  return out.map(([r, g, b]) => `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase());
}

export async function updateAssetAlt(tx: Tx, ctx: TenantContext, id: string, altAr: string, altEn?: string) {
  const r = await tx`update assets set alt_text = ${altAr}, alt_text_en = ${altEn ?? null} where id = ${id} and status = 'ready' returning id`;
  if (!r.length) throw notFound('asset');
}

export async function deleteAsset(tx: Tx, ctx: TenantContext, id: string) {
  const [a] = await tx<{ storageKey: string }[]>`update assets set status = 'deleted', deleted_at = now() where id = ${id} and status <> 'deleted' returning storage_key`;
  if (!a) throw notFound('asset');
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: 'asset.deleted', targetType: 'asset', targetId: id, requestId: ctx.requestId });
}

// ── signed URLs ──
const DAY = 86400;

/** Signed media URL valid until the end of the day after next (stable within a day for caching). */
export function signedMediaUrl(assetId: string, variant: Variant = 'w1280'): string {
  const exp = (Math.floor(Date.now() / 1000 / DAY) + 2) * DAY;
  const sig = hmacHex(`media|${assetId}|${variant}|${exp}`).slice(0, 32);
  return `/media/${assetId}/${variant}?e=${exp}&s=${sig}`;
}

export function verifyMediaSignature(assetId: string, variant: string, exp: string | null, sig: string | null): boolean {
  if (!exp || !sig || !/^\d{9,12}$/.test(exp) || !/^[a-f0-9]{32}$/.test(sig)) return false;
  if (Number(exp) * 1000 < Date.now()) return false;
  const expect = hmacHex(`media|${assetId}|${variant}|${exp}`).slice(0, 32);
  return safeEqual(Buffer.from(expect), Buffer.from(sig));
}

export const isPrivatePurpose = (p: string) => PRIVATE_PURPOSES.has(p as AssetPurpose);
