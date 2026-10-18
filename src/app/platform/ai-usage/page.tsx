import { notFound } from 'next/navigation';
import { canPlatform, pageT, requirePlatform } from '@/server/http/page';
import { aiUsageOverview } from '@/server/platform/service';

export const dynamic = 'force-dynamic';

export default async function AiUsagePage() {
  const p = await requirePlatform();
  if (!canPlatform(p, 'platform.ai_usage.view')) notFound();
  const { t } = await pageT(p.user);
  const u = await aiUsageOverview(p);
  return (
    <>
      <div className="page-head"><h1>{t('platform.nav.ai_usage')}</h1></div>
      <div className="row" style={{ marginBottom: 12 }}>
        {u.byStatus.map((s) => <span key={s.status as string} className="badge">{s.status as string}: {s.n as number}</span>)}
      </div>
      {u.perTenant.length === 0 ? <p className="muted">{t('common.empty')}</p> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t('platform.col.business')}</th><th>{t('platform.month')}</th><th>{t('platform.col.runs')}</th><th>{t('platform.col.tokens')}</th><th>{t('platform.col.cost')}</th></tr></thead>
            <tbody>
              {u.perTenant.map((r, i) => (
                <tr key={i}>
                  <td>{r.name as string}</td>
                  <td className="mono">{String(r.period).slice(0, 7)}</td>
                  <td className="ltr-num">{r.runs as number}</td>
                  <td className="ltr-num">{String(r.tokensIn)} / {String(r.tokensOut)}</td>
                  <td>{Number(r.costMicroUsd) > 0 ? <span className="ltr-num">${(Number(r.costMicroUsd) / 1e6).toFixed(4)}</span> : <span className="muted">{t('platform.cost_unknown')}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
