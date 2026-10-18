import { notFound } from 'next/navigation';
import { formatMoney } from '@/lib/format';
import { canPlatform, pageT, requirePlatform } from '@/server/http/page';
import { revenueOverview } from '@/server/platform/service';

export const dynamic = 'force-dynamic';

export default async function ReportsPage() {
  const p = await requirePlatform();
  if (!canPlatform(p, 'platform.revenue.view')) notFound();
  const { t, locale } = await pageT(p.user);
  const r = await revenueOverview(p);
  const s = r.subscriptions as Record<string, number>;
  return (
    <>
      <div className="page-head"><h1>{t('platform.nav.reports')}</h1></div>
      <div className="alert info">{t('platform.revenue_hint')}</div>
      <div className="grid cols-4">
        {(['trialing', 'active', 'past_due', 'paused'] as const).map((k) => (
          <div key={k} className="card stat"><div className="k">{t(`sub.${k}`)}</div><div className="v ltr-num">{s[k === 'past_due' ? 'pastDue' : k]}</div></div>
        ))}
      </div>
      <section className="card">
        {r.byMonth.length === 0 ? <p className="muted">{t('common.empty')}</p> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('platform.month')}</th><th>{t('platform.paid')}</th><th>{t('platform.open')}</th><th>{t('platform.invoices')}</th><th /></tr></thead>
              <tbody>
                {r.byMonth.map((m, i) => (
                  <tr key={i}>
                    <td className="mono">{String(m.month).slice(0, 7)}</td>
                    <td>{formatMoney(Number(m.paidMinor), 'SAR', locale)}</td>
                    <td>{formatMoney(Number(m.openMinor), 'SAR', locale)}</td>
                    <td className="ltr-num">{m.invoices as number}</td>
                    <td>{m.isTest ? <span className="badge amber">{t('common.test_data')}</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
