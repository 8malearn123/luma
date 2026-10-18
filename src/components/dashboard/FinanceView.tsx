'use client';

import { useState } from 'react';
import { apiFetch, ApiError, newIdempotencyKey } from '@/lib/client/api';
import { addDays, utcToWall } from '@/lib/tz';
import { formatDateTime, formatMoney, tzLabel } from '@/lib/format';
import { useLocale, useT } from '../I18n';
import { EmptyState, ErrorAlert, Field, useSubmit } from '../ui/forms';
import { useToast } from '../ui/Toast';
import { DataState, MoneyInput, PageHead, statusBadge, Tabs, useApi, useUrlTab } from './hooks';

interface Report {
  figures: Record<string, { valueMinor: number; basis: string }>;
  profit: { status: 'computed'; valueMinor: number; formula: string } | { status: 'costs_incomplete'; formula: string; missing: string[]; partialMinor: number };
}

const FIG_ORDER = ['bookingValue', 'serviceRevenue', 'productRevenue', 'collectionsOnline', 'collectionsOnSite', 'depositsHeld', 'outstanding', 'refundsSucceeded', 'refundsPending', 'discounts', 'processingFees', 'expenses', 'materialCosts', 'productCosts', 'commissions', 'refundsAfterRecognition'];

/** Password re-entry for sensitive finance actions. */
export function StepUp({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const t = useT();
  const [pw, setPw] = useState('');
  const s = useSubmit<{ password: string }, { ok: boolean }>('/api/v1/auth/step-up');
  return (
    <form className="card" onSubmit={async (e) => { e.preventDefault(); if (await s.submit({ password: pw })) onDone(); }}>
      <h3>{t('auth.step_up_title')}</h3>
      <p className="small muted">{t('errors.step_up_required')}</p>
      <ErrorAlert error={s.error} />
      <Field label={t('auth.password')} required>{(p) => <input {...p} type="password" autoComplete="current-password" className="input input-ltr" value={pw} onChange={(e) => setPw(e.target.value)} />}</Field>
      <div className="form-actions"><button type="button" className="btn btn-quiet btn-sm" onClick={onCancel}>{t('common.cancel')}</button><button type="submit" className="btn btn-gold btn-sm" disabled={s.busy || !pw}>{t('common.confirm')}</button></div>
    </form>
  );
}

export function FinanceView({ tenant, tz, caps }: { tenant: string; tz: string; caps: string[] }) {
  const t = useT();
  const locale = useLocale();
  const today = utcToWall(new Date(), tz).date;
  const [from, setFrom] = useState(`${today.slice(0, 8)}01`);
  const [to, setTo] = useState(today);
  const [tab, setTab] = useUrlTab('summary');
  const can = (c: string) => caps.includes(c);
  const period = `from=${from}&to=${to}`;
  const tabs = [
    can('finance.view') && { key: 'summary', label: t('fi.summary') },
    (can('finance.view') || can('refunds.issue')) && { key: 'payments', label: t('fi.payments') },
    (can('finance.view') || can('refunds.issue')) && { key: 'refunds', label: t('fi.refunds') },
    (can('finance.view') || can('expenses.manage')) && { key: 'expenses', label: t('fi.expenses') },
    can('finance.view') && { key: 'commissions', label: t('fi.commissions') },
    (can('finance.view') || can('payments.collect')) && { key: 'invoices', label: t('fi.invoices') },
    can('finance.export') && { key: 'exports', label: t('fi.exports') },
  ].filter(Boolean) as { key: string; label: string }[];
  const active = tabs.some((x) => x.key === tab) ? tab : tabs[0]?.key;
  return (
    <>
      <PageHead title={t('nav.finance')} crumbs={tzLabel(tz, locale)} />
      <div className="toolbar">
        <label className="label">{t('fi.period')}</label>
        <input type="date" className="input" style={{ maxWidth: 170 }} aria-label={t('common.from')} value={from} max={to} onChange={(e) => setFrom(e.target.value)} />
        <input type="date" className="input" style={{ maxWidth: 170 }} aria-label={t('common.to')} value={to} min={from} onChange={(e) => setTo(e.target.value)} />
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => { setFrom(addDays(today, -6)); setTo(today); }}>7d</button>
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => { setFrom(addDays(today, -29)); setTo(today); }}>30d</button>
      </div>
      <Tabs tabs={tabs} value={active ?? ''} onChange={setTab} />
      {active === 'summary' && <Summary tenant={tenant} period={period} />}
      {active === 'payments' && <Payments tenant={tenant} period={period} tz={tz} canRefund={can('refunds.issue')} />}
      {active === 'refunds' && <Refunds tenant={tenant} tz={tz} canRefund={can('refunds.issue')} />}
      {active === 'expenses' && <Expenses tenant={tenant} period={period} canEdit={can('expenses.manage')} />}
      {active === 'commissions' && <Commissions tenant={tenant} period={period} tz={tz} />}
      {active === 'invoices' && <Invoices tenant={tenant} tz={tz} />}
      {active === 'exports' && <Exports tenant={tenant} from={from} to={to} />}
    </>
  );
}

