'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiFetch } from '@/lib/client/api';
import { useNotificationSignal } from '@/lib/client/realtime';
import { formatDateTime } from '@/lib/format';
import { useLocale, useT } from '../I18n';
import { EmptyState, ErrorAlert } from '../ui/forms';

interface N {
  id: string;
  type: string;
  title: string;
  body: string | null;
  targetPath: string | null;
  readAt: string | null;
  createdAt: string;
}

/** Persisted notifications; refreshed on the realtime signal (SSE, 60 s polling fallback). */
export function NotificationCenter() {
  const t = useT();
  const locale = useLocale();
  const [items, setItems] = useState<N[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [unread, setUnread] = useState(0);
  const [err, setErr] = useState<ApiError | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await apiFetch<{ items: N[]; hasMore: boolean; unread: number }>('/api/v1/me/notifications?limit=20');
      setItems((cur) => {
        if (!cur || cur.length <= 20) return r.items;
        const ids = new Set(r.items.map((x) => x.id));
        return [...r.items, ...cur.filter((x) => !ids.has(x.id))];
      });
      setHasMore(r.hasMore);
      setUnread(r.unread);
      setErr(null);
    } catch (e) {
      setErr(e as ApiError);
    }
  }, []);
  const sig = useNotificationSignal();
  useEffect(() => {
    void load();
  }, [load, sig.version]);
  const more = async () => {
    if (!items?.length) return;
    const r = await apiFetch<{ items: N[]; hasMore: boolean }>(`/api/v1/me/notifications?limit=20&before=${encodeURIComponent(items[items.length - 1].createdAt)}`);
    setItems([...items, ...r.items]);
    setHasMore(r.hasMore);
  };
  const markAll = async () => {
    await apiFetch('/api/v1/me/notifications', { method: 'POST', body: { ids: 'all' } });
    void load();
  };
  const markOne = async (id: string) => {
    await apiFetch('/api/v1/me/notifications', { method: 'POST', body: { ids: [id] } }).catch(() => {});
  };
  if (!items) return err ? <ErrorAlert error={err} /> : <div className="skeleton" style={{ height: 120 }} />;
  const modeBadge = <span className={`badge ${sig.mode === 'live' ? 'green' : ''}`} title={t(`rt.mode_hint.${sig.mode}`)}>{t(`rt.mode.${sig.mode}`)}</span>;
  if (!items.length) return <div className="stack"><div>{modeBadge}</div><EmptyState icon="bell" title={t('account.no_notifications')} /></div>;
  return (
    <div className="stack">
      <div>{modeBadge}</div>
      {err && <ErrorAlert error={err} />}
      {unread > 0 && (
        <div className="row between">
          <span className="badge gold">{unread}</span>
          <button className="btn btn-quiet btn-sm" onClick={markAll}>{t('account.mark_all_read')}</button>
        </div>
      )}
      {items.map((n) => {
        const inner = (
          <div className="row between">
            <div>
              <div style={{ fontWeight: n.readAt ? 400 : 600 }}>{t(n.title)}</div>
              {n.body && <div className="small muted">{n.body}</div>}
            </div>
            <span className="small muted">{formatDateTime(n.createdAt, { locale })}</span>
          </div>
        );
        return n.targetPath && !n.targetPath.includes('/_/') ? (
          <Link key={n.id} href={n.targetPath} className="card" style={{ display: 'block', color: 'inherit', textDecoration: 'none' }} onClick={() => markOne(n.id)}>
            {inner}
          </Link>
        ) : (
          <div key={n.id} className="card">{inner}</div>
        );
      })}
      {hasMore && <button className="btn btn-quiet" onClick={more}>{t('account.load_more')}</button>}
    </div>
  );
}
