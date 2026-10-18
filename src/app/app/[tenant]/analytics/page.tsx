import Link from 'next/link';
import { can, pageT, requireTenant } from '@/server/http/page';
import { tx } from '@/server/tenancy/context';
import { storeMetrics, serviceDemand } from '@/server/analytics/metrics';
import { computeOccupancy } from '@/server/analytics/occupancy';
import { staffPerformance } from '@/server/analytics/performance';
import { addDays, utcToWall, wallToUtc } from '@/lib/tz';
import { tzLabel } from '@/lib/format';
import { EmptyState } from '@/components/ui/forms';

export const dynamic = 'force-dynamic';

const pct = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v * 1000) / 10}%`);
const DAYS = [7, 28, 90];

export default async function AnalyticsPage({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<{ days?: string }> }) {
  const { tenant } = await params;
  const ctx = await requireTenant(tenant);
  const { t, locale } = await pageT(ctx.user);
  if (!can(ctx, 'analytics.view')) {
    return <div className="alert error" role="alert">{t('common.permission_denied')}</div>;
  }
  const sp = await searchParams;
  const days = DAYS.includes(Number(sp.days)) ? Number(sp.days) : 28;
  const tz = ctx.tenant.timezone;
  const today = utcToWall(new Date(), tz).date;
  const fromDate = addDays(today, -days + 1);
  const from = wallToUtc(fromDate, '00:00', tz);
  const to = wallToUtc(addDays(today, 1), '00:00', tz);
  const data = await tx(ctx, async (db) => {
    const [b] = await db<{ id: string }[]>`select id from branches where status = 'active' order by is_primary desc limit 1`;
    return {
      metrics: await storeMetrics(db, from, to),
      demand: await serviceDemand(db, from, to),
      occupancy: b ? await computeOccupancy(db, b.id, fromDate, days) : null,
      perf: b ? await staffPerformance(db, ctx.tenant.id, b.id, addDays(today, -89), 90, wallToUtc(addDays(today, -89), '00:00', tz), to) : [],
    };
  });
  const m = data.metrics;
  const base = `/app/${tenant}/analytics`;
  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('analytics.title')}</h1>
          <div className="small muted">{tzLabel(tz, locale)} · {fromDate} → {today}</div>
        </div>
        <nav className="row" aria-label={t('analytics.period')}>
          {DAYS.map((d) => (
            <Link key={d} href={`${base}?days=${d}`} className={`btn btn-sm ${d === days ? 'btn-gold' : 'btn-quiet'}`} aria-current={d === days ? 'page' : undefined}>
              {t('analytics.days', { n: d })}
            </Link>
          ))}
        </nav>
      </div>

      <div className="grid cols-4">
        <div className="card stat"><div className="k">{t('analytics.sessions')}</div><div className="v">{m.sessions}</div><div className="note">{t('analytics.visitors')}: {m.visitors}</div></div>
        <div className="card stat"><div className="k">{t('analytics.conversion')}</div><div className="v">{pct(m.conversionRate)}</div><div className="note">{m.convertingSessions} / {m.sessions}</div></div>
        <div className="card stat"><div className="k">{t('analytics.bookings_per_session')}</div><div className="v">{m.bookingsPerSession == null ? '—' : m.bookingsPerSession.toFixed(2)}</div><div className="note">{t('analytics.unattributed')}: {m.unattributedConversions}</div></div>
        <div className="card stat"><div className="k">{t('analytics.occupancy')}</div><div className="v">{pct(data.occupancy?.total.occupancy)}</div><div className="note">{data.occupancy ? `${data.occupancy.total.bookedMin} / ${data.occupancy.total.availableMin} min` : t('analytics.unknown')}</div></div>
      </div>
      <p className="small muted" style={{ marginTop: 10 }}>{t('analytics.definitions')} {t('analytics.excluded', { internal: m.excluded.internal, bots: m.excluded.bots })}</p>

      <div className="grid cols-2" style={{ marginTop: 14 }}>
        <section className="card" aria-labelledby="src-h">
          <h2 id="src-h">{t('analytics.sources')}</h2>
          {m.sources.length ? (
            <table className="table"><tbody>{m.sources.map((s) => <tr key={s.source}><td>{s.source === 'direct/unknown' ? t('analytics.unknown') : s.source}</td><td className="mono">{s.sessions}</td></tr>)}</tbody></table>
          ) : <EmptyState title={t('common.empty')} />}
        </section>
        <section className="card" aria-labelledby="dev-h">
          <h2 id="dev-h">{t('analytics.devices')}</h2>
          {m.devices.length ? (
            <table className="table"><tbody>{m.devices.map((s) => <tr key={s.device}><td>{s.device === 'unknown' ? t('analytics.unknown') : s.device}</td><td className="mono">{s.sessions}</td></tr>)}</tbody></table>
          ) : <EmptyState title={t('common.empty')} />}
        </section>
      </div>

      <section className="card" style={{ marginTop: 14 }} aria-labelledby="dem-h">
        <h2 id="dem-h">{t('analytics.demand')}</h2>
        {data.demand.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('common.name')}</th><th>{t('analytics.col.views')}</th><th>{t('analytics.col.starts')}</th><th>{t('analytics.col.confirmed')}</th><th>{t('analytics.col.completed')}</th><th>{t('analytics.col.cancelled')}</th><th>{t('analytics.col.waitlist')}</th><th>{t('analytics.col.misses')}</th></tr></thead>
              <tbody>
                {data.demand.map((d) => (
                  <tr key={d.serviceId}><td>{d.name}</td><td className="mono">{d.views}</td><td className="mono">{d.starts}</td><td className="mono">{d.confirmed}</td><td className="mono">{d.completed}</td><td className="mono">{d.cancelled}</td><td className="mono">{d.waitlist}</td><td className="mono">{d.availabilityMisses}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title={t('common.empty')} />}
      </section>

      <section className="card" style={{ marginTop: 14 }} aria-labelledby="occ-h">
        <h2 id="occ-h">{t('analytics.occupancy')}</h2>
        <p className="small muted">{t('analytics.occupancy_def')}</p>
        {data.occupancy?.staff.length ? (
          <table className="table"><tbody>{data.occupancy.staff.map((s) => {
            const p = data.perf.find((x) => x.staffId === s.staffId);
            return <tr key={s.staffId}><td>{p?.name ?? s.staffId.slice(0, 8)}</td><td className="mono">{pct(s.occupancy)}</td><td className="small muted mono">{s.bookedMin} / {s.availableMin} min</td></tr>;
          })}</tbody></table>
        ) : <EmptyState title={t('common.empty')} />}
      </section>

      <section className="card" style={{ marginTop: 14 }} aria-labelledby="perf-h">
        <h2 id="perf-h">{t('analytics.performance')}</h2>
        <p className="small muted">{t('analytics.performance_note')} {t('analytics.correction')}</p>
        {data.perf.length ? (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('common.name')}</th><th>{t('analytics.col.visits')}</th><th>{t('analytics.col.satisfaction')}</th><th>{t('analytics.col.reviews')}</th><th>{t('analytics.col.repeat')}</th><th>{t('analytics.col.punctuality')}</th><th>{t('analytics.col.utilization')}</th><th>{t('analytics.col.composite')}</th></tr></thead>
              <tbody>
                {data.perf.map((p) => {
                  const cell = (i: { value: number | null; sample: number; sufficient: boolean; method: string }, fmt: (v: number) => string) => (
                    <td title={t(i.method)}>{i.sufficient && i.value != null ? <span className="mono">{fmt(i.value)}</span> : <span className="badge soft">{t('analytics.insufficient')}</span>}<div className="small muted">n={i.sample}</div></td>
                  );
                  return (
                    <tr key={p.staffId}>
                      <td>{p.name}<div className="small muted">{p.specialty ?? ''}</div></td>
                      <td className="mono">{p.visits.sample}</td>
                      {cell(p.satisfaction, (v) => v.toFixed(2))}
                      <td className="mono">{p.reviewCount}</td>
                      {cell(p.repeatRate, (v) => pct(v))}
                      {cell(p.punctuality, (v) => pct(v))}
                      {cell(p.utilization, (v) => pct(v))}
                      <td>{p.composite.sufficient ? <span className="mono">{pct(p.composite.value)}</span> : <span className="badge soft">{t('analytics.insufficient')}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <EmptyState title={t('common.empty')} />}
      </section>
    </>
  );
}
