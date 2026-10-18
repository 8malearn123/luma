'use client';

import { useState } from 'react';
import { useLocale, useT } from '../I18n';
import { EmptyState, ErrorAlert } from '../ui/forms';
import { apiFetch, type ApiError } from '@/lib/client/api';
import { formatDateTime } from '@/lib/format';
import { tapi, useLoad } from '../catalog/client';

interface Req { id: string; staffName: string; kind: string; details: string; status: string; reviewNote: string | null; createdAt: string }

export function RequestsPanel({ slug }: { slug: string }) {
  const t = useT();
  const locale = useLocale();
  const list = useLoad<{ items: Req[] }>(tapi(slug, '/staff/requests'));
  const [err, setErr] = useState<ApiError | null>(null);
  const decide = async (id: string, decision: 'approved' | 'rejected') => {
    const note = window.prompt(t('team.decision_note')) ?? undefined;
    try {
      await apiFetch(tapi(slug, `/staff/requests/${id}`), { method: 'POST', body: { decision, note } });
      await list.reload();
    } catch (e) {
      setErr(e as ApiError);
    }
  };
  return (
    <section aria-label={t('team.tab.requests')}>
      <ErrorAlert error={err ?? list.error} />
      {list.loading && !list.data ? <div className="skeleton" style={{ height: 90 }} /> : !list.data?.items.length ? <EmptyState icon="clipboard" title={t('team.no_requests')} /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t('ops.specialist')}</th><th>{t('team.request_kind')}</th><th>{t('common.details')}</th><th>{t('common.created_at')}</th><th>{t('common.status')}</th><th>{t('common.actions')}</th></tr></thead>
            <tbody>
              {list.data.items.map((r) => (
                <tr key={r.id}>
                  <td>{r.staffName}</td>
                  <td>{t(`team.request.${r.kind}`)}</td>
                  <td>{r.details}{r.reviewNote && <div className="small muted">{r.reviewNote}</div>}</td>
                  <td className="small">{formatDateTime(r.createdAt, { locale })}</td>
                  <td><span className={`badge ${r.status === 'approved' ? 'green' : r.status === 'pending' ? 'amber' : ''}`}>{t(`team.leave.${r.status}`)}</span></td>
                  <td>{r.status === 'pending' && (
                    <span className="row" style={{ gap: 4 }}>
                      <button type="button" className="btn btn-sm btn-gold" onClick={() => decide(r.id, 'approved')}>{t('team.approve')}</button>
                      <button type="button" className="btn btn-sm" onClick={() => decide(r.id, 'rejected')}>{t('ops.reject')}</button>
                    </span>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
