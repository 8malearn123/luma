import { CustomersList } from '@/components/dashboard/CustomersList';
import { can, pageT, requireTenant } from '@/server/http/page';

export default async function CustomersPage({ params }: { params: Promise<{ tenant: string }> }) {
  const ctx = await requireTenant((await params).tenant);
  const { t } = await pageT(ctx.user);
  if (!can(ctx, 'customers.view')) return <div className="alert warn" role="alert">{t('common.permission_denied')}</div>;
  return <CustomersList tenant={ctx.tenant.slug} tz={ctx.tenant.timezone} />;
}
