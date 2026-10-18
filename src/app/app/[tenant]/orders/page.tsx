import { OrdersList } from '@/components/dashboard/OrdersView';
import { can, pageT, requireTenant } from '@/server/http/page';

export default async function OrdersPage({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<{ status?: string }> }) {
  const ctx = await requireTenant((await params).tenant);
  const { t } = await pageT(ctx.user);
  if (!can(ctx, 'orders.manage', 'finance.view')) return <div className="alert warn" role="alert">{t('common.permission_denied')}</div>;
  const st = (await searchParams).status;
  return <OrdersList tenant={ctx.tenant.slug} tz={ctx.tenant.timezone} initialStatus={st && /^[a-z_]+$/.test(st) ? st : ''} />;
}
