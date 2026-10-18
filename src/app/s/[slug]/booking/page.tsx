import { notFound } from 'next/navigation';
import { BookingFlow } from '@/components/booking/BookingFlow';
import { publicBookingCatalog, publicTenant, runPublic } from '@/server/booking/customer';
import { sessionUser } from '@/server/http/page';
import { AppError } from '@/server/errors';

export const dynamic = 'force-dynamic';

export default async function BookingPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ service?: string; staff?: string; resume?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  let tenant;
  try {
    tenant = await publicTenant(slug);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const user = await sessionUser();
  const cat = await runPublic(tenant, user?.userId ?? null, (tx) => publicBookingCatalog(tx));
  const uuid = /^[0-9a-f-]{36}$/i;
  return (
    <BookingFlow
      catalog={{ tenant: { slug: tenant.slug, name: tenant.name, timezone: tenant.timezone, currency: tenant.currency }, ...cat }}
      signedIn={!!user}
      preselect={{ serviceId: sp.service && uuid.test(sp.service) ? sp.service : undefined, staffId: sp.staff && uuid.test(sp.staff) ? sp.staff : undefined, resume: sp.resume === '1' }}
    />
  );
}
