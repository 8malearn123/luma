import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm } from '@/components/platform/ActionForm';
import { formatDateTime } from '@/lib/format';
import { canPlatform, pageT, requirePlatform } from '@/server/http/page';
import { listPlatformAppeals, listPlatformDecisions, listRules, platformReviewQueue, suggestForCustomer } from '@/server/policy/service';
import { withSystem } from '@/server/db';

export const dynamic = 'force-dynamic';

/** Server-only helper: renders the result of an async render function. */
async function Async({ fn }: { fn: () => Promise<React.ReactNode> }) {
  return <>{await fn()}</>;
}
const TABS = ['queue', 'decisions', 'rules', 'appeals'] as const;

export default async function PoliciesPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const p = await requirePlatform();
  if (!canPlatform(p, 'platform.policy.review')) notFound();
  const { t, locale } = await pageT(p.user);
  const tab = (TABS as readonly string[]).includes((await searchParams).tab ?? '') ? (await searchParams).tab! : 'queue';
  const actions = ['default', 'require_deposit', 'require_full_payment', 'manual_approval', ...(canPlatform(p, 'platform.policy.suspend') ? ['suspend_account'] : [])];
  const inMonth = new Date(Date.now() + 30 * 86400e3).toISOString().slice(0, 16);
  const inWeek = new Date(Date.now() + 7 * 86400e3).toISOString().slice(0, 16);
  const decisionFields = (customerUserId: string, incidentId: string) => [
    { name: 'action', label: t('policy.action'), type: 'select' as const, options: actions.map((a) => ({ value: a, label: t(`policy.action.${a}`) })), defaultValue: 'require_deposit' },
    { name: 'reasonCode', label: t('policy.reason_code'), defaultValue: 'repeated_no_show', ltr: true, required: true },
    { name: 'reasonInternal', label: t('policy.reason_internal'), type: 'textarea' as const, required: true },
    { name: 'customerExplanation', label: t('policy.customer_explanation'), type: 'textarea' as const, required: true },
    { name: 'evidenceIncidentIds', label: t('policy.evidence_ids'), type: 'list' as const, defaultValue: incidentId, ltr: true, required: true },
    { name: 'expiresAt', label: t('policy.expires_at'), type: 'datetime' as const, defaultValue: inMonth, required: true },
    { name: 'reviewAt', label: t('policy.review_at'), type: 'datetime' as const, defaultValue: inWeek, required: true },
  ];
  return (
    <>
      <div className="page-head"><h1>{t('platform.nav.policies')}</h1></div>
      <div className="alert info">{t('policy.intro')} {t('policy.rules_hint')}</div>
      <div className="tabs" role="tablist">
        {TABS.map((x) => <Link key={x} role="tab" aria-selected={tab === x} className="tab" href={`?tab=${x}`}>{t(`policy.tab.${x}`)}</Link>)}
      </div>
      {tab === 'queue' && <Async fn={async () => {
        const q = await platformReviewQueue(p);
        if (!q.length) return <p className="muted">{t('common.empty')}</p>;
        return (
          <div className="stack">
            {await Promise.all(q.map(async (i) => {
              const sug = i.customerUserId ? await withSystem('suggestions', (tx) => suggestForCustomer(tx, i.customerUserId as string)) : [];
              return (
                <section key={i.id as string} className="card">
                  <div className="row between">
                    <strong>{t(`policy.type.${i.type}`)} · {i.tenantName as string}</strong>
                    <span className="badge">{t(`policy.status.${i.status}`)}</span>
                  </div>
                  <p className="small muted">{formatDateTime(i.occurredAt as Date, { locale })} · {t('policy.queue_totals', { n: i.confirmedTotal as number, t: i.distinctTenants as number })}</p>
                  <p>{i.description as string}</p>
                  {sug.length > 0 && <div className="alert warn small">{sug.map((s) => `${s.name}: ${t(`policy.action.${s.suggestedAction}`)}${s.experimental ? ` (${t('policy.experimental')})` : ''}`).join(' · ')}</div>}
                  <ActionForm path={`/api/v1/platform/policy/incidents/${i.id}/review`} compact submitLabel={t('common.save')} fields={[
                    { name: 'to', label: t('common.status'), type: 'select', options: ['under_review', 'confirmed', 'rejected', 'corrected'].map((s) => ({ value: s, label: t(`policy.to.${s}`) })), defaultValue: 'under_review' },
                    { name: 'note', label: t('policy.review_note'), type: 'textarea', required: true },
                  ]} />
                  {i.customerUserId && i.status === 'confirmed' ? (
                    <details>
                      <summary className="btn btn-sm btn-ghost">{t('policy.platform_decision')}</summary>
                      <ActionForm path="/api/v1/platform/policy/decisions" submitLabel={t('policy.create_decision')} extra={{ customerUserId: i.customerUserId }} fields={decisionFields(i.customerUserId as string, i.id as string)} />
                    </details>
                  ) : null}
                </section>
              );
            }))}
          </div>
        );
      }} />}
      {tab === 'decisions' && <Async fn={async () => {
        const d = await listPlatformDecisions(p);
        if (!d.length) return <p className="muted">{t('common.empty')}</p>;
        return (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>{t('policy.action')}</th><th>{t('policy.reason_code')}</th><th>{t('common.status')}</th><th>{t('policy.expires_at')}</th><th>{t('policy.review_at')}</th><th>{t('platform.col.actor')}</th></tr></thead>
            <tbody>{d.map((x) => (
              <tr key={x.id as string}>
                <td>{t(`policy.action.${x.action}`)}</td><td className="mono small">{x.reasonCode as string}</td>
                <td>{t(`policy.decision_status.${x.status}`)}</td>
                <td className="small">{x.expiresAt ? formatDateTime(x.expiresAt as Date, { locale }) : '—'}</td>
                <td className="small">{x.reviewAt ? formatDateTime(x.reviewAt as Date, { locale }) : '—'}</td>
                <td className="small">{x.reviewer as string}</td>
              </tr>))}</tbody>
          </table></div>
        );
      }} />}
      {tab === 'rules' && <Async fn={async () => {
        const rules = await listRules(p);
        const ruleFields = (r?: Record<string, unknown>) => [
          { name: 'name', label: t('common.name'), defaultValue: (r?.name as string) ?? '', required: true },
          { name: 'incidentType', label: t('policy.type'), type: 'select' as const, options: ['no_show', 'late_cancellation', 'payment_dispute', 'conduct'].map((x) => ({ value: x, label: t(`policy.type.${x}`) })), defaultValue: (r?.incidentType as string) ?? 'no_show' },
          { name: 'minConfirmedIncidents', label: t('policy.min_incidents'), type: 'number' as const, defaultValue: (r?.minConfirmedIncidents as number) ?? 3, required: true },
          { name: 'windowDays', label: t('policy.window_days'), type: 'number' as const, defaultValue: (r?.windowDays as number) ?? 180, required: true },
          { name: 'minDistinctTenants', label: t('policy.min_tenants'), type: 'number' as const, defaultValue: (r?.minDistinctTenants as number) ?? 2, required: true },
          { name: 'suggestedAction', label: t('policy.suggested_action'), type: 'select' as const, options: ['require_deposit', 'require_full_payment', 'manual_approval'].map((x) => ({ value: x, label: t(`policy.action.${x}`) })), defaultValue: (r?.suggestedAction as string) ?? 'require_deposit' },
          { name: 'isExperimental', label: t('policy.experimental'), type: 'checkbox' as const, defaultValue: (r?.isExperimental as boolean) ?? true },
          { name: 'enabled', label: t('platform.enabled'), type: 'checkbox' as const, defaultValue: (r?.enabled as boolean) ?? false },
        ];
        return (
          <div className="stack">
            {rules.map((r) => (
              <section key={r.id as string} className="card">
                {r.isExperimental ? <span className="badge amber">{t('policy.experimental')}</span> : null}
                <ActionForm path={`/api/v1/platform/policy/rules/${r.id}`} method="PUT" submitLabel={t('policy.save_rule')} fields={ruleFields(r)} />
              </section>
            ))}
            <section className="card"><h2>{t('common.add')}</h2><ActionForm path="/api/v1/platform/policy/rules" submitLabel={t('policy.save_rule')} fields={ruleFields()} /></section>
          </div>
        );
      }} />}
      {tab === 'appeals' && <Async fn={async () => {
        const a = await listPlatformAppeals(p);
        if (!a.length) return <p className="muted">{t('common.empty')}</p>;
        return (
          <div className="stack">
            {a.map((x) => (
              <section key={x.id as string} className="card">
                <div className="row between"><strong>{t(`policy.action.${x.decisionAction}`)}</strong><span className="badge">{t(`policy.appeal_status.${x.status}`)}</span></div>
                <p className="small muted">{x.reasonInternal as string}</p>
                <p>{x.statement as string}</p>
                {['submitted', 'under_review'].includes(x.status as string) && (
                  <ActionForm path={`/api/v1/platform/policy/appeals/${x.id}/resolve`} compact submitLabel={t('common.save')} fields={[
                    { name: 'outcome', label: t('common.status'), type: 'select', options: [{ value: 'upheld', label: t('policy.uphold') }, { value: 'overturned', label: t('policy.overturn') }], defaultValue: 'upheld' },
                    { name: 'note', label: t('policy.resolution_note'), type: 'textarea', required: true },
                  ]} />
                )}
              </section>
            ))}
          </div>
        );
      }} />}
    </>
  );
}
