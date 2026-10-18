import { ActionForm } from '@/components/platform/ActionForm';
import { EmptyState } from '@/components/ui/forms';
import { formatDateTime } from '@/lib/format';
import { pageT, requireUser } from '@/server/http/page';
import { customerPolicyView } from '@/server/policy/service';

export const dynamic = 'force-dynamic';

type Appeal = { id: string; status: string; resolutionNote: string | null } | null;

/** The customer's own decisions (explanations only) and reports about her, with appeal routes. */
export default async function AppealsPage() {
  const user = await requireUser();
  const { t, locale } = await pageT(user);
  const v = await customerPolicyView(user.userId);
  const open = (a: Appeal) => !!a && ['submitted', 'under_review'].includes(a.status);
  return (
    <div className="stack">
      <div className="page-head"><h1>{t('policy.my_title')}</h1></div>
      <p className="muted">{t('policy.my_intro')}</p>
      {v.decisions.length === 0 && v.incidents.length === 0 && <EmptyState icon="shield" title={t('policy.my_none')} />}
      {v.decisions.length > 0 && (
        <section className="stack" aria-labelledby="dec-h">
          <h2 id="dec-h">{t('policy.decisions_about_me')}</h2>
          {v.decisions.map((d) => {
            const appeal = d.appeal as Appeal;
            return (
              <article key={d.id as string} className="card">
                <div className="row between">
                  <strong>{t(`policy.action.${d.action}`)}</strong>
                  <span className="badge">{t(`policy.decision_status.${d.status}`)}</span>
                </div>
                <p className="small muted">
                  {d.scope === 'platform' ? t('policy.scope.platform') : t('policy.scope.tenant', { name: (d.tenantName as string) ?? '' })}
                  {d.expiresAt ? ` · ${t('policy.until', { date: formatDateTime(d.expiresAt as Date, { locale, dateOnly: true }) })}` : ''}
                </p>
                <p>{d.customerExplanation as string}</p>
                {appeal && (
                  <div className="alert info small">
                    {t(`policy.appeal_status.${appeal.status}`)}{appeal.resolutionNote ? ` — ${appeal.resolutionNote}` : ''}
                  </div>
                )}
                {d.status === 'active' && !open(appeal) && (
                  <details>
                    <summary className="btn btn-sm btn-ghost">{t('policy.appeal')}</summary>
                    <ActionForm path="/api/v1/appeals" submitLabel={t('policy.appeal')} extra={{ decisionId: d.id }} fields={[{ name: 'statement', label: t('policy.appeal_statement'), type: 'textarea', required: true }]} />
                  </details>
                )}
              </article>
            );
          })}
        </section>
      )}
      {v.incidents.length > 0 && (
        <section className="stack" aria-labelledby="inc-h">
          <h2 id="inc-h">{t('policy.reports_about_me')}</h2>
          {v.incidents.map((i) => {
            const appeal = i.appeal as Appeal;
            return (
              <article key={i.id as string} className="card">
                <div className="row between">
                  <strong>{t(`policy.type.${i.type}`)} · {i.tenantName as string}</strong>
                  <span className="badge">{t(`policy.status.${i.status}`)}</span>
                </div>
                <p className="small muted">{formatDateTime(i.occurredAt as Date, { locale })}</p>
                {appeal && <div className="alert info small">{t(`policy.appeal_status.${appeal.status}`)}{appeal.resolutionNote ? ` — ${appeal.resolutionNote}` : ''}</div>}
                {!open(appeal) && i.status !== 'corrected' && i.status !== 'rejected' && (
                  <details>
                    <summary className="btn btn-sm btn-ghost">{t('policy.appeal')}</summary>
                    <ActionForm path="/api/v1/appeals" submitLabel={t('policy.appeal')} extra={{ incidentId: i.id }} fields={[{ name: 'statement', label: t('policy.appeal_statement'), type: 'textarea', required: true }]} />
                  </details>
                )}
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
