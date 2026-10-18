import { IntegrationsView } from '@/components/dashboard/IntegrationsView';
import { can, pageT, requireTenant } from '@/server/http/page';

export default async function IntegrationsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const ctx = await requireTenant((await params).tenant);
  const { t } = await pageT(ctx.user);
  if (!can(ctx, 'tenant.settings.manage', 'payments.configure')) return <div className="alert warn" role="alert">{t('common.permission_denied')}</div>;
  return <IntegrationsView tenant={ctx.tenant.slug} tz={ctx.tenant.timezone} />;
}
