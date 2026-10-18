import { notFound } from 'next/navigation';
import { CartView } from '@/components/booking/CartView';
import { tenantBySlug } from '@/server/tenancy/context';

export const dynamic = 'force-dynamic';

export default async function CartPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await tenantBySlug(slug);
  if (!t || t.status !== 'active') notFound();
  return <CartView slug={slug} />;
}
