import Link from 'next/link';
import { Icon } from '@/components/Icon';
import { NotificationsBell } from '@/components/dashboard/NotificationsBell';
import { pageT, requireTenant } from '@/server/http/page';
import { tx } from '@/server/tenancy/context';
import { overview } from '@/server/dashboard/overview';
import { subscriptionView } from '@/server/dashboard/settings';
import { addDays, utcToWall, wallToUtc } from '@/lib/tz';
import { formatDateTime, tzLabel } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function Overview({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const ctx = await requireTenant(tenant);
  const { t, locale } = await pageT(ctx.user);
  const tz = ctx.tenant.timezone;
  const today = utcToWall(new Date(), tz).date;
  const data = await tx(ctx, (db) => overview(db, ctx, wallToUtc(today, '00:00', tz), wallToUtc(addDays(today, 1), '00:00', tz)));
  const sub = ctx.caps.has('subscription.view') ? await tx(ctx, (db) => subscriptionView(db, ctx.tenant.id)) : null;
  const base = `/app/${ctx.tenant.slug}`;
  const rd = data.readiness;
  const readyItems: [string, boolean][] = [
    ['onb.ready.service', rd.service],
    ['onb.ready.staff', rd.staff],
    ['onb.ready.schedule', rd.schedule],
    ['onb.ready.contact', rd.contact],
    ['onb.ready.policy', rd.policy],
    ['dash.ready.published', rd.published],
  ];
  const allReady = readyItems.every(([, ok]) => ok);
  const canManage = ctx.caps.has('tenant.settings.manage');
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs">{ctx.tenant.name}</div>
          <h1>{t('nav.overview')}</h1>
          <div className="small muted">{formatDateTime(new Date(), { tz, locale, dateStyle: 'full', dateOnly: true })} · {tzLabel(tz, locale)}</div>
        </div>
        <div className="row">
          <NotificationsBell tenant={ctx.tenant.slug} tz={tz} />
          {ctx.caps.has('bookings.manage') && (
            <Link href={`${base}/bookings?new=1`} className="btn btn-gold">
              <Icon name="plus" size={16} /> {t('bk.new')}
            </Link>
          )}
        </div>
      </div>

      {canManage && !allReady && (
        <section className="card" aria-labelledby="ready-h" style={{ marginBottom: 14 }}>
          <h2 id="ready-h">{t('dash.readiness')}</h2>
          <p className="small muted">{t('dash.readiness_hint')}</p>
          <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: '8px 0' }}>
            {readyItems.map(([k, ok]) => (
              <li key={k} className="row">
                <span className={`badge ${ok ? 'green' : 'amber'}`}>{ok ? <Icon name="check" size={12} /> : '•'}</span> {t(k)}
              </li>
            ))}
          </ul>
          {!rd.onboardingDone && (
            <Link href={`/onboarding/${ctx.tenant.slug}`} className="btn btn-ghost btn-sm">{t('dash.continue_onboarding')}</Link>
          )}
        </section>
      )}

      <div className="grid cols-3" style={{ marginBottom: 14 }}>
        <div className="card stat">
          <div className="k">{t('dash.today')}</div>
          <div className="v">{data.today.length}</div>
        </div>
        <div className="card stat">
          <div className="k">{t('dash.upcoming_week')}</div>
          <div className="v">{data.counts.upcoming}</div>
        </div>
        <div className="card stat">
          <div className="k">{t('dash.pending_payment')}</div>
          <div className="v">{data.counts.pendingPayment}</div>
        </div>
      </div>

      <div className="grid cols-2">
        <section className="card" aria-labelledby="today-h">
          <h2 id="today-h">{t('dash.today')}</h2>
          {data.today.length === 0 ? (
            <div className="muted">{t('dash.no_bookings_today')}</div>
          ) : (
            <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {data.today.map((b) => (
                <li key={b.id as string}>
                  <Link href={`${base}/bookings?booking=${b.id}&date=${today}`} className="row between" style={{ color: 'inherit', textDecoration: 'none' }}>
                    <span>
                      <span className="mono">{formatDateTime(b.startsAt as Date, { tz, locale, timeOnly: true })}</span> · {(b.customerName as string) ?? (b.number as string)}
                      <div className="small muted">{b.summary as string}</div>
                    </span>
                    <span className="badge">{t(`bk.status.${b.status}`)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card" aria-labelledby="pend-h">
          <h2 id="pend-h">{t('dash.pending_actions')}</h2>
          {data.pending.length === 0 ? (
            <div className="muted">{t('dash.nothing_pending')}</div>
          ) : (
            <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {data.pending.map((p) => (
                <li key={p.key}>
                  <Link href={p.href} className="row between">
                    <span>{t(p.key)}</span>
                    <span className="badge amber">{p.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {sub?.subscription && (
            <>
              <hr className="divider" />
              <div className="row between">
                <span>{t('dash.subscription')}: {locale === 'ar' ? (sub.subscription.nameAr as string) : (sub.subscription.nameEn as string)}</span>
                <Link href={`${base}/settings?tab=subscription`} className="badge">{t(`sub.${sub.subscription.status}`)}</Link>
              </div>
              {sub.subscription.trialEndsAt && <div className="small muted">{t('st.trial_ends')}: {formatDateTime(sub.subscription.trialEndsAt as Date, { tz, locale, dateOnly: true })}</div>}
            </>
          )}
        </section>
      </div>
    </>
  );
}
