import type { NavItem } from '@/components/shell/AppShell';
import type { TenantContext } from './context';
import type { Capability } from './capabilities';
import type { Entitlements, FeatureKey } from './plan';
import { featureEnabled } from './plan';

interface Def {
  path: string;
  key: string;
  icon: NavItem['icon'];
  group: 'ops' | 'catalog' | 'growth' | 'admin';
  anyOf?: Capability[];
  feature?: FeatureKey;
  hideForExpert?: boolean;
}

const DEFS: Def[] = [
  { path: '', key: 'nav.overview', icon: 'grid', group: 'ops' },
  { path: '/bookings', key: 'nav.bookings', icon: 'calendar', group: 'ops', anyOf: ['bookings.manage', 'bookings.view_assigned', 'bookings.view_financial'] },
  { path: '/customers', key: 'nav.customers', icon: 'users', group: 'ops', anyOf: ['customers.view'] },
  { path: '/orders', key: 'nav.orders', icon: 'bag', group: 'ops', anyOf: ['orders.manage'], feature: 'products.enabled' },
  { path: '/waitlist', key: 'nav.waitlist', icon: 'clock', group: 'ops', anyOf: ['waitlist.manage'], feature: 'waitlist.enabled' },
  { path: '/services', key: 'nav.services', icon: 'scissors', group: 'catalog', anyOf: ['catalog.manage'] },
  { path: '/team', key: 'nav.team', icon: 'staff', group: 'catalog', anyOf: ['staff.manage', 'schedule.manage', 'hr.manage'] },
  { path: '/products', key: 'nav.products', icon: 'boxes', group: 'catalog', anyOf: ['catalog.manage'], feature: 'products.enabled' },
  { path: '/inventory', key: 'nav.inventory', icon: 'box', group: 'catalog', anyOf: ['inventory.manage'], hideForExpert: true },
  { path: '/builder', key: 'nav.builder', icon: 'palette', group: 'growth', anyOf: ['storefront.edit'] },
  { path: '/marketing', key: 'nav.marketing', icon: 'mega', group: 'growth', anyOf: ['marketing.view'], feature: 'marketing.enabled' },
  { path: '/analytics', key: 'nav.analytics', icon: 'chart', group: 'growth', anyOf: ['analytics.view'] },
  { path: '/loyalty', key: 'nav.loyalty', icon: 'loyalty', group: 'growth', anyOf: ['loyalty.manage'], feature: 'loyalty.enabled' },
  { path: '/gifts', key: 'nav.gifts', icon: 'gift', group: 'growth', anyOf: ['loyalty.manage'], feature: 'giftcards.enabled' },
  { path: '/memberships', key: 'nav.memberships', icon: 'ticket', group: 'growth', anyOf: ['loyalty.manage'], feature: 'memberships.enabled' },
  { path: '/finance', key: 'nav.finance', icon: 'wallet', group: 'admin', anyOf: ['finance.view', 'payments.configure'] },
  { path: '/incidents', key: 'nav.incidents', icon: 'shield', group: 'admin', anyOf: ['incidents.submit', 'incidents.review'] },
  { path: '/settings', key: 'nav.settings', icon: 'gear', group: 'admin', anyOf: ['tenant.settings.manage', 'team.manage', 'subscription.view', 'payments.configure'] },
  { path: '/audit', key: 'nav.audit', icon: 'clipboard', group: 'admin', anyOf: ['audit.view'] },
];

const GROUP_LABEL: Record<Def['group'], [string, string]> = {
  ops: ['التشغيل', 'OPERATIONS'],
  catalog: ['الكتالوج', 'CATALOG'],
  growth: ['النمو', 'GROWTH'],
  admin: ['الإدارة', 'ADMIN'],
};

export function buildNav(ctx: TenantContext, ent: Entitlements, t: (k: string) => string, locale: 'ar' | 'en'): NavItem[] {
  const base = `/app/${ctx.tenant.slug}`;
  return DEFS.filter((d) => (!d.anyOf || d.anyOf.some((c) => ctx.caps.has(c))) && (!d.feature || featureEnabled(ent, d.feature)) && !(d.hideForExpert && ctx.tenant.businessType === 'expert')).map((d) => ({
    href: base + d.path,
    label: t(d.key),
    icon: d.icon,
    group: GROUP_LABEL[d.group][locale === 'ar' ? 0 : 1],
    exact: d.path === '',
  }));
}

/** Which nav paths a context may open (pages also re-check on the server). */
export function navAllowed(ctx: TenantContext, ent: Entitlements, path: string): boolean {
  const d = DEFS.find((x) => x.path === path);
  if (!d) return true;
  return (!d.anyOf || d.anyOf.some((c) => ctx.caps.has(c))) && (!d.feature || featureEnabled(ent, d.feature));
}
