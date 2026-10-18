import type { Metadata } from 'next';
import '../storefront.css';
import { StoreFrame } from '@/components/storefront/Frame';
import { publicCtx, storefrontPath } from '@/server/storefront/render';
import { loadPublicStorefront } from '@/server/storefront/public';
import { L } from '@/components/storefront/types';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await loadPublicStorefront(slug);
  if (!data) return { title: 'LUMA', robots: { index: false } };
  const desc = L(data.tenant.defaultLocale, data.profile.tagline, data.profile.taglineEn) || undefined;
  return { title: { default: data.tenant.name, template: `%s · ${data.tenant.name}` }, description: desc };
}

/** Published storefront only. Drafts are reachable solely through /preview/<token>. */
export default async function StorefrontLayout({ children, params }: { children: React.ReactNode; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await publicCtx(slug);
  return (
    <StoreFrame ctx={ctx} currentPath={await storefrontPath(ctx.data.tenant.slug)}>
      {children}
    </StoreFrame>
  );
}
