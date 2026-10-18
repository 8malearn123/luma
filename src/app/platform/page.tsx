import Link from 'next/link';
import { canPlatform, pageT, requirePlatform } from '@/server/http/page';
import { platformOverview } from '@/server/platform/service';

export const dynamic = 'force-dynamic';

export default async function PlatformHome() {
  const p = await requirePlatform();
  const { t } = await pageT(p.user);
  if (!canPlatform(p, 'platform.tenants.view')) {
    return <div className="card"><h1>{t('platform.title')}</h1><p className="muted">{t(`platform.role.${p.role}`)}</p></div>;
  }
  const o = await platformOverview(p);
  const tiles: [string, number, string][] = [
    ['platform.active_tenants', o.activeTenants as number, '/platform/tenants?status=active'],
    ['platform.onboarding_tenants', o.onboardingTenants as number, '/platform/tenants?status=onboarding'],
    ['platform.suspended_tenants', o.suspendedTenants as number, '/platform/tenants?status=suspended'],
    ['platform.review_queue', o.reviewQueue as number, '/platform/policies'],
    ['platform.open_appeals', o.openPlatformAppeals as number, '/platform/policies?tab=appeals'],
    ['platform.active_grants', o.activeSupportGrants as number, '/platform/support-access'],
  ];
  return (
    <>
      <div className="page-head"><h1>{t('platform.nav.overview')}</h1></div>
      <div className="alert info">{t('platform.mfa_gap')}</div>
      <div className="grid cols-3">
        {tiles.map(([k, v, href]) => (
          <Link key={k} href={href} className="card stat" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="k">{t(k)}</div>
            <div className="v ltr-num">{v}</div>
          </Link>
        ))}
      </div>
    </>
  );
}
