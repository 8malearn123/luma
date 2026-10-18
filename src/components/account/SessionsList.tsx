'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError, apiFetch } from '@/lib/client/api';
import { formatDateTime } from '@/lib/format';
import { useLocale, useT } from '../I18n';
import { ErrorAlert } from '../ui/forms';

export function SessionsList({ items }: { items: { id: string; userAgent: string; ip: string; lastSeenAt: string; current: boolean }[] }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [err, setErr] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async (p: Promise<unknown>) => {
    setBusy(true);
    try {
      await p;
      router.refresh();
    } catch (e) {
      setErr(e as ApiError);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="stack">
      <ErrorAlert error={err} />
      {items.map((s) => (
        <div key={s.id} className="row between" style={{ borderBottom: '1px solid var(--line-soft)', paddingBottom: 8 }}>
          <div>
            <div className="small">{s.userAgent.slice(0, 80) || '—'}</div>
            <div className="small muted">
              {t('account.last_seen')}: {formatDateTime(s.lastSeenAt, { locale })} {s.ip && <span className="mono">· {s.ip}</span>}
            </div>
          </div>
          {s.current ? (
            <span className="badge green">{t('account.current_device')}</span>
          ) : (
            <button className="btn btn-quiet btn-sm" disabled={busy} onClick={() => run(apiFetch(`/api/v1/auth/sessions/${s.id}`, { method: 'DELETE', body: {} }))}>
              {t('auth.revoke')}
            </button>
          )}
        </div>
      ))}
      {items.length > 1 && (
        <button className="btn btn-ghost" disabled={busy} onClick={() => run(apiFetch('/api/v1/auth/sessions', { method: 'DELETE', body: {} }))}>
          {t('auth.revoke_others')}
        </button>
      )}
    </div>
  );
}
