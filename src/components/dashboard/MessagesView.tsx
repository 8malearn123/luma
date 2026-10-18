'use client';

import { useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/client/api';
import { formatDateTime } from '@/lib/format';
import { useLocale, useT } from '../I18n';
import { Drawer, EmptyState, ErrorAlert, Field, useSubmit, useUnsavedGuard } from '../ui/forms';
import { useToast } from '../ui/Toast';
import { DataState, PageHead, Tabs, useApi, useUrlTab } from './hooks';

type Channel = 'whatsapp' | 'sms' | 'email';
type ProviderState = 'connected' | 'dev_outbox' | 'disconnected';
interface Settings { senderName: string | null; replyToEmail: string | null; emailEnabled: boolean; smsEnabled: boolean; whatsappEnabled: boolean; reminderHours: number[]; quietStart: string | null; quietEnd: string | null }
interface Tpl { key: string; channel: Channel; locale: 'ar' | 'en'; subject: string | null; body: string; isActive: boolean; custom: boolean; version: number; updatedAt: string | null }

const PROVIDER_BADGE: Record<ProviderState, string> = { connected: 'green', dev_outbox: 'amber', disconnected: 'red' };

/** Messages: channel preferences, templates, delivery log and a simulated test send. */
export function MessagesView({ tenant, tz }: { tenant: string; tz: string }) {
  const t = useT();
  const [tab, setTab] = useUrlTab('templates');
  const s = useApi<{ settings: Settings; providers: Record<Channel, ProviderState> }>(`/api/v1/t/${tenant}/messaging/settings`);
  return (
    <>
      <PageHead title={t('msg.title')} />
      <div className="alert warn" role="note">{t('msg.honest_banner')}</div>
      {s.data && (
        <div className="row" style={{ margin: '10px 0' }}>
          {(['whatsapp', 'sms', 'email'] as Channel[]).map((c) => (
            <span key={c} className={`badge ${PROVIDER_BADGE[s.data!.providers[c]]}`}>{t(`msg.ch.${c}`)}: {t(`msg.provider.${s.data!.providers[c]}`)}</span>
          ))}
        </div>
      )}
      <Tabs tabs={[{ key: 'templates', label: t('msg.templates') }, { key: 'channels', label: t('msg.channels') }, { key: 'log', label: t('msg.log') }]} value={tab} onChange={setTab} />
      {tab === 'channels' && (
        <DataState loading={s.loading && !s.data} error={s.error} onRetry={s.reload}>
          {s.data && <ChannelsForm tenant={tenant} data={s.data.settings} providers={s.data.providers} onSaved={s.reload} />}
        </DataState>
      )}
      {tab === 'templates' && <Templates tenant={tenant} />}
      {tab === 'log' && <DeliveryLog tenant={tenant} tz={tz} />}
    </>
  );
}

function ChannelsForm({ tenant, data, providers, onSaved }: { tenant: string; data: Settings; providers: Record<Channel, ProviderState>; onSaved: () => void }) {
  const t = useT();
  const toast = useToast();
  const [v, setV] = useState({ ...data, reminders: data.reminderHours.join(', '), senderName: data.senderName ?? '', replyToEmail: data.replyToEmail ?? '', quietStart: data.quietStart ?? '', quietEnd: data.quietEnd ?? '' });
  const [dirty, setDirty] = useState(false);
  useUnsavedGuard(dirty);
  const set = (p: Partial<typeof v>) => { setV({ ...v, ...p }); setDirty(true); };
  const s = useSubmit<unknown, unknown>(`/api/v1/t/${tenant}/messaging/settings`, 'PUT');
  const hours = v.reminders.split(/[,،\s]+/).map((x) => Number(x)).filter((x) => Number.isInteger(x) && x > 0);
  return (
    <form className="card stack" onSubmit={async (e) => {
      e.preventDefault();
      if (await s.submit({ senderName: v.senderName || null, replyToEmail: v.replyToEmail || null, emailEnabled: v.emailEnabled, smsEnabled: v.smsEnabled, whatsappEnabled: v.whatsappEnabled, reminderHours: hours, quietStart: v.quietStart || null, quietEnd: v.quietEnd || null })) {
        setDirty(false); toast(t('common.saved'), 'ok'); onSaved();
      }
    }}>
      <ErrorAlert error={s.error} />
      <p className="small muted">{t('msg.channels_hint')}</p>
      {(['whatsapp', 'sms', 'email'] as Channel[]).map((c) => {
        const k = `${c}Enabled` as 'whatsappEnabled' | 'smsEnabled' | 'emailEnabled';
        return (
          <label key={c} className="check">
            <input type="checkbox" checked={v[k]} onChange={(e) => set({ [k]: e.target.checked } as Partial<typeof v>)} /> {t(`msg.ch.${c}`)}
            {providers[c] !== 'connected' && <span className="small muted"> — {t('msg.pref_saved_not_sent')}</span>}
          </label>
        );
      })}
      <div className="grid cols-2">
        <Field label={t('msg.sender_name')} hint={t('msg.sender_name_hint')}>{(p) => <input {...p} className="input" maxLength={40} value={v.senderName} onChange={(e) => set({ senderName: e.target.value })} />}</Field>
        <Field label={t('msg.reply_to')} error={s.fieldErrors.replyToEmail}>{(p) => <input {...p} type="email" className="input input-ltr" value={v.replyToEmail} onChange={(e) => set({ replyToEmail: e.target.value })} />}</Field>
        <Field label={t('msg.reminders')} hint={t('msg.reminders_hint')}>{(p) => <input {...p} className="input input-ltr" value={v.reminders} onChange={(e) => set({ reminders: e.target.value })} />}</Field>
        <div />
        <Field label={t('msg.quiet_start')} hint={t('msg.quiet_hint')}>{(p) => <input {...p} type="time" className="input input-ltr" value={v.quietStart} onChange={(e) => set({ quietStart: e.target.value })} />}</Field>
        <Field label={t('msg.quiet_end')}>{(p) => <input {...p} type="time" className="input input-ltr" value={v.quietEnd} onChange={(e) => set({ quietEnd: e.target.value })} />}</Field>
      </div>
      <div className="form-actions"><button type="submit" className="btn btn-gold" disabled={s.busy || !dirty}>{t('common.save')}</button></div>
    </form>
  );
}

function Templates({ tenant }: { tenant: string }) {
  const t = useT();
  const d = useApi<{ items: Tpl[]; vars: Record<string, string[]> }>(`/api/v1/t/${tenant}/messaging/templates`);
  const [locale, setLocale] = useState<'ar' | 'en'>('ar');
  const [edit, setEdit] = useState<Tpl | null>(null);
  const groups = useMemo(() => {
    const g = new Map<string, Tpl[]>();
    for (const x of d.data?.items ?? []) if (x.locale === locale) g.set(x.key, [...(g.get(x.key) ?? []), x]);
    return [...g.entries()];
  }, [d.data, locale]);
  return (
    <DataState loading={d.loading && !d.data} error={d.error} onRetry={d.reload} rows={6}>
      <div className="toolbar">
        <select className="input" style={{ maxWidth: 160 }} aria-label={t('st.locale')} value={locale} onChange={(e) => setLocale(e.target.value as 'ar')}><option value="ar">العربية</option><option value="en">English</option></select>
        <span className="small muted">{t('msg.templates_hint')}</span>
      </div>
      <div className="stack">
        {groups.map(([key, list]) => (
          <section key={key} className="card">
            <div className="row between"><strong>{t(`msg.key.${key}`)}</strong>{key === 'verification_code' && <span className="badge">{t('msg.platform_owned')}</span>}</div>
            <div className="small muted" style={{ marginBottom: 6 }}>{t('msg.vars')}: <span className="mono" dir="ltr">{(d.data!.vars[key] ?? []).map((v) => `{${v}}`).join(' ')}</span></div>
            {list.map((x) => (
              <div key={x.channel} className="row between" style={{ padding: '6px 0', borderTop: '1px solid var(--line-soft)', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <span className="badge">{t(`msg.ch.${x.channel}`)}</span> {x.custom ? <span className="badge gold">{t('msg.custom')}</span> : <span className="badge">{t('msg.default')}</span>} {!x.isActive && <span className="badge red">{t('msg.inactive')}</span>}
                  {x.subject && <div className="small"><strong>{x.subject}</strong></div>}
                  <div className="small" style={{ whiteSpace: 'pre-line' }} dir={locale === 'ar' ? 'rtl' : 'ltr'}>{x.body}</div>
                </div>
                {key !== 'verification_code' && <button type="button" className="btn btn-quiet btn-sm" onClick={() => setEdit(x)}>{t('common.edit')}</button>}
              </div>
            ))}
          </section>
        ))}
      </div>
      {edit && <TemplateEditor tenant={tenant} tpl={edit} vars={d.data?.vars[edit.key] ?? []} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); void d.reload(); }} />}
    </DataState>
  );
}

