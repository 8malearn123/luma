import { notFound } from 'next/navigation';
import { ServicePage } from '@/components/storefront/Pages';
import { publicCtx } from '@/server/storefront/render';

export default async function Service({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const ctx = await publicCtx(slug);
  const el = ServicePage({ ctx, id });
  if (!el) notFound();
  return el;
}
