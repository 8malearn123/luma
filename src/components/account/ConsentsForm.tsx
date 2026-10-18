'use client';

import { useState } from 'react';
import { ApiError, apiFetch } from '@/lib/client/api';
import { useT } from '../I18n';
import { ErrorAlert } from '../ui/forms';
import { useToast } from '../ui/Toast';

const CHANNELS = ['email', 'sms', 'whatsapp'] as const;

export function ConsentsForm({ items }: { items: { tenantId: string; name: string; slug: string; channels: Record<string, boolean> }[] }) {
  const t = useT();
  const toast = useToast();
  const [state, setState] = useState(items);
  const [err, setErr] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  async function toggle(tenantId: string, channel: (typeof CHANNELS)[number], granted: boolean) {
    const k = `${tenantId}:${channel}`;
    setBusy(k);
    setErr(null);
    try {
      await apiFetch('/api/v1/me/consents', { method: 'POST', body: { tenantId, channel, granted } });
      setState((s) => s.map((x) => (x.tenantId === tenantId ? { ...x, channels: { ...x.channels, [channel]: granted } } : x)));
      toast(t('account.consent_saved'), 'ok');
    } catch (e) {
      setErr(e as ApiError);
    } finally {
      setBusy(null);
    }
  }
  return (
    <>
      <ErrorAlert error={err} />
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t('account.business')}</th>
              {CHANNELS.map((c) => <th key={c}>{t(`account.channel.${c}`)}</th>)}
            </tr>
          </thead>
          <tbody>
            {state.map((r) => (
              <tr key={r.tenantId}>
                <td>{r.name}</td>
                {CHANNELS.map((c) => (
                  <td key={c}>
                    <label className="check">
                      <input type="checkbox" checked={!!r.channels[c]} disabled={busy === `${r.tenantId}:${c}`} onChange={(e) => toggle(r.tenantId, c, e.target.checked)} aria-label={`${r.name} — ${t(`account.channel.${c}`)}`} />
                    </label>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
