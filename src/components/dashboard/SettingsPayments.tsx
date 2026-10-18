'use client';

import { useEffect, useState } from 'react';
import { formatDateTime } from '@/lib/format';
import { useLocale, useT } from '../I18n';
import { ErrorAlert, Field, useSubmit } from '../ui/forms';
import { useToast } from '../ui/Toast';
import { DataState, statusBadge, useApi } from './hooks';
import { StepUp } from './FinanceView';

interface Account {
  id: string;
  provider: string;
  mode: string;
  status: string;
  methodsEnabled: string[];
  publishableKey: string | null;
  keyHint: string | null;
  lastTestAt: string | null;
  lastTestResult: 'ok' | 'failed' | 'unreachable' | null;
  lastTestDetail: string | null;
  verifiedAt: string | null;
  createdAt: string;
}
interface Data {
  accounts: Account[];
  webhookUrl: string;
  adapterEnabled: boolean;
  liveAllowed: boolean;
  deployment: string;
  providers: { key: string; available: boolean; status: string; methods: string[] }[];
}

/**
 * Settings → Payments. Sandbox (development/review, no money) and the
 * business's own Moyasar account: keys are sent once to the server, stored
 * encrypted and never shown again (only a hint). Honest states throughout:
 * the Moyasar adapter is untested from this environment.
 */
export function PaymentsSettings({ tenant, canConfigure, tz }: { tenant: string; canConfigure: boolean; tz: string }) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const d = useApi<Data>(`/api/v1/t/${tenant}/payments`);
  const connect = useSubmit<unknown, unknown>(`/api/v1/t/${tenant}/payments`);
  const disconnect = useSubmit<unknown, unknown>(`/api/v1/t/${tenant}/payments`, 'DELETE');
  const active = d.data?.accounts.find((a) => a.status === 'active');
  const pending = d.data?.accounts.find((a) => a.provider === 'moyasar' && a.status === 'pending_verification');
  const sandbox = d.data?.providers.find((p) => p.key === 'sandbox');
  return (
    <DataState loading={d.loading && !d.data} error={d.error} onRetry={d.reload} rows={5}>
      {d.data && (
        <div className="stack">
          <section className="card stack">
            <h3>{t('pay.current')}</h3>
            <ErrorAlert error={connect.error ?? disconnect.error} />
            {active ? (
              <div className="row between">
                <span>
                  {active.provider === 'sandbox' ? t('st.sandbox') : 'Moyasar'} <span className="badge green">{t(`pay.status.${active.status}`)}</span>{' '}
                  <span className={`badge ${active.mode === 'live' ? 'red' : 'blue'}`}>{t(`pay.mode.${active.mode}`)}</span>
                  <div className="small muted">{t('st.methods')}: {active.methodsEnabled.map((x) => t(`pay.method.${x}`)).join('، ') || '—'}</div>
                </span>
                {canConfigure && <button type="button" className="btn btn-danger btn-sm" disabled={disconnect.busy} onClick={async () => { if (await disconnect.submit()) { toast(t('common.saved'), 'ok'); void d.reload(); } }}>{t('st.disconnect')}</button>}
              </div>
            ) : (
              <div className="alert warn">{t('st.no_provider')}</div>
            )}
            {canConfigure && !active && sandbox?.available && (
              <div>
                <button type="button" className="btn btn-ghost btn-sm" disabled={connect.busy} onClick={async () => { if (await connect.submit({ provider: 'sandbox' })) { toast(t('common.saved'), 'ok'); void d.reload(); } }}>{t('st.connect_sandbox')}</button>
                <div className="small muted">{t('pay.sandbox_hint')}</div>
              </div>
            )}
          </section>

          <section className="card stack">
            <div className="row between">
              <h3>{t('pay.moyasar_title')}</h3>
              <span className={`badge ${d.data.adapterEnabled ? 'amber' : ''}`}>{d.data.adapterEnabled ? t('pay.adapter_untested') : t('pay.adapter_disabled')}</span>
            </div>
            <p className="small muted">{t('pay.moyasar_intro')}</p>
            <ol className="small" style={{ margin: 0, paddingInlineStart: 18 }}>
              <li>{t('pay.step1')}</li>
              <li>{t('pay.step2')}</li>
              <li>{t('pay.step3')}</li>
              <li>{t('pay.step4')}</li>
            </ol>
            <Field label={t('pay.webhook_url')} hint={t('pay.webhook_url_hint')}>{(p) => <input {...p} className="input input-ltr mono" readOnly value={d.data!.webhookUrl} onFocus={(e) => e.currentTarget.select()} />}</Field>
            {pending && <PendingAccount tenant={tenant} a={pending} canConfigure={canConfigure} adapterEnabled={d.data.adapterEnabled} liveAllowed={d.data.liveAllowed} tz={tz} onChanged={d.reload} />}
            {canConfigure && <MoyasarKeysForm tenant={tenant} methods={d.data.providers.find((p) => p.key === 'moyasar')?.methods ?? []} replacing={!!pending || active?.provider === 'moyasar'} onSaved={d.reload} />}
            {!canConfigure && <div className="small muted">{t('pay.view_only')}</div>}
          </section>

          {d.data.accounts.length > 0 && (
            <details className="card">
              <summary>{t('pay.history')}</summary>
              <table className="table"><tbody>
                {d.data.accounts.map((a) => (
                  <tr key={a.id}><td>{a.provider}</td><td>{t(`pay.mode.${a.mode}`)}</td><td><span className={`badge ${statusBadge(a.status)}`}>{t(`pay.status.${a.status}`)}</span></td><td className="mono small">{a.keyHint ?? ''}</td><td className="small">{formatDateTime(a.createdAt, { tz, locale })}</td></tr>
                ))}
              </tbody></table>
            </details>
          )}
        </div>
      )}
    </DataState>
  );
}