function Summary({ tenant, period }: { tenant: string; period: string }) {
  const t = useT();
  const locale = useLocale();
  const d = useApi<Report>(`/api/v1/t/${tenant}/finance?${period}`);
  return (
    <DataState loading={d.loading && !d.data} error={d.error} onRetry={d.reload} rows={6}>
      {d.data && (
        <>
          <section className="card" style={{ marginBottom: 14 }}>
            <h2>{t('fi.profit')}</h2>
            {d.data.profit.status === 'computed' ? (
              <div className="stat"><div className="v">{formatMoney(d.data.profit.valueMinor, 'SAR', locale)}</div></div>
            ) : (
              <div className="alert warn">
                <div><strong>{t('fi.profit_incomplete')}</strong></div>
                <ul className="small" style={{ margin: '6px 0' }}>{d.data.profit.missing.map((m) => <li key={m}>{t(`fi.missing.${m}`)}</li>)}</ul>
                <div className="small muted">{t('fi.partial_hint', { v: formatMoney(d.data.profit.partialMinor, 'SAR', locale) })}</div>
              </div>
            )}
            <div className="small muted"><strong>{t('fi.formula')}:</strong> <span dir="ltr">{d.data.profit.formula}</span></div>
          </section>
          <div className="grid cols-3">
            {FIG_ORDER.filter((k) => d.data!.figures[k]).map((k) => (
              <div key={k} className="card stat">
                <div className="k">{t(`fi.fig.${k}`)}</div>
                <div className="v" style={{ fontSize: 20 }}>{formatMoney(d.data!.figures[k].valueMinor, 'SAR', locale)}</div>
                <div className="note" dir="ltr">{d.data!.figures[k].basis}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </DataState>
  );
}

function Payments({ tenant, period, tz, canRefund }: { tenant: string; period: string; tz: string; canRefund: boolean }) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const d = useApi<{ items: { id: string; purpose: string; kind: string; method: string | null; provider: string; amountMinor: number; refundedMinor: number; status: string; collectionRef: string | null; createdAt: string; bookingNumber: string | null; orderNumber: string | null; collectedByName: string | null }[] }>(`/api/v1/t/${tenant}/finance/payments?${period}`);
  const [refund, setRefund] = useState<{ paymentId: string; max: number; amount: number | null; reason: string; key: string } | null>(null);
  const [needStep, setNeedStep] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  async function doRefund() {
    if (!refund) return;
    setBusy(true);
    setErr(null);
    try {
      await apiFetch(`/api/v1/t/${tenant}/finance/refunds`, { method: 'POST', body: { paymentId: refund.paymentId, amountMinor: refund.amount, reason: refund.reason }, idempotencyKey: refund.key });
      toast(t('common.saved'), 'ok');
      setRefund(null);
      void d.reload();
    } catch (e) {
      const x = e as ApiError;
      if (x.message === 'errors.step_up_required') setNeedStep(true);
      else setErr(x);
    } finally {
      setBusy(false);
    }
  }
  return (
    <DataState loading={d.loading && !d.data} error={d.error} onRetry={d.reload}>
      {!d.data?.items.length ? <div className="card"><EmptyState icon="wallet" title={t('common.empty')} /></div> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>{t('common.date')}</th><th>#</th><th>{t('bk.collect_method')}</th><th>{t('bk.amount')}</th><th>{t('common.status')}</th><th>{t('bk.reference')}</th><th /></tr></thead>
          <tbody>{d.data.items.map((p) => (
            <tr key={p.id}>
              <td className="small">{formatDateTime(p.createdAt, { tz, locale })}</td>
              <td className="mono small">{p.bookingNumber ?? p.orderNumber}</td>
              <td className="small">{p.method ?? p.provider}{p.provider === 'sandbox' && <span className="badge amber" style={{ marginInlineStart: 4 }}>{t('common.test_data')}</span>}</td>
              <td>{formatMoney(p.amountMinor, 'SAR', locale)}{p.refundedMinor > 0 && <div className="small muted">−{formatMoney(p.refundedMinor, 'SAR', locale)}</div>}</td>
              <td><span className={`badge ${statusBadge(p.status)}`}>{p.status === 'needs_review' ? t('fi.needs_review') : p.status}</span></td>
              <td className="small">{p.collectionRef ?? ''}{p.collectedByName ? ` · ${p.collectedByName}` : ''}</td>
              <td>{canRefund && p.status === 'succeeded' && p.amountMinor > p.refundedMinor && (
                <button type="button" className="btn btn-sm" onClick={() => setRefund({ paymentId: p.id, max: p.amountMinor - p.refundedMinor, amount: p.amountMinor - p.refundedMinor, reason: '', key: newIdempotencyKey() })}>{t('fi.issue_refund')}</button>
              )}</td>
            </tr>
          ))}</tbody></table></div>
      )}
      {refund && (
        <div className="card" style={{ marginTop: 12 }}>
          <h3>{t('fi.issue_refund')}</h3>
          <p className="small muted">{t('fi.refund_note')}</p>
          {needStep ? <StepUp onDone={() => { setNeedStep(false); void doRefund(); }} onCancel={() => setNeedStep(false)} /> : (
            <form onSubmit={(e) => { e.preventDefault(); void doRefund(); }}>
              <ErrorAlert error={err} />
              <Field label={t('bk.amount')} required hint={`≤ ${formatMoney(refund.max, 'SAR', locale)}`}>{(p) => <MoneyInput {...p} value={refund.amount} onChange={(v) => setRefund({ ...refund, amount: v })} />}</Field>
              <Field label={t('common.reason')} required>{(p) => <input {...p} className="input" value={refund.reason} onChange={(e) => setRefund({ ...refund, reason: e.target.value })} />}</Field>
              <div className="form-actions"><button type="button" className="btn btn-quiet btn-sm" onClick={() => setRefund(null)}>{t('common.cancel')}</button>
                <button type="submit" className="btn btn-danger btn-sm" disabled={busy || !refund.amount || refund.amount > refund.max || refund.reason.trim().length < 3}>{t('fi.issue_refund')}</button></div>
            </form>
          )}
        </div>
      )}
    </DataState>
  );
}

function Refunds({ tenant, tz, canRefund }: { tenant: string; tz: string; canRefund: boolean }) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const d = useApi<{ items: { id: string; amountMinor: number; status: string; reason: string; createdAt: string; completedAt: string | null; provider: string; bookingNumber: string | null; orderNumber: string | null }[] }>(`/api/v1/t/${tenant}/finance/refunds`);
  const [completing, setCompleting] = useState<{ id: string; ref: string; key: string } | null>(null);
  const [needStep, setNeedStep] = useState(false);
  const [err, setErr] = useState<ApiError | null>(null);
  const complete = async () => {
    if (!completing) return;
    try {
      await apiFetch(`/api/v1/t/${tenant}/finance/refunds/${completing.id}/complete`, { method: 'POST', body: { reference: completing.ref }, idempotencyKey: completing.key });
      setCompleting(null);
      toast(t('common.saved'), 'ok');
      void d.reload();
    } catch (e) {
      if ((e as ApiError).message === 'errors.step_up_required') setNeedStep(true);
      else setErr(e as ApiError);
    }
  };
  return (
    <DataState loading={d.loading && !d.data} error={d.error} onRetry={d.reload}>
      <p className="small muted">{t('fi.refund_note')}</p>
      {!d.data?.items.length ? <div className="card"><EmptyState icon="wallet" title={t('common.empty')} /></div> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>{t('common.date')}</th><th>#</th><th>{t('bk.amount')}</th><th>{t('common.status')}</th><th>{t('common.reason')}</th><th /></tr></thead>
          <tbody>{d.data.items.map((r) => (
            <tr key={r.id}><td className="small">{formatDateTime(r.createdAt, { tz, locale })}</td><td className="mono small">{r.bookingNumber ?? r.orderNumber}</td><td>{formatMoney(r.amountMinor, 'SAR', locale)}</td>
              <td><span className={`badge ${statusBadge(r.status)}`}>{r.status}</span></td><td className="small">{r.reason}</td>
              <td>{canRefund && r.provider === 'manual' && r.status === 'pending' && <button type="button" className="btn btn-sm" onClick={() => setCompleting({ id: r.id, ref: '', key: newIdempotencyKey() })}>{t('fi.complete_manual')}</button>}</td></tr>
          ))}</tbody></table></div>
      )}
      {completing && (needStep ? <StepUp onDone={() => { setNeedStep(false); void complete(); }} onCancel={() => setNeedStep(false)} /> : (
        <form className="card" style={{ marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); void complete(); }}>
          <ErrorAlert error={err} />
          <Field label={t('bk.reference')} required>{(p) => <input {...p} className="input" value={completing.ref} onChange={(e) => setCompleting({ ...completing, ref: e.target.value })} />}</Field>
          <button type="submit" className="btn btn-gold btn-sm" disabled={!completing.ref.trim()}>{t('common.confirm')}</button>
        </form>
      ))}
    </DataState>
  );
}

