import { notFound } from 'next/navigation';
import { CheckoutView } from '@/components/booking/CheckoutView';
import { tenantBySlug } from '@/server/tenancy/context';
import { requireUser } from '@/server/http/page';

export const dynamic = 'force-dynamic';

export default async function CheckoutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const t = await tenantBySlug(slug);
  if (!t || t.status !== 'active') notFound();
  await requireUser(); // redirects to sign-in and back; the cart is adopted on return
  return <CheckoutView slug={slug} timezone={t.timezone} />;
}
