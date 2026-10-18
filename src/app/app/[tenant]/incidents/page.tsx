import Link from 'next/link';
import { ActionForm } from '@/components/platform/ActionForm';
import { EmptyState } from '@/components/ui/forms';
import { formatDateTime } from '@/lib/format';
import { can, pageT, requireTenant } from '@/server/http/page';
import { tx } from '@/server/tenancy/context';
import { listIncidents, listTenantAppeals, listTenantDecisions } from '@/server/policy/service';

export const dynamic = 'force-dynamic';
const TABS = ['incidents', 'decisions', 'appeals'] as const;

async function Async({ fn }: { fn: () => Promise<React.ReactNode> }) {
  return <>{await fn()}</>;
}

export default async function IncidentsPage({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<{ tab?: string; bookingId?: string }> }) {
  const { tenant } = await params;
  const sp = await searchParams;
  const ctx = await requireTenant(tenant);
  const { t, locale } = await pageT(ctx.user);
  if (!can(ctx, 'incidents.submit', 'incidents.review')) {
    return <div className="alert warn" role="alert">{t('common.permission_denied')}</div>;
  }
  const reviewer = can(ctx, 'incidents.review');
  const tabs = TABS.filter((x) => x === 'incidents' || reviewer);
  const tab = (tabs as readonly string[]).includes(sp.tab ?? '') ? sp.tab! : 'incidents';
  const base = `/api/v1/t/${ctx.tenant.slug}/incidents`;
  const tz = ctx.tenant.timezone;
  const inMonth = new Date(Date.now() + 30 * 86400e3).toISOString().slice(0, 16);
  const inWeek = new Date(Date.now() + 7 * 86400e3).toISOString().slice(0, 16);
  return (
    <>
      <div className="page-head"><h1>{t('policy.title')}</h1></div>
      <div className="alert info">{t('policy.intro')}</div>
      <div className="tabs" role="tablist">
        {tabs.map((x) => <Link key={x} role="tab" aria-selected={tab === x} className="tab" href={`?tab=${x}`}>{t(`policy.tab.${x}`)}</Link>)}
      </div>
      {tab === 'incidents' && (
        <Async fn={async () => {
          const items = await tx(ctx, (db) => listIncidents(db));
          return (
            <div className="stack">
              {can(ctx, 'incidents.submit') && (
                <details className="card" open={!!sp.bookingId}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{t('policy.new_incident')}</summary>
                  <ActionForm path={base} submitLabel={t('policy.new_incident')} fields={[
                    { name: 'bookingId', label: t('policy.booking'), hint: t('policy.booking_hint'), defaultValue: sp.bookingId ?? '', required: true, ltr: true },
                    { name: 'type', label: t('policy.type'), type: 'select', options: ['no_show', 'late_cancellation', 'payment_dispute', 'conduct'].map((x) => ({ value: x, label: t(`policy.type.${x}`) })), defaultValue: 'no_show' },
                    { name: 'description', label: t('policy.description'), type: 'textarea', required: true },
                    { name: 'requestPlatformReview', label: t('policy.request_platform'), type: 'checkbox' },
                  ]} />
                </details>
              )}
              {items.length === 0 ? <EmptyState icon="shield" title={t('common.empty')} /> : (
                <div className="table-wrap"><table className="table">
                  <thead><tr><th>{t('policy.type')}</th><th>{t('policy.customer')}</th><th>{t('nav.bookings')}</th><th>{t('common.date')}</th><th>{t('common.status')}</th></tr></thead>
                  <tbody>{items.map((i) => (
                    <tr key={i.id as string}>
                      <td><Link href={`/app/${ctx.tenant.slug}/incidents/${i.id}`}>{t(`policy.type.${i.type}`)}</Link> {i.platformReviewRequested ? <span className="badge blue">LUMA</span> : null}</td>
                      <td>{i.customerName as string}</td>
                      <td className="mono small">{i.bookingNumber as string}</td>
                      <td className="small">{formatDateTime(i.occurredAt as Date, { tz, locale })}</td>
                      <td><span className="badge">{t(`policy.status.${i.status}`)}</span></td>
                    </tr>))}</tbody>
                </table></div>
              )}
            </div>
          );
        }} />
      )}
      {tab === 'decisions' && reviewer && (
        <Async fn={async () => {
          const items = await tx(ctx, (db) => listTenantDecisions(db, ctx));
          return (
            <div className="stack">
              <details className="card">
                <summary style={{ cursor: 'pointer', fontWeight: 600 }}>{t('policy.create_decision')}</summary>
                <p className="small muted">{t('policy.decision_scope_tenant')}</p>
                <ActionForm path={`${base}/decisions`} submitLabel={t('policy.create_decision')} fields={[
                  { name: 'tenantCustomerId', label: t('policy.tenant_customer'), required: true, ltr: true },
                  { name: 'action', label: t('policy.action'), type: 'select', options: ['default', 'require_deposit', 'require_full_payment', 'manual_approval'].map((a) => ({ value: a, label: t(`policy.action.${a}`) })), defaultValue: 'require_deposit' },
                  { name: 'reasonCode', label: t('policy.reason_code'), defaultValue: 'repeated_no_show', ltr: true, required: true },
                  { name: 'reasonInternal', label: t('policy.reason_internal'), type: 'textarea', required: true },
                  { name: 'customerExplanation', label: t('policy.customer_explanation'), type: 'textarea', required: true },
                  { name: 'evidenceIncidentIds', label: t('policy.evidence_ids'), type: 'list', ltr: true },
                  { name: 'expiresAt', label: t('policy.expires_at'), type: 'datetime', defaultValue: inMonth, required: true },
                  { name: 'reviewAt', label: t('policy.review_at'), type: 'datetime', defaultValue: inWeek, required: true },
                ]} />
              </details>
              {items.length === 0 ? <EmptyState icon="shield" title={t('common.empty')} /> : (
                <div className="table-wrap"><table className="table">
                  <thead><tr><th>{t('policy.customer')}</th><th>{t('policy.action')}</th><th>{t('common.status')}</th><th>{t('policy.expires_at')}</th><th>{t('policy.tab.appeals')}</th></tr></thead>
                  <tbody>{items.map((d) => (
                    <tr key={d.id as string}>
                      <td>{d.customerName as string}</td>
                      <td>{t(`policy.action.${d.action}`)}<div className="small muted">{d.reasonInternal as string}</div></td>
                      <td>{t(`policy.decision_status.${d.status}`)}</td>
                      <td className="small">{d.expiresAt ? formatDateTime(d.expiresAt as Date, { tz, locale }) : '—'}</td>
                      <td>{d.appealStatus ? t(`policy.appeal_status.${d.appealStatus}`) : '—'}</td>
                    </tr>))}</tbody>
                </table></div>
              )}
            </div>
          );
        }} />
      )}
      {tab === 'appeals' && reviewer && (
        <Async fn={async () => {
          const items = await listTenantAppeals(ctx);
          if (!items.length) return <EmptyState icon="shield" title={t('common.empty')} />;
          return (
            <div className="stack">
              {items.map((a) => (
                <section key={a.id as string} className="card">
                  <div className="row between">
                    <strong>{(a.customerName as string) ?? '—'} · {a.decisionAction ? t(`policy.action.${a.decisionAction}`) : t(`policy.type.${a.incidentType}`)}</strong>
                    <span className="badge">{t(`policy.appeal_status.${a.status}`)}</span>
                  </div>
                  <p>{a.statement as string}</p>
                  {a.resolutionNote ? <p className="small muted">{a.resolutionNote as string}</p> : null}
                  {['submitted', 'under_review'].includes(a.status as string) && (
                    <ActionForm path={`${base}/appeals/${a.id}/resolve`} compact submitLabel={t('common.save')} fields={[
                      { name: 'outcome', label: t('common.status'), type: 'select', options: [{ value: 'upheld', label: t('policy.uphold') }, { value: 'overturned', label: t('policy.overturn') }], defaultValue: 'upheld' },
                      { name: 'note', label: t('policy.resolution_note'), type: 'textarea', required: true },
                    ]} />
                  )}
                </section>
              ))}
            </div>
          );
        }} />
      )}
    </>
  );
}
