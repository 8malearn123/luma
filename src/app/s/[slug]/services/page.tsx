import { ServicesPage } from '@/components/storefront/Pages';
import { publicCtx } from '@/server/storefront/render';

export default async function Services({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ category?: string }> }) {
  const ctx = await publicCtx((await params).slug);
  const { category } = await searchParams;
  return <ServicesPage ctx={ctx} categoryId={category && /^[0-9a-f-]{36}$/.test(category) ? category : null} />;
}
