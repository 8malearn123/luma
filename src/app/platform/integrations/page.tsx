import { notFound } from 'next/navigation';
import { canPlatform, pageT, requirePlatform } from '@/server/http/page';
import { integrationsStatus } from '@/server/platform/service';

export const dynamic = 'force-dynamic';
const BADGE: Record<string, string> = { live: 'green', sandbox: 'blue', mock: 'amber', disconnected: 'red' };

export default async function IntegrationsPage() {
  const p = await requirePlatform();
  if (!canPlatform(p, 'platform.integrations.view')) notFound();
  const { t } = await pageT(p.user);
  const s = await integrationsStatus(p);
  return (
    <>
      <div className="page-head"><h1>{t('platform.nav.integrations')}</h1><span className="badge">{s.deployment}</span></div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>{t('platform.col.feature')}</th><th>{t('platform.col.state')}</th><th>{t('common.details')}</th></tr></thead>
          <tbody>
            {s.items.map((i) => (
              <tr key={i.key}><td>{t(`platform.integration.${i.key}`)}</td><td><span className={`badge ${BADGE[i.state]}`}>{t(`platform.state.${i.state}`)}</span></td><td className="small mono">{i.detail}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid cols-2" style={{ marginTop: 14 }}>
        <div className="card stat"><div className="k">{t('platform.jobs_failed')}</div><div className="v ltr-num">{(s.jobs as Record<string, number>).failed}</div></div>
        <div className="card stat"><div className="k">{t('platform.jobs_queued')}</div><div className="v ltr-num">{(s.jobs as Record<string, number>).queued}</div></div>
      </div>
    </>
  );
}
