import { FinanceView } from '@/components/dashboard/FinanceView';
import { can, pageT, requireTenant } from '@/server/http/page';

export default async function FinancePage({ params }: { params: Promise<{ tenant: string }> }) {
  const ctx = await requireTenant((await params).tenant);
  const { t } = await pageT(ctx.user);
  if (!can(ctx, 'finance.view', 'refunds.issue', 'expenses.manage', 'finance.export', 'payments.collect')) return <div className="alert warn" role="alert">{t('common.permission_denied')}</div>;
  return <FinanceView tenant={ctx.tenant.slug} tz={ctx.tenant.timezone} caps={[...ctx.caps]} />;
}
