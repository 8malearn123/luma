import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ActionForm } from '@/components/platform/ActionForm';
import { formatDateTime } from '@/lib/format';
import { canPlatform, pageT, requirePlatform } from '@/server/http/page';
import { listPlans, tenantDetail } from '@/server/platform/service';
import { AppError } from '@/server/errors';

export const dynamic = 'force-dynamic';

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await requirePlatform();
  const { t, locale } = await pageT(p.user);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  let d: Awaited<ReturnType<typeof tenantDetail>>;
  try {
    d = await tenantDetail(p, id);
  } catch (e) {
    if (e instanceof AppError && e.code === 'not_found') notFound();
    throw e;
  }
  const plans = await listPlans(true);
  const live = d.subscriptions[0];
  const manage = canPlatform(p, 'platform.tenants.manage');
  const usage = d.usage as Record<string, number>;
  return (
    <>
      <div className="crumbs"><Link href="/platform/tenants">{t('platform.nav.tenants')}</Link></div>
      <div className="page-head">
        <h1>{d.tenant.name as string}</h1>
        <span className={`badge ${d.tenant.status === 'active' ? 'green' : d.tenant.status === 'suspended' ? 'red' : ''}`}>{d.tenant.status as string}</span>
      </div>
      <div className="grid cols-2">
        <section className="card">
          <h2>{t('platform.col.usage')}</h2>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('platform.col.feature')}</th><th>{t('platform.col.usage')}</th><th>{t('platform.col.limit')}</th></tr></thead>
              <tbody>
                {['branches', 'staff', 'services'].map((k) => {
                  const lim = d.limits.find((l) => l.featureKey === `${k}.max`);
                  return <tr key={k}><td>{t(`feature.${k}.max`)}</td><td className="ltr-num">{usage[k]}</td><td className="ltr-num">{lim ? (lim.limitValue ?? t('platform.unlimited')) as string : '—'}</td></tr>;
                })}
                <tr><td>{t('nav.bookings')}</td><td className="ltr-num">{usage.bookings}</td><td>—</td></tr>
              </tbody>
            </table>
          </div>
          {live?.overageState === 'over_limit' && <div className="alert warn" style={{ marginTop: 10 }}>{t('platform.over_limit')}</div>}
        </section>
        <section className="card">
          <h2>{t('platform.col.subscription')}</h2>
          {live ? (
            <p>
              <strong>{live.planCode as string}</strong> · {t(`sub.${live.status}`)}
              {live.trialEndsAt ? <> · {t('platform.col.trial_ends')}: {formatDateTime(live.trialEndsAt as Date, { locale, dateOnly: true })}</> : null}
              {live.graceUntil ? <> · grace: {formatDateTime(live.graceUntil as Date, { locale, dateOnly: true })}</> : null}
            </p>
          ) : <p className="muted">—</p>}
          {manage && (
            <ActionForm
              path={`/api/v1/platform/tenants/${id}/subscription`}
              submitLabel={t('platform.change_subscription')}
              fields={[
                { name: 'status', label: t('platform.new_status'), type: 'select', options: [{ value: '', label: t('platform.keep_current') }, ...['trialing', 'active', 'past_due', 'paused', 'cancelled', 'expired'].map((s) => ({ value: s, label: t(`sub.${s}`) }))] },
                { name: 'planId', label: t('platform.new_plan'), type: 'select', options: [{ value: '', label: t('platform.keep_current') }, ...plans.map((pl) => ({ value: pl.id, label: `${locale === 'ar' ? pl.nameAr : pl.nameEn} (${pl.code})` }))] },
                { name: 'reason', label: t('common.reason'), type: 'textarea', required: true },
              ]}
            />
          )}
        </section>
      </div>
      {manage && (
        <section className="card">
          <h2>{d.tenant.status === 'suspended' ? t('platform.reactivate') : t('platform.suspend')}</h2>
          <ActionForm
            path={`/api/v1/platform/tenants/${id}/status`}
            danger={d.tenant.status !== 'suspended'}
            submitLabel={d.tenant.status === 'suspended' ? t('platform.reactivate') : t('platform.suspend')}
            extra={{ status: d.tenant.status === 'suspended' ? 'active' : 'suspended' }}
            fields={[{ name: 'reason', label: t('platform.reason_min'), type: 'textarea', required: true }]}
          />
        </section>
      )}
      <section className="card">
        <h2>{t('platform.nav.subscriptions')}</h2>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t('platform.col.when')}</th><th>{t('platform.col.action')}</th><th>{t('common.from')}</th><th>{t('common.to')}</th></tr></thead>
            <tbody>
              {d.events.map((e, i) => (
                <tr key={i}><td className="small">{formatDateTime(e.createdAt as Date, { locale })}</td><td>{e.type as string}</td><td>{(e.fromStatus as string) ?? '—'}</td><td>{(e.toStatus as string) ?? '—'}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card">
        <h2>{t('platform.nav.support')}</h2>
        {d.grants.length === 0 ? <p className="muted">{t('common.empty')}</p> : (
          <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
            {d.grants.map((g) => (
              <li key={g.id as string} className="small">{g.platformUser as string} · {g.accessLevel as string} · {formatDateTime(g.startsAt as Date, { locale })} → {formatDateTime(g.expiresAt as Date, { locale })} {g.revokedAt ? '(revoked)' : ''} — {g.reason as string}</li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