function Expenses({ tenant, period, canEdit }: { tenant: string; period: string; canEdit: boolean }) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const d = useApi<{ items: { id: string; category: string; amountMinor: number; incurredOn: string; description: string | null; voidedAt: string | null; voidReason: string | null; recordedByName: string | null }[] }>(`/api/v1/t/${tenant}/finance/expenses?${period}`);
  const [form, setForm] = useState({ category: 'supplies', amountMinor: null as number | null, incurredOn: new Date().toISOString().slice(0, 10), description: '' });
  const create = useSubmit<unknown, { id: string }>(`/api/v1/t/${tenant}/finance/expenses`);
  const [voiding, setVoiding] = useState<{ id: string; reason: string } | null>(null);
  const voidS = useSubmit<unknown, unknown>(() => `/api/v1/t/${tenant}/finance/expenses/${voiding?.id}/void`);
  const CATS = ['rent', 'salaries', 'supplies', 'utilities', 'marketing', 'maintenance', 'other'];
  return (
    <div className="grid cols-2">
      {canEdit && (
        <form className="card" onSubmit={async (e) => { e.preventDefault(); if (await create.submit({ ...form, description: form.description || null })) { toast(t('common.saved'), 'ok'); setForm({ ...form, amountMinor: null, description: '' }); void d.reload(); } }}>
          <h2>{t('fi.new_expense')}</h2>
          <ErrorAlert error={create.error} />
          <Field label={t('fi.category')} required>{(p) => <select {...p} className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATS.map((c) => <option key={c} value={c}>{t(`fi.cat.${c}`)}</option>)}</select>}</Field>
          <Field label={t('bk.amount')} required>{(p) => <MoneyInput {...p} value={form.amountMinor} onChange={(v) => setForm({ ...form, amountMinor: v })} />}</Field>
          <Field label={t('common.date')} required>{(p) => <input {...p} type="date" className="input" value={form.incurredOn} onChange={(e) => setForm({ ...form, incurredOn: e.target.value })} />}</Field>
          <Field label={t('common.description')}>{(p) => <input {...p} className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />}</Field>
          <button type="submit" className="btn btn-gold btn-sm" disabled={create.busy || !form.amountMinor}>{t('common.save')}</button>
        </form>
      )}
      <section className="card">
        <DataState loading={d.loading && !d.data} error={d.error} onRetry={d.reload}>
          {!d.data?.items.length ? <EmptyState icon="invoice" title={t('common.empty')} /> : (
            <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
              {d.data.items.map((x) => (
                <li key={x.id} className="row between" style={{ opacity: x.voidedAt ? 0.55 : 1 }}>
                  <span><strong>{formatMoney(x.amountMinor, 'SAR', locale)}</strong> · {t(`fi.cat.${x.category}`)} · <span className="small">{x.incurredOn}</span>
                    {x.description && <div className="small muted">{x.description}</div>}
                    {x.voidedAt && <div className="small">{t('fi.voided', { reason: x.voidReason ?? '' })}</div>}</span>
                  {canEdit && !x.voidedAt && <button type="button" className="btn btn-quiet btn-sm" onClick={() => setVoiding({ id: x.id, reason: '' })}>{t('fi.void')}</button>}
                </li>
              ))}
            </ul>
          )}
        </DataState>
        {voiding && (
          <form className="card" onSubmit={async (e) => { e.preventDefault(); if (await voidS.submit({ reason: voiding.reason })) { setVoiding(null); void d.reload(); } }}>
            <ErrorAlert error={voidS.error} />
            <Field label={t('bk.reason_prompt')} required>{(p) => <input {...p} className="input" value={voiding.reason} onChange={(e) => setVoiding({ ...voiding, reason: e.target.value })} />}</Field>
            <div className="form-actions"><button type="button" className="btn btn-quiet btn-sm" onClick={() => setVoiding(null)}>{t('common.cancel')}</button><button type="submit" className="btn btn-danger btn-sm" disabled={voiding.reason.trim().length < 3}>{t('fi.void')}</button></div>
          </form>
        )}
      </section>
    </div>
  );
}

