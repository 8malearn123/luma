'use client';

import { useState } from 'react';
import { formatDateTime } from '@/lib/format';
import { useLocale, useT } from '../I18n';
import { EmptyState } from '../ui/forms';
import { DataState, PageHead, useApi } from './hooks';

export function AuditView({ tenant, tz }: { tenant: string; tz: string }) {
  const t = useT();
  const locale = useLocale();
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [offset, setOffset] = useState(0);
  const d = useApi<{ items: { id: number; at: string; actorKind: string; action: string; targetType: string | null; targetId: string | null; reason: string | null; actorName: string | null }[]; hasMore: boolean }>(
    `/api/v1/t/${tenant}/audit?${new URLSearchParams({ offset: String(offset), ...(action ? { action } : {}), ...(actor ? { actor } : {}) })}`,
  );
  return (
    <>
      <PageHead title={t('nav.audit')} />
      <div className="toolbar">
        <input className="input" placeholder={t('au.action')} aria-label={t('au.action')} value={action} onChange={(e) => { setAction(e.target.value); setOffset(0); }} />
        <input className="input" placeholder={t('au.actor')} aria-label={t('au.actor')} value={actor} onChange={(e) => { setActor(e.target.value); setOffset(0); }} />
      </div>
      <DataState loading={d.loading && !d.data} error={d.error} onRetry={d.reload}>
        {!d.data?.items.length ? <div className="card"><EmptyState icon="clipboard" title={t('common.empty')} /></div> : (
          <>
            <div className="table-wrap"><table className="table">
              <thead><tr><th>{t('au.when')}</th><th>{t('au.actor')}</th><th>{t('au.action')}</th><th>{t('au.target')}</th><th>{t('common.reason')}</th></tr></thead>
              <tbody>{d.data.items.map((a) => (
                <tr key={a.id}><td className="small">{formatDateTime(a.at, { tz, locale })}</td><td>{a.actorName ?? '—'} {a.actorKind !== 'user' && <span className="badge amber">{a.actorKind}</span>}</td>
                  <td className="mono small">{a.action}</td><td className="mono small">{a.targetType ? `${a.targetType}:${a.targetId?.slice(0, 8) ?? ''}` : ''}</td><td className="small">{a.reason ?? ''}</td></tr>
              ))}</tbody></table></div>
            <div className="pager">
              <button type="button" className="btn btn-sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 100))}>{t('common.prev_page')}</button>
              <button type="button" className="btn btn-sm" disabled={!d.data.hasMore} onClick={() => setOffset(offset + 100)}>{t('common.next_page')}</button>
            </div>
          </>
        )}
      </DataState>
    </>
  );
}
