'use client';

import Link from 'next/link';
import { formatDateTime } from '@/lib/format';
import { useNotificationSignal } from '@/lib/client/realtime';
import { useLocale, useT } from '../I18n';
import { DataState, PageHead, useApi } from './hooks';

interface Overview {
  deployment: string;
  payments: { state: 'disconnected' | 'sandbox' | 'test' | 'live'; provider: string | null; sandboxAvailable: boolean; moyasarAdapterEnabled: boolean; pending: number };
  ai: {
    state: 'not_configured' | 'configured_untested' | 'live_verified';
    provider: string | null;
    model: string | null;
    lastSuccessAt: string | null;
    budget: { included: boolean; remaining: number | null; code?: string };
    usage: { runs: number; tokensIn: number; tokensOut: number; costMicroUsd: number };
    recent: { purpose: string; status: string; errorCode: string | null; createdAt: string }[];
  };
  messaging: { providers: Record<'whatsapp' | 'sms' | 'email', 'connected' | 'dev_outbox' | 'disconnected'>; simulatedLast30: number };
  einvoicing: { state: string; taxRegistered: boolean; vatNumberSet: boolean; invoicesLast30: number; withQrLast30: number };
  realtime: { transport: string; fallback: string; listening: boolean; streams: number };
}

const B: Record<string, string> = { live: 'green', live_verified: 'green', connected: 'green', test: 'blue', sandbox: 'blue', dev_outbox: 'amber', configured_untested: 'amber', disconnected: 'red', not_configured: 'red', not_connected: 'red' };

/** One honest page: what is connected, what is simulated, what waits for an account or key. */
export function IntegrationsView({ tenant, tz }: { tenant: string; tz: string }) {
  const t = useT();
  const locale = useLocale();
  const d = useApi<Overview>(`/api/v1/t/${tenant}/integrations`);
  const rt = useNotificationSignal();
  const base = `/app/${tenant}`;
  return (
    <>
      <PageHead title={t('int.title')} />
      <p className="small muted">{t('int.intro')} <span className="badge">{d.data?.deployment}</span></p>
      <DataState loading={d.loading && !d.data} error={d.error} onRetry={d.reload} rows={6}>
        {d.data && (
          <div className="grid cols-2">
            <section className="card stack">
              <div className="row between"><h3>{t('int.payments')}</h3><span className={`badge ${B[d.data.payments.state]}`}>{t(`int.pay.${d.data.payments.state}`)}</span></div>
              <p className="small">{t(`int.pay_hint.${d.data.payments.state}`)}</p>
              {d.data.payments.pending > 0 && <p className="small"><span className="badge amber">{t('pay.status.pending_verification')}</span> {t('int.pay_pending')}</p>}
              <p className="small muted">{t('int.pay_waiting')}</p>
              <Link className="btn btn-sm" href={`${base}/settings?tab=payments`}>{t('int.open_payments')}</Link>
            </section>

            <section className="card stack">
              <div className="row between"><h3>{t('int.ai')}</h3><span className={`badge ${B[d.data.ai.state]}`}>{t(`int.ai_state.${d.data.ai.state}`)}</span></div>
              <p className="small">{t(`int.ai_hint.${d.data.ai.state}`)}</p>
              {d.data.ai.model && <p className="small mono">{d.data.ai.provider} · {d.data.ai.model}</p>}
              {d.data.ai.lastSuccessAt && <p className="small muted">{t('int.ai_last_ok')}: {formatDateTime(d.data.ai.lastSuccessAt, { tz, locale })}</p>}
              <div className="small">
                {t('int.ai_runs_month')}: <strong className="ltr-num">{d.data.ai.usage.runs}</strong>
                {' · '}
                {!d.data.ai.budget.included ? t('int.ai_not_in_plan') : d.data.ai.budget.remaining === null ? t('int.ai_unlimited') : t('int.ai_remaining', { n: d.data.ai.budget.remaining })}
              </div>
              {d.data.ai.usage.tokensIn > 0 && <div className="small muted ltr-num">{t('int.ai_tokens', { a: d.data.ai.usage.tokensIn, b: d.data.ai.usage.tokensOut })}</div>}
              {d.data.ai.recent.length > 0 && (
                <details><summary className="small">{t('int.ai_recent')}</summary>
                  <ul className="small">{d.data.ai.recent.map((r, i) => <li key={i}>{formatDateTime(r.createdAt, { tz, locale })} · {r.purpose} · <span className={`badge ${r.status === 'succeeded' ? 'green' : r.status === 'cached' ? 'blue' : 'red'}`}>{r.status}</span>{r.errorCode ? ` (${r.errorCode})` : ''}</li>)}</ul>
                </details>
              )}
              <p className="small muted">{t('int.ai_key_server')}</p>
            </section>

            <section className="card stack">
              <div className="row between"><h3>{t('int.messaging')}</h3></div>
              <div className="row">{(['whatsapp', 'sms', 'email'] as const).map((c) => <span key={c} className={`badge ${B[d.data!.messaging.providers[c]]}`}>{t(`msg.ch.${c}`)}: {t(`msg.provider.${d.data!.messaging.providers[c]}`)}</span>)}</div>
              <p className="small">{t('int.msg_hint', { n: d.data.messaging.simulatedLast30 })}</p>
              <Link className="btn btn-sm" href={`${base}/messages`}>{t('int.open_messages')}</Link>
            </section>

            <section className="card stack">
              <div className="row between"><h3>{t('int.einvoicing')}</h3><span className={`badge ${B[d.data.einvoicing.state] ?? 'red'}`}>{t('int.einv_not_connected')}</span></div>
              <p className="small">{t('int.einv_hint')}</p>
              <ul className="small">
                <li>{d.data.einvoicing.taxRegistered ? '✓' : '✗'} {t('int.einv_registered')}</li>
                <li>{d.data.einvoicing.vatNumberSet ? '✓' : '✗'} {t('int.einv_vat')}</li>
                <li>{t('int.einv_count', { n: d.data.einvoicing.invoicesLast30, q: d.data.einvoicing.withQrLast30 })}</li>
              </ul>
              <Link className="btn btn-sm" href={`${base}/settings?tab=finance`}>{t('int.open_tax')}</Link>
            </section>

            <section className="card stack">
              <div className="row between"><h3>{t('int.realtime')}</h3><span className={`badge ${rt.mode === 'live' ? 'green' : 'amber'}`}>{t(`rt.mode.${rt.mode}`)}</span></div>
              <p className="small">{t('int.rt_hint')}</p>
              <p className="small muted">{t(`rt.mode_hint.${rt.mode}`)}</p>
            </section>
          </div>
        )}
      </DataState>
    </>
  );
}
