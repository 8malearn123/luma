import { SettingsView } from '@/components/dashboard/SettingsView';
import { can, pageT, requireTenant } from '@/server/http/page';
import { PERMISSIONS } from '@/server/tenancy/capabilities';

export default async function SettingsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const ctx = await requireTenant((await params).tenant);
  const { t } = await pageT(ctx.user);
  if (!can(ctx, 'tenant.settings.manage', 'team.manage', 'subscription.view', 'subscription.manage', 'payments.configure')) {
    return <div className="alert warn" role="alert">{t('common.permission_denied')}</div>;
  }
  // only the capabilities the current user could hand out are offered
  const delegable = Object.fromEntries(
    PERMISSIONS.filter((p) => p.delegableTo.length && (ctx.role === 'owner' || ctx.caps.has(p.key))).map((p) => [p.key, [...p.delegableTo]]),
  );
  return <SettingsView tenant={ctx.tenant.slug} caps={[...ctx.caps]} delegable={delegable} tz={ctx.tenant.timezone} />;
}
