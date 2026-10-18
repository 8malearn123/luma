import { notFound } from 'next/navigation';
import { ProductPage } from '@/components/storefront/Pages';
import { publicCtx } from '@/server/storefront/render';

export default async function Product({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const el = ProductPage({ ctx: await publicCtx(slug), id });
  if (!el) notFound();
  return el;
}
