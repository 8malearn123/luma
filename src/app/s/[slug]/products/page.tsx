import { notFound } from 'next/navigation';
import { ProductsPage } from '@/components/storefront/Pages';
import { publicCtx } from '@/server/storefront/render';

export default async function Products({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ category?: string }> }) {
  const ctx = await publicCtx((await params).slug);
  const { category } = await searchParams;
  const el = ProductsPage({ ctx, categoryId: category && /^[0-9a-f-]{36}$/.test(category) ? category : null });
  if (!el) notFound();
  return el;
}