const detailKey = (d: string | null) => (!d ? 'none' : d.startsWith('http_') ? (d.includes('unauthorized') ? 'http_unauthorized' : /^http_2/.test(d) ? 'http_ok' : 'http_error') : d);

function PendingAccount({ tenant, a, canConfigure, adapterEnabled, liveAllowed, tz, onChanged }: { tenant: string; a: Account; canConfigure: boolean; adapterEnabled: boolean; liveAllowed: boolean; tz: string; onChanged: () => void }) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const test = useSubmit<unknown, { result: string; detail: string }>(`/api/v1/t/${tenant}/payments/moyasar/${a.id}/test`);
  const activate = useSubmit<unknown, unknown>(`/api/v1/t/${tenant}/payments/moyasar/${a.id}/activate`);
  const remove = useSubmit<unknown, unknown>(`/api/v1/t/${tenant}/payments/moyasar/${a.id}`, 'DELETE');
  const [needStep, setNeedStep] = useState(false);
  useEffect(() => {
    if (activate.error?.message === 'errors.step_up_required') setNeedStep(true);
  }, [activate.error]);
  const fresh = a.lastTestResult === 'ok' && a.lastTestAt && Date.now() - new Date(a.lastTestAt).getTime() < 24 * 3600000;
  const blockedLive = a.mode === 'live' && !liveAllowed;
  const doActivate = async () => { if (await activate.submit({})) { toast(t('pay.activated'), 'ok'); onChanged(); } };
  return (
    <div className="card stack" style={{ borderColor: 'var(--gold)' }}>
      <div className="row between">
        <strong>{t('pay.pending_title')}</strong>
        <span className="row"><span className={`badge ${a.mode === 'live' ? 'red' : 'blue'}`}>{t(`pay.mode.${a.mode}`)}</span><span className="badge amber">{t('pay.status.pending_verification')}</span></span>
      </div>
      <div className="small">{t('pay.keys_saved')}: <span className="mono">{a.publishableKey ? `${a.publishableKey.slice(0, 12)}…` : ''}</span> · <span className="mono">{a.keyHint}</span></div>
      <div className="small">{t('st.methods')}: {a.methodsEnabled.map((x) => t(`pay.method.${x}`)).join('، ')}</div>
      <div className="small">
        {t('pay.last_test')}: {a.lastTestAt ? <><span className={`badge ${a.lastTestResult === 'ok' ? 'green' : a.lastTestResult === 'failed' ? 'red' : 'amber'}`}>{t(`pay.test.${a.lastTestResult}`)}</span> <span className="muted">{formatDateTime(a.lastTestAt, { tz, locale })} · {t(`pay.detail.${detailKey(a.lastTestDetail)}`)} <span className="mono">{a.lastTestDetail}</span></span></> : t('pay.never_tested')}
      </div>
      {!adapterEnabled && <div className="alert warn small">{t('pay.adapter_disabled_hint')}</div>}
      {blockedLive && <div className="alert warn small">{t('pay.live_blocked')}</div>}
      <ErrorAlert error={test.error ?? (activate.error?.message === 'errors.step_up_required' ? null : activate.error) ?? remove.error} />
      {canConfigure && (needStep ? <StepUp onDone={() => { setNeedStep(false); void doActivate(); }} onCancel={() => setNeedStep(false)} /> : (
        <div className="row">
          <button type="button" className="btn btn-sm" disabled={test.busy} onClick={async () => { const r = await test.submit({}); if (r) { toast(t(`pay.test.${r.result}`), r.result === 'ok' ? 'ok' : 'err'); onChanged(); } }}>{test.busy ? t('common.loading') : t('pay.test_connection')}</button>
          <button type="button" className="btn btn-gold btn-sm" disabled={activate.busy || !fresh || !adapterEnabled || blockedLive} title={!fresh ? t('pay.test_first') : undefined} onClick={doActivate}>{t('pay.activate')}</button>
          <button type="button" className="btn btn-quiet btn-sm" disabled={remove.busy} onClick={async () => { if (await remove.submit()) { toast(t('common.saved'), 'ok'); onChanged(); } }}>{t('pay.remove_keys')}</button>
        </div>
      ))}
    </div>
  );
}

