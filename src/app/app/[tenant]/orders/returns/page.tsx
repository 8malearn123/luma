import { ReturnsQueue } from '@/components/dashboard/OrdersView';
import { can, pageT, requireTenant } from '@/server/http/page';

export default async function ReturnsPage({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<{ n?: string }> }) {
  const ctx = await requireTenant((await params).tenant);
  const { t } = await pageT(ctx.user);
  if (!can(ctx, 'orders.manage', 'refunds.issue')) return <div className="alert warn" role="alert">{t('common.permission_denied')}</div>;
  const n = (await searchParams).n;
  return <ReturnsQueue tenant={ctx.tenant.slug} tz={ctx.tenant.timezone} caps={[...ctx.caps]} initialNumber={n && /^RET-\d{6,}$/.test(n) ? n : undefined} />;
}