const SAMPLE_AR: Record<string, string> = { customer_name: 'سارة', business_name: 'صالونك', booking_number: 'BKG-000123', date: '2026-11-02', time: '16:30', services: 'قص وتصفيف', order_number: 'ORD-000045', total: '120.00 ر.س', tracking: 'https://…', return_number: 'RET-000007', status: 'تمت الموافقة', code: '123456' };

function TemplateEditor({ tenant, tpl, vars, onClose, onSaved }: { tenant: string; tpl: Tpl; vars: string[]; onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const toast = useToast();
  const [v, setV] = useState({ subject: tpl.subject ?? '', body: tpl.body, isActive: tpl.isActive });
  const save = useSubmit<unknown, unknown>(`/api/v1/t/${tenant}/messaging/templates`, 'PUT');
  const test = useSubmit<unknown, { status: string; providerStatus: string; outbox: boolean; destination: string | null; preview: string }>(`/api/v1/t/${tenant}/messaging/test`);
  const [result, setResult] = useState<{ preview: string; destination: string | null; providerStatus: string; outbox: boolean } | null>(null);
  const unknown = [...new Set([...(v.body + v.subject).matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]).filter((x) => !vars.includes(x)))];
  const preview = v.body.replace(/\{([a-z_]+)\}/g, (all, k: string) => SAMPLE_AR[k] ?? all);
  return (
    <Drawer title={`${t(`msg.key.${tpl.key}`)} · ${t(`msg.ch.${tpl.channel}`)}`} onClose={onClose}>
      <form className="stack" onSubmit={async (e) => { e.preventDefault(); if (await save.submit({ key: tpl.key, channel: tpl.channel, locale: tpl.locale, subject: tpl.channel === 'email' ? v.subject : null, body: v.body, isActive: v.isActive })) { toast(t('common.saved'), 'ok'); onSaved(); } }}>
        <ErrorAlert error={save.error ?? test.error} />
        {tpl.channel === 'email' && <Field label={t('msg.subject')} required>{(p) => <input {...p} className="input" maxLength={150} value={v.subject} onChange={(e) => setV({ ...v, subject: e.target.value })} />}</Field>}
        <Field label={t('msg.body')} required hint={tpl.channel === 'sms' ? t('msg.sms_len', { n: v.body.length }) : undefined}>
          {(p) => <textarea {...p} className="input" rows={6} maxLength={2000} dir={tpl.locale === 'ar' ? 'rtl' : 'ltr'} value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} />}
        </Field>
        <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>
          {vars.map((x) => <button key={x} type="button" className="btn btn-quiet btn-sm mono" onClick={() => setV({ ...v, body: `${v.body}{${x}}` })}>{`{${x}}`}</button>)}
        </div>
        {unknown.length > 0 && <div className="alert error small" role="alert">{t('errors.template_unknown_vars')}: <span className="mono">{unknown.join(', ')}</span></div>}
        <div className="card small" style={{ whiteSpace: 'pre-line' }}><div className="muted">{t('msg.preview')}</div>{preview}</div>
        <label className="check"><input type="checkbox" checked={v.isActive} onChange={(e) => setV({ ...v, isActive: e.target.checked })} /> {t('common.active')}</label>
        <div className="form-actions">
          {tpl.custom && (
            <button type="button" className="btn btn-quiet btn-sm" onClick={async () => { await apiFetch(`/api/v1/t/${tenant}/messaging/templates?key=${tpl.key}&channel=${tpl.channel}&locale=${tpl.locale}`, { method: 'DELETE' }); toast(t('msg.reset_done'), 'ok'); onSaved(); }}>{t('msg.reset')}</button>
          )}
          <button type="button" className="btn btn-sm" disabled={test.busy} onClick={async () => { const r = await test.submit({ key: tpl.key, channel: tpl.channel, locale: tpl.locale }); if (r) setResult(r); }}>{t('msg.test_send')}</button>
          <button type="submit" className="btn btn-gold btn-sm" disabled={save.busy || unknown.length > 0 || !v.body.trim()}>{t('common.save')}</button>
        </div>
        <p className="small muted">{t('msg.test_hint')}</p>
        {result && (
          <div className="alert info small" role="status">
            <div>{t('msg.test_result', { dest: result.destination ?? '—', state: t(`msg.provider.${result.providerStatus}`) })}{result.outbox ? ` ${t('msg.test_outbox')}` : ''}</div>
            <div style={{ whiteSpace: 'pre-line', marginTop: 4 }}>{result.preview}</div>
          </div>
        )}
      </form>
    </Drawer>
  );
}

