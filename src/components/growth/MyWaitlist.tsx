'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiFetch, ApiError, newIdempotencyKey } from '@/lib/client/api';
import { formatDateTime } from '@/lib/format';
import { useLocale, useT } from '../I18n';
import { Icon } from '../Icon';
import { EmptyState, ErrorAlert } from '../ui/forms';
import { useToast } from '../ui/Toast';

export interface MyEntry {
  id: string;
  status: string;
  desiredFrom: string;
  desiredTo: string;
  serviceName: string;
  serviceNameEn: string | null;
  tenantName: string;
  tenantSlug: string;
  liveOffer: { id: string; slotStart: string; slotEnd: string; expiresAt: string; staffName: string } | null;
}

function Countdown({ until }: { until: string }) {
  const t = useT();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(h);
  }, []);
  const m = Math.max(0, Math.ceil((Date.parse(until) - now) / 60000));
  return <span className="badge amber" aria-live="polite">{t('growth.wl.minutes_left', { m })}</span>;
}

export function MyWaitlist({ items }: { items: MyEntry[] }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const keys = useState<Record<string, string>>({})[0];

  const act = async (e: MyEntry, path: string, body?: unknown, method = 'POST') => {
    setBusy(e.id);
    setError(null);
    keys[path] ??= newIdempotencyKey();
    try {
      await apiFetch(`/api/v1/s/${e.tenantSlug}/waitlist/${path}`, { method, body: body ?? {}, idempotencyKey: keys[path] });
      delete keys[path];
      return true;
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError('internal', 'errors.internal', 500));
      return false;
    } finally {
      setBusy(null);
      router.refresh();
    }
  };

  if (!items.length) return <div className="card"><EmptyState icon="clock" title={t('growth.wl.mine_empty')} /></div>;
  return (
    <div className="stack">
      <ErrorAlert error={error} />
      {items.map((e) => (
        <article key={e.id} className="card">
          <div className="row between">
            <div>
              <strong>{locale === 'en' && e.serviceNameEn ? e.serviceNameEn : e.serviceName}</strong>
              <div className="small muted">{e.tenantName} · <span className="mono">{e.desiredFrom} → {e.desiredTo}</span></div>
            </div>
            <span className="badge">{t(`growth.wl.status.${e.status}`)}</span>
          </div>
          {e.liveOffer && (
            <div className="alert info" style={{ marginTop: 12 }}>
              <Icon name="sparkle" size={18} />
              <div style={{ flex: 1 }}>
                <div><strong>{t('growth.wl.offer_for_you')}</strong>: {formatDateTime(e.liveOffer.slotStart, { locale })} {e.liveOffer.staffName && `· ${e.liveOffer.staffName}`}</div>
                <div className="small">{t('growth.wl.offer_note')}</div>
                <div className="row" style={{ marginTop: 8 }}>
                  <Countdown until={e.liveOffer.expiresAt} />
                  <button
                    type="button"
                    className="btn btn-gold btn-sm"
                    disabled={busy === e.id}
                    onClick={async () => {
                      if (await act(e, `offers/${e.liveOffer!.id}/accept`, { termsKind: 'on_site' })) {
                        toast(t('growth.wl.accepted'), 'ok');
                        router.push('/account');
                      }
                    }}
                  >
                    {t('growth.wl.accept')}
                  </button>
                  <button type="button" className="btn btn-quiet btn-sm" disabled={busy === e.id} onClick={() => act(e, `offers/${e.liveOffer!.id}/decline`)}>
                    {t('growth.wl.decline')}
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="row" style={{ marginTop: 10 }}>
            <Link href={`/s/${e.tenantSlug}`} className="btn btn-quiet btn-sm">{e.tenantName}</Link>
            <button type="button" className="btn btn-quiet btn-sm" disabled={busy === e.id} onClick={() => act(e, `entries/${e.id}`, undefined, 'DELETE')}>
              {t('growth.wl.leave')}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
