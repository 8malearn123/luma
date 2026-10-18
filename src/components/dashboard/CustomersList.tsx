'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatDateTime } from '@/lib/format';
import { useLocale, useT } from '../I18n';
import { EmptyState } from '../ui/forms';
import { DataState, PageHead, useApi } from './hooks';

interface Row { id: string; displayName: string; phone: string | null; email: string | null; tags: string[]; visits: number; lastVisit: string | null; hasAccount: boolean }

export function CustomersList({ tenant, tz }: { tenant: string; tz: string }) {
  const t = useT();
  const locale = useLocale();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    const h = setTimeout(() => { setDebounced(q); setOffset(0); }, 250);
    return () => clearTimeout(h);
  }, [q]);
  const d = useApi<{ items: Row[]; hasMore: boolean }>(`/api/v1/t/${tenant}/customers?offset=${offset}${debounced ? `&q=${encodeURIComponent(debounced)}` : ''}`);
  return (
    <>
      <PageHead title={t('nav.customers')} />
      <p className="small muted">{t('cu.scope_note')}</p>
      <div className="toolbar"><input className="input" type="search" placeholder={t('common.search')} aria-label={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <DataState loading={d.loading && !d.data} error={d.error} onRetry={d.reload}>
        {!d.data?.items.length ? (
          <div className="card"><EmptyState icon="users" title={t('common.empty')} /></div>
        ) : (
          <>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>{t('common.name')}</th><th>{t('onb.phone')}</th><th>{t('cu.visits')}</th><th>{t('cu.last_visit')}</th><th>{t('cu.tags')}</th></tr></thead>
                <tbody>
                  {d.data.items.map((c) => (
                    <tr key={c.id}>
                      <td><Link href={`/app/${tenant}/customers/${c.id}`}>{c.displayName}</Link>{c.hasAccount && <span className="badge" style={{ marginInlineStart: 6 }}>LUMA</span>}</td>
                      <td className="mono small">{c.phone ?? '—'}</td>
                      <td>{c.visits}</td>
                      <td className="small">{c.lastVisit ? formatDateTime(c.lastVisit, { tz, locale, dateOnly: true }) : '—'}</td>
                      <td>{c.tags.map((g) => <span key={g} className="badge" style={{ marginInlineEnd: 4 }}>{g}</span>)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pager">
              <button type="button" className="btn btn-sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 50))}>{t('common.prev_page')}</button>
              <button type="button" className="btn btn-sm" disabled={!d.data.hasMore} onClick={() => setOffset(offset + 50)}>{t('common.next_page')}</button>
            </div>
          </>
        )}
      </DataState>
    </>
  );
}
