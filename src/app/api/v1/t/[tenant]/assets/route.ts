import { api } from '@/server/http/handler';
import { AppError } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { isPurpose, MAX_UPLOAD_BYTES, processImageUpload, signedMediaUrl } from '@/server/services/assets';

const CAPS_BY_PURPOSE = {
  evidence: ['incidents.submit'],
  staff: ['staff.manage', 'staff.self_profile'],
} as const;

/** Multipart upload: file, purpose, altAr, altEn. Re-encoded server-side; original bytes are never stored. */
export const POST = api.tenant(
  ['storefront.edit', 'catalog.manage', 'staff.manage', 'staff.self_profile', 'tenant.settings.manage', 'incidents.submit'],
  async (c) => {
    const len = Number(c.req.headers.get('content-length') ?? 0);
    if (len > MAX_UPLOAD_BYTES + 64 * 1024) throw new AppError('validation', 'errors.upload_too_large');
    const form = await c.req.formData().catch(() => null);
    const file = form?.get('file');
    const purpose = String(form?.get('purpose') ?? 'general');
    if (!form || !(file instanceof File)) throw new AppError('validation', 'errors.upload_empty');
    if (!isPurpose(purpose)) throw new AppError('validation', 'errors.validation');
    const need = (CAPS_BY_PURPOSE as Record<string, readonly string[]>)[purpose] ?? ['storefront.edit', 'catalog.manage', 'tenant.settings.manage'];
    if (!need.some((cap) => c.t.caps.has(cap as never))) throw new AppError('forbidden', 'errors.forbidden');
    const altAr = String(form.get('altAr') ?? '').slice(0, 300);
    const altEn = String(form.get('altEn') ?? '').slice(0, 300) || undefined;
    const bytes = Buffer.from(await file.arrayBuffer());
    const r = await tx(c.t, (db) => processImageUpload(db, c.t, { bytes, altAr, altEn, purpose }));
    return { ...r, url: signedMediaUrl(r.id, 'w640') };
  },
  { rateLimit: [60, 3600] },
);
