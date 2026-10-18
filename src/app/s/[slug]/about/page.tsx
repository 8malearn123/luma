import { InfoPage } from '@/components/storefront/Pages';
import { publicCtx } from '@/server/storefront/render';

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  return <InfoPage ctx={await publicCtx((await params).slug)} kind="about" />;
}
