import { Suspense } from 'react';
import { BookingsBoard } from '@/components/dashboard/BookingsBoard';
import { can, pageT, requireTenant } from '@/server/http/page';
import { tx } from '@/server/tenancy/context';

export const dynamic = 'force-dynamic';

export default async function BookingsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const ctx = await requireTenant(tenant);
  const { t, locale } = await pageT(ctx.user);
  if (!can(ctx, 'bookings.manage', 'bookings.view_assigned', 'bookings.view_financial')) {
    return <div className="alert warn" role="alert">{t('common.permission_denied')}</div>;
  }
  const { branches, services, staff } = await tx(ctx, async (db) => ({
    branches: await db<{ id: string; name: string }[]>`select id, name from branches where status = 'active' order by is_primary desc, name`,
    services: await db<{ id: string; name: string }[]>`select id, case when ${locale} = 'en' then coalesce(name_en, name) else name end as name
                     from services where status = 'active' and group_capacity is null order by sort, name`,
    staff: await db<{ id: string; name: string }[]>`select id, display_name as name from staff_profiles where status = 'active' order by sort, display_name`,
  }));
  return (
    <Suspense>
      <BookingsBoard tenant={ctx.tenant.slug} tz={ctx.tenant.timezone} caps={[...ctx.caps]} branches={branches} services={services} staff={staff} myStaffId={ctx.staffProfileId} />
    </Suspense>
  );
}
