import { TeamPage } from '@/components/storefront/Pages';
import { publicCtx } from '@/server/storefront/render';

export default async function Team({ params }: { params: Promise<{ slug: string }> }) {
  return <TeamPage ctx={await publicCtx((await params).slug)} />;
}
