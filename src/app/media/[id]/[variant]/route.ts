import { NextResponse, type NextRequest } from 'next/server';
import { withSystem } from '@/server/db';
import { storage } from '@/server/storage';
import { isPrivatePurpose, verifyMediaSignature, VARIANT_WIDTHS, type Variant } from '@/server/services/assets';
import { sessionUser } from '@/server/http/page';
import { tenantById, resolveTenantContext } from '@/server/tenancy/context';

/**
 * Media delivery. Access requires EITHER a valid signed URL (issued by the
 * server when rendering a published storefront / authorized page) for a
 * non-private asset, OR an authenticated member of the asset's tenant.
 * Unknown, deleted and unauthorized assets are indistinguishable (404).
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; variant: string }> }) {
  const { id, variant } = await params;
  const nf = () => new NextResponse('Not found', { status: 404 });
  if (!/^[0-9a-f-]{36}$/.test(id) || !(variant in VARIANT_WIDTHS)) return nf();
  const [a] = await withSystem('media lookup by opaque id', (tx) => tx<{ tenantId: string; purpose: string; variants: Record<string, string>; status: string }[]>`
    select tenant_id, purpose, variants, status from assets where id = ${id}`);
  if (!a || a.status !== 'ready') return nf();
  let allowed = !isPrivatePurpose(a.purpose) && verifyMediaSignature(id, variant, req.nextUrl.searchParams.get('e'), req.nextUrl.searchParams.get('s'));
  let privateCache = false;
  if (!allowed) {
    const user = await sessionUser();
    const t = user ? await tenantById(a.tenantId) : null;
    if (user && t) {
      try {
        const ctx = await resolveTenantContext(user, t.slug, 'media', null);
        allowed = !isPrivatePurpose(a.purpose) || ctx.caps.has('incidents.submit') || ctx.caps.has('incidents.review');
        privateCache = true;
      } catch {
        allowed = false;
      }
    }
  }
  if (!allowed) return nf();
  const order = Object.keys(VARIANT_WIDTHS) as Variant[];
  const want = order.indexOf(variant as Variant);
  const key = [...order.slice(0, want + 1).reverse(), ...order.slice(want + 1)].map((v) => a.variants[v]).find(Boolean);
  const data = key ? await storage().get(key) : null;
  if (!data) return nf();
  return new NextResponse(new Uint8Array(data), {
    headers: {
      'content-type': 'image/webp',
      'cache-control': privateCache ? 'private, max-age=300' : 'public, max-age=86400, immutable',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'",
    },
  });
}