function Commissions({ tenant, period, tz }: { tenant: string; period: string; tz: string }) {
  const t = useT();
  const locale = useLocale();
  const d = useApi<{ items: { id: string; kind: string; basisMinor: number; amountMinor: number; createdAt: string; staffName: string; serviceName: string; bookingNumber: string }[] }>(`/api/v1/t/${tenant}/finance/commissions?${period}`);
  return (
    <DataState loading={d.loading && !d.data} error={d.error} onRetry={d.reload}>
      {!d.data?.items.length ? <div className="card"><EmptyState icon="commission" title={t('common.empty')} /></div> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>{t('common.date')}</th><th>{t('bk.staff')}</th><th>{t('bk.services')}</th><th>#</th><th>{t('fi.basis')}</th><th>{t('bk.amount')}</th></tr></thead>
          <tbody>{d.data.items.map((c) => <tr key={c.id}><td className="small">{formatDateTime(c.createdAt, { tz, locale, dateOnly: true })}</td><td>{c.staffName}</td><td>{c.serviceName}</td><td className="mono small">{c.bookingNumber}</td><td>{formatMoney(c.basisMinor, 'SAR', locale)}</td><td>{formatMoney(c.amountMinor, 'SAR', locale)} {c.kind !== 'earned' && <span className="badge">{c.kind}</span>}</td></tr>)}</tbody>
        </table></div>
      )}
    </DataState>
  );
}

