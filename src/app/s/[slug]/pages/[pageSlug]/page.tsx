import { notFound } from 'next/navigation';
import { InfoPage } from '@/components/storefront/Pages';
import { publicCtx } from '@/server/storefront/render';

export default async function CustomPage({ params }: { params: Promise<{ slug: string; pageSlug: string }> }) {
  const { slug, pageSlug } = await params;
  const el = InfoPage({ ctx: await publicCtx(slug), kind: 'custom', slug: pageSlug });
  if (!el) notFound();
  return el;
}
