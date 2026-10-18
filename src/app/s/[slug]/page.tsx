import { HomePage } from '@/components/storefront/Pages';
import { publicCtx } from '@/server/storefront/render';

export default async function StoreHome({ params }: { params: Promise<{ slug: string }> }) {
  return <HomePage ctx={await publicCtx((await params).slug)} />;
}