function Invoices({ tenant, tz }: { tenant: string; tz: string }) {
  const t = useT();
  const locale = useLocale();
  const d = useApi<{ items: { id: string; number: string; totalMinor: number; taxMinor: number; status: string; issuedAt: string; buyerSnapshot: { name: string; reference: string } }[] }>(`/api/v1/t/${tenant}/finance/invoices`);
  return (
    <DataState loading={d.loading && !d.data} error={d.error} onRetry={d.reload}>
      <p className="small muted">{t('fi.not_zatca')}</p>
      {!d.data?.items.length ? <div className="card"><EmptyState icon="invoice" title={t('common.empty')} /></div> : (
        <div className="table-wrap"><table className="table">
          <thead><tr><th>#</th><th>{t('common.date')}</th><th>{t('bk.customer')}</th><th>{t('bk.total')}</th><th /></tr></thead>
          <tbody>{d.data.items.map((i) => <tr key={i.id}><td className="mono">{i.number}</td><td className="small">{formatDateTime(i.issuedAt, { tz, locale })}</td><td>{i.buyerSnapshot?.name} <span className="mono small">{i.buyerSnapshot?.reference}</span></td><td>{formatMoney(i.totalMinor, 'SAR', locale)}</td>
            <td><a className="btn btn-sm" href={`/api/v1/t/${tenant}/finance/invoices/${i.id}/pdf`} target="_blank" rel="noopener noreferrer">{t('fi.pdf')}</a></td></tr>)}</tbody>
        </table></div>
      )}
    </DataState>
  );
}

function Exports({ tenant, from, to }: { tenant: string; from: string; to: string }) {
  const t = useT();
  const [kind, setKind] = useState('payments');
  const [needStep, setNeedStep] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const download = async () => {
    setErr(null);
    const res = await fetch(`/api/v1/t/${tenant}/finance/export`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-luma-request': '1' }, body: JSON.stringify({ kind, from, to }) });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      if (j?.error?.message === 'errors.step_up_required') return setNeedStep(true);
      return setErr(t(j?.error?.message ?? 'errors.internal'));
    }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${kind}-${from}-${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="card stack">
      <p className="small muted">{t('fi.export_note')}</p>
      {needStep ? <StepUp onDone={() => { setNeedStep(false); void download(); }} onCancel={() => setNeedStep(false)} /> : (
        <div className="row">
          <select className="input" style={{ maxWidth: 220 }} aria-label={t('fi.exports')} value={kind} onChange={(e) => setKind(e.target.value)}>
            {['payments', 'expenses', 'journal'].map((k) => <option key={k} value={k}>{t(`fi.export_kind.${k}`)}</option>)}
          </select>
          <button type="button" className="btn btn-gold btn-sm" onClick={download}>{t('fi.export_btn')}</button>
        </div>
      )}
      {err && <div className="alert error" role="alert">{err}</div>}
    </div>
  );
}
