'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/client/api';
import { useNotificationSignal } from '@/lib/client/realtime';
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

/**
 * Notification bell for the shell top bar. Updates instantly over SSE and
 * falls back to 60 s polling (useNotificationSignal). `tenant` rewrites the
 * staff-notification placeholder path (/app/_/…) to the current business.
 */
export function NotificationsBell({ tenant, tz, allHref }: { tenant?: string; tz?: string; allHref: string }) {
  const t = useT();
  const locale = useLocale();
  const sig = useNotificationSignal();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[] | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const load = () => apiFetch<{ items: Item[] }>('/api/v1/me/notifications?limit=8').then((r) => setItems(r.items)).catch(() => {});
  useEffect(() => {
    if (open) void load();
  }, [open, sig.version]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  const fix = (p: string | null) => (!p ? null : p.includes('/app/_/') ? (tenant ? p.replace('/app/_/', `/app/${tenant}/`) : null) : p);
  const unread = sig.unread ?? 0;
  return (
    <div style={{ position: 'relative' }} ref={box}>
      <button type="button" className="btn icon-btn" aria-expanded={open} aria-haspopup="dialog" aria-label={`${t('nav.notifications')} (${unread})`} onClick={() => setOpen(!open)} data-testid="notif-bell">
        <Icon name="bell" size={18} />
        {unread > 0 && <span className="badge red notif-count">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="card notif-pop" role="dialog" aria-label={t('nav.notifications')}>
          <div className="row between" style={{ marginBottom: 8 }}>
            <strong>{t('nav.notifications')}</strong>
            <span className={`badge ${sig.mode === 'live' ? 'green' : ''}`} title={t(`rt.mode_hint.${sig.mode}`)}>{t(`rt.mode.${sig.mode}`)}</span>
          </div>
          {!items && <div className="skeleton" style={{ height: 60 }} />}
          {items && !items.length && <div className="muted small">{t('dash.notifications_empty')}</div>}
          {items?.map((n) => {
            const href = fix(n.targetPath);
            const body = (
              <div className="notif-row" data-unread={!n.readAt}>
                <div>{t(n.title)}{n.body ? ` · ${n.body}` : ''}</div>
                <div className="small muted">{formatDateTime(n.createdAt, { tz, locale })}</div>
              </div>
            );
            return href ? (
              <Link key={n.id} href={href} className="plain-link" onClick={() => { setOpen(false); void apiFetch('/api/v1/me/notifications', { method: 'POST', body: { ids: [n.id] } }).catch(() => {}); }}>{body}</Link>
            ) : <div key={n.id}>{body}</div>;
          })}
          <div className="row between" style={{ marginTop: 8 }}>
            <button type="button" className="btn btn-quiet btn-sm" onClick={async () => { await apiFetch('/api/v1/me/notifications', { method: 'POST', body: { ids: 'all' } }); void load(); }}>{t('dash.mark_all_read')}</button>
            <Link href={allHref} className="btn btn-quiet btn-sm" onClick={() => setOpen(false)}>{t('rt.see_all')}</Link>
          </div>
        </div>
      )}
    </div>
  );
}
