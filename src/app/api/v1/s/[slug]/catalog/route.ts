import { api } from '@/server/http/handler';
import { publicBookingCatalog, publicTenant, runPublic } from '@/server/booking/customer';

/** Public booking catalog: only allowlisted fields (no costs, commissions or private notes). */
export const GET = api.public<{ slug: string }>(async (c) => {
  const t = await publicTenant(c.params.slug);
  const cat = await runPublic(t, null, (tx) => publicBookingCatalog(tx));
  return { tenant: { slug: t.slug, name: t.name, timezone: t.timezone, currency: t.currency }, ...cat };
});
