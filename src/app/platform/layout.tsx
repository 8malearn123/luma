import { AppShell, type NavItem } from '@/components/shell/AppShell';
import { pageT, requirePlatform } from '@/server/http/page';
import type { PlatformCapability } from '@/server/tenancy/capabilities';

const NAV: { path: string; key: string; icon: NavItem['icon']; cap: PlatformCapability }[] = [
  { path: '', key: 'platform.nav.overview', icon: 'grid', cap: 'platform.tenants.view' },
  { path: '/tenants', key: 'platform.nav.tenants', icon: 'globe', cap: 'platform.tenants.view' },
  { path: '/subscriptions', key: 'platform.nav.subscriptions', icon: 'ticket', cap: 'platform.tenants.view' },
  { path: '/plans', key: 'platform.nav.plans', icon: 'box', cap: 'platform.plans.manage' },
  { path: '/reports', key: 'platform.nav.reports', icon: 'chart', cap: 'platform.revenue.view' },
  { path: '/policies', key: 'platform.nav.policies', icon: 'shield', cap: 'platform.policy.review' },
  { path: '/support-access', key: 'platform.nav.support', icon: 'lock', cap: 'platform.support.access' },
  { path: '/users', key: 'platform.nav.users', icon: 'users', cap: 'platform.users.manage' },
  { path: '/templates', key: 'platform.nav.templates', icon: 'palette', cap: 'platform.templates.manage' },
  { path: '/ai-usage', key: 'platform.nav.ai_usage', icon: 'sparkle', cap: 'platform.ai_usage.view' },
  { path: '/integrations', key: 'platform.nav.integrations', icon: 'link', cap: 'platform.integrations.view' },
  { path: '/audit', key: 'platform.nav.audit', icon: 'clipboard', cap: 'platform.audit.view' },
];

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const p = await requirePlatform();
  const { t } = await pageT(p.user);
  const nav = NAV.filter((n) => p.caps.has(n.cap)).map((n) => ({ href: `/platform${n.path}`, label: t(n.key), icon: n.icon, exact: n.path === '' }));
  return (
    <AppShell title={t('platform.title')} subtitle={t(`platform.role.${p.role}`)} nav={nav} userName={p.user.displayName} homeHref="/platform">
      {children}
    </AppShell>
  );
}
