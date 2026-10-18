import { notFound } from 'next/navigation';
import { StaffPage } from '@/components/storefront/Pages';
import { publicCtx } from '@/server/storefront/render';

export default async function Staff({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const el = StaffPage({ ctx: await publicCtx(slug), id });
  if (!el) notFound();
  return el;
}
