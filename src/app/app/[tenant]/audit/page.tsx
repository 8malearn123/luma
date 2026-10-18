import { AuditView } from '@/components/dashboard/AuditView';
import { can, pageT, requireTenant } from '@/server/http/page';

export default async function AuditPage({ params }: { params: Promise<{ tenant: string }> }) {
  const ctx = await requireTenant((await params).tenant);
  const { t } = await pageT(ctx.user);
  if (!can(ctx, 'audit.view')) return <div className="alert warn" role="alert">{t('common.permission_denied')}</div>;
  return <AuditView tenant={ctx.tenant.slug} tz={ctx.tenant.timezone} />;
}
