'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/client/api';
import { formatDateTime } from '@/lib/format';
import { Icon } from '../Icon';
import { useLocale, useT } from '../I18n';

interface Item {
  id: string;
  title: string;
  body: string | null;
  targetPath: string | null;
  readAt: string | null;
  createdAt: string;
}

/** Persisted notification center (polling every 60s; Realtime is a later optimization). */
export function NotificationsBell({ tenant, tz }: { tenant: string; tz: string }) {
  const t = useT();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<{ items: Item[]; unread: number } | null>(null);
  const url = `/api/v1/t/${tenant}/notifications`;
  const load = () => apiFetch<{ items: Item[]; unread: number }>(url).then(setData).catch(() => {});
  useEffect(() => {
    void load();
    const id = setInterval(load, 60000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
  const fix = (p: string | null) => (p ? p.replace('/app/_/', `/app/${tenant}/`) : null);
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" className="btn icon-btn" aria-expanded={open} aria-label={`${t('nav.notifications')} (${data?.unread ?? 0})`} onClick={() => setOpen(!open)}>
        <Icon name="bell" size={18} />
        {!!data?.unread && <span className="badge red" style={{ padding: '0 6px', marginInlineStart: 4 }}>{data.unread}</span>}
      </button>
      {open && (
        <div className="card" style={{ position: 'absolute', insetInlineEnd: 0, top: 42, width: 340, zIndex: 30, maxHeight: 420, overflowY: 'auto', boxShadow: 'var(--shadow)' }}>
          <div className="row between" style={{ marginBottom: 8 }}>
            <strong>{t('nav.notifications')}</strong>
            <button type="button" className="btn btn-quiet btn-sm" onClick={async () => { await apiFetch(url, { method: 'POST', body: { ids: 'all' } }); void load(); }}>
              {t('dash.mark_all_read')}
            </button>
          </div>
          {!data?.items.length && <div className="muted small">{t('dash.notifications_empty')}</div>}
          {data?.items.map((n) => {
            const href = fix(n.targetPath);
            const body = (
              <div style={{ padding: '8px 0', borderBottom: '1px solid var(--line-soft)', opacity: n.readAt ? 0.65 : 1 }}>
                <div style={{ fontWeight: n.readAt ? 400 : 600 }}>{t(n.title)}{n.body ? ` · ${n.body}` : ''}</div>
                <div className="small muted">{formatDateTime(n.createdAt, { tz, locale })}</div>
              </div>
            );
            return href ? <Link key={n.id} href={href} style={{ color: 'inherit', textDecoration: 'none' }} onClick={() => setOpen(false)}>{body}</Link> : <div key={n.id}>{body}</div>;
          })}
        </div>
      )}
    </div>
  );
}
