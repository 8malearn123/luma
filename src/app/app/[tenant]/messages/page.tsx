import { MessagesView } from '@/components/dashboard/MessagesView';
import { can, pageT, requireTenant } from '@/server/http/page';

export default async function MessagesPage({ params }: { params: Promise<{ tenant: string }> }) {
  const ctx = await requireTenant((await params).tenant);
  const { t } = await pageT(ctx.user);
  if (!can(ctx, 'tenant.settings.manage')) return <div className="alert warn" role="alert">{t('common.permission_denied')}</div>;
  return <MessagesView tenant={ctx.tenant.slug} tz={ctx.tenant.timezone} />;
}
