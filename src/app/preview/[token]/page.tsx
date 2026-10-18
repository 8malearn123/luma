import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import '../../s/storefront.css';
import { StoreFrame } from '@/components/storefront/Frame';
import { resolvePath } from '@/components/storefront/Pages';
import { loadPublicStorefront } from '@/server/storefront/public';
import { storefrontLocale } from '@/server/storefront/render';
import { translate } from '@/lib/i18n';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Private draft preview. Requires a valid, unexpired, unrevoked token; never
 * indexed (X-Robots-Tag via next.config + meta) and never counted as a
 * marketing visit (no analytics beacons are rendered here).
 */
export default async function Preview({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ path?: string }> }) {
  const { token } = await params;
  const { path = '/' } = await searchParams;
  const data = await loadPublicStorefront('', { previewToken: token });
  if (!data) notFound();
  const locale = await storefrontLocale(data);
  const ctx = { data, locale, base: `/preview/${token}` };
  const [p, q = ''] = path.startsWith('/') ? path.split('?') : ['/'];
  const el = resolvePath(ctx, p, new URLSearchParams(q));
  if (!el) notFound();
  return (
    <StoreFrame ctx={ctx} currentPath={p} previewBanner={translate(locale, 'sf.preview_banner')}>
      {el}
    </StoreFrame>
  );
}