function MoyasarKeysForm({ tenant, methods, replacing, onSaved }: { tenant: string; methods: string[]; replacing: boolean; onSaved: () => void }) {
  const t = useT();
  const toast = useToast();
  const [open, setOpen] = useState(!replacing);
  const [v, setV] = useState({ publishableKey: '', secretKey: '', webhookSecret: '', methods: methods.filter((m) => m !== 'stcpay') });
  const [needStep, setNeedStep] = useState(false);
  const s = useSubmit<unknown, { mode: string }>(`/api/v1/t/${tenant}/payments/moyasar`);
  useEffect(() => {
    if (s.error?.message === 'errors.step_up_required') setNeedStep(true);
  }, [s.error]);
  const go = async () => {
    const r = await s.submit(v);
    if (r) {
      // the secret never stays in the browser after saving
      setV({ publishableKey: '', secretKey: '', webhookSecret: '', methods: v.methods });
      setOpen(false);
      toast(t('pay.keys_saved_toast'), 'ok');
      onSaved();
    }
  };
  if (!open) return <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>{replacing ? t('pay.replace_keys') : t('pay.enter_keys')}</button>;
  if (needStep) return <StepUp onDone={() => { setNeedStep(false); void go(); }} onCancel={() => setNeedStep(false)} />;
  return (
    <form className="stack" autoComplete="off" onSubmit={(e) => { e.preventDefault(); void go(); }}>
      <ErrorAlert error={s.error?.message === 'errors.step_up_required' ? null : s.error} />
      <Field label={t('pay.publishable_key')} required hint="pk_test_… / pk_live_…" error={s.fieldErrors.publishableKey}>{(p) => <input {...p} className="input input-ltr mono" spellCheck={false} value={v.publishableKey} onChange={(e) => setV({ ...v, publishableKey: e.target.value.trim() })} />}</Field>
      <Field label={t('pay.secret_key')} required hint={t('pay.secret_key_hint')} error={s.fieldErrors.secretKey}>{(p) => <input {...p} type="password" autoComplete="new-password" className="input input-ltr mono" spellCheck={false} value={v.secretKey} onChange={(e) => setV({ ...v, secretKey: e.target.value.trim() })} />}</Field>
      <Field label={t('pay.webhook_secret')} required hint={t('pay.webhook_secret_hint')} error={s.fieldErrors.webhookSecret}>{(p) => <input {...p} type="password" autoComplete="new-password" className="input input-ltr mono" spellCheck={false} value={v.webhookSecret} onChange={(e) => setV({ ...v, webhookSecret: e.target.value.trim() })} />}</Field>
      <fieldset className="field">
        <legend>{t('st.methods')}</legend>
        <div className="row">
          {methods.map((m) => (
            <label key={m} className="check"><input type="checkbox" checked={v.methods.includes(m)} onChange={(e) => setV({ ...v, methods: e.target.checked ? [...v.methods, m] : v.methods.filter((x) => x !== m) })} /> {t(`pay.method.${m}`)}</label>
          ))}
        </div>
        <div className="small muted">{t('pay.methods_hint')}</div>
      </fieldset>
      <div className="alert info small">{t('pay.keys_security')}</div>
      <div className="form-actions">
        {replacing && <button type="button" className="btn btn-quiet btn-sm" onClick={() => setOpen(false)}>{t('common.cancel')}</button>}
        <button type="submit" className="btn btn-gold btn-sm" disabled={s.busy || !v.publishableKey || !v.secretKey || v.webhookSecret.length < 20 || !v.methods.length}>{t('pay.save_keys')}</button>
      </div>
    </form>
  );
}
