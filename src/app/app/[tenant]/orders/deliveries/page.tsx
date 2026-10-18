import { DeliveryBoard } from '@/components/dashboard/OrdersView';
import { can, pageT, requireTenant } from '@/server/http/page';

export default async function DeliveriesPage({ params }: { params: Promise<{ tenant: string }> }) {
  const ctx = await requireTenant((await params).tenant);
  const { t } = await pageT(ctx.user);
  if (!can(ctx, 'orders.manage')) return <div className="alert warn" role="alert">{t('common.permission_denied')}</div>;
  return <DeliveryBoard tenant={ctx.tenant.slug} tz={ctx.tenant.timezone} />;
}
