import { notFound } from 'next/navigation';
import { CustomerDetail } from '@/components/dashboard/CustomerDetail';
import { can, pageT, requireTenant } from '@/server/http/page';

export default async function CustomerPage({ params }: { params: Promise<{ tenant: string; id: string }> }) {
  const { tenant, id } = await params;
  const ctx = await requireTenant(tenant);
  const { t } = await pageT(ctx.user);
  if (!can(ctx, 'customers.view')) return <div className="alert warn" role="alert">{t('common.permission_denied')}</div>;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  return <CustomerDetail tenant={ctx.tenant.slug} id={id} tz={ctx.tenant.timezone} canNotes={ctx.caps.has('customers.notes')} />;
}