interface LogRow { id: string; channel: string; template: string; status: string; provider: string | null; recipientRef: string | null; attempts: number; error: string | null; isTest: boolean; preview: string | null; createdAt: string }

function DeliveryLog({ tenant, tz }: { tenant: string; tz: string }) {
  const t = useT();
  const locale = useLocale();
  const [channel, setChannel] = useState('');
  const [status, setStatus] = useState('');
  const [offset, setOffset] = useState(0);
  useEffect(() => setOffset(0), [channel, status]);
  const d = useApi<{ items: LogRow[]; hasMore: boolean; last30: { simulated: number; sent: number; failed: number; total: number } }>(`/api/v1/t/${tenant}/messaging/log?${new URLSearchParams({ ...(channel ? { channel } : {}), ...(status ? { status } : {}), offset: String(offset) })}`);
  return (
    <DataState loading={d.loading && !d.data} error={d.error} onRetry={d.reload} rows={6}>
      {d.data && (
        <>
          <div className="grid cols-3" style={{ marginBottom: 10 }}>
            <div className="card stat"><div className="k">{t('msg.last30_simulated')}</div><div className="v ltr-num">{d.data.last30.simulated}</div></div>
            <div className="card stat"><div className="k">{t('msg.last30_sent')}</div><div className="v ltr-num">{d.data.last30.sent}</div></div>
            <div className="card stat"><div className="k">{t('msg.last30_failed')}</div><div className="v ltr-num">{d.data.last30.failed}</div></div>
          </div>
          <div className="toolbar">
            <select className="input" style={{ maxWidth: 170 }} aria-label={t('msg.channel')} value={channel} onChange={(e) => setChannel(e.target.value)}><option value="">{t('common.all')}</option>{['whatsapp', 'sms', 'email'].map((c) => <option key={c} value={c}>{t(`msg.ch.${c}`)}</option>)}</select>
            <select className="input" style={{ maxWidth: 170 }} aria-label={t('common.status')} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">{t('common.all')}</option>{['simulated', 'queued', 'sent', 'delivered', 'failed', 'suppressed'].map((c) => <option key={c} value={c}>{t(`msg.st.${c}`)}</option>)}</select>
          </div>
          {!d.data.items.length ? <div className="card"><EmptyState icon="mega" title={t('msg.log_empty')} /></div> : (
            <div className="table-wrap"><table className="table">
              <thead><tr><th>{t('common.date')}</th><th>{t('msg.channel')}</th><th>{t('msg.template')}</th><th>{t('msg.recipient')}</th><th>{t('common.status')}</th></tr></thead>
              <tbody>{d.data.items.map((r) => (
                <tr key={r.id} title={r.preview ?? undefined}>
                  <td className="small">{formatDateTime(r.createdAt, { tz, locale })}</td>
                  <td>{t(`msg.ch.${r.channel}`)}</td>
                  <td className="small">{r.template.startsWith('campaign:') ? t('msg.campaign') : t(`msg.key.${r.template}`)}{r.isTest && <span className="badge" style={{ marginInlineStart: 4 }}>{t('msg.test')}</span>}</td>
                  <td className="mono small" dir="ltr">{r.recipientRef ?? '—'}</td>
                  <td><span className={`badge ${r.status === 'simulated' ? 'amber' : r.status === 'failed' ? 'red' : 'green'}`}>{t(`msg.st.${r.status}`)}</span></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
          <div className="row" style={{ marginTop: 8 }}>
            {offset > 0 && <button type="button" className="btn btn-quiet btn-sm" onClick={() => setOffset(Math.max(0, offset - 50))}>{t('common.back')}</button>}
            {d.data.hasMore && <button type="button" className="btn btn-quiet btn-sm" onClick={() => setOffset(offset + 50)}>{t('account.load_more')}</button>}
          </div>
        </>
      )}
    </DataState>
  );
}
