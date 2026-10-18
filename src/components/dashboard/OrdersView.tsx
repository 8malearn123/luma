'use client';

import Link from 'next/link';
import { useState } from 'react';
import { formatDateTime, formatMoney } from '@/lib/format';
import { useLocale, useT } from '../I18n';
import { EmptyState, ErrorAlert, Field, useSubmit } from '../ui/forms';
import { useToast } from '../ui/Toast';
import { DataState, MoneyInput, PageHead, statusBadge, useApi } from './hooks';

const STATUSES = ['pending_payment', 'paid', 'preparing', 'ready', 'collected', 'cancelled'];
const NEXT: Record<string, string[]> = { paid: ['preparing', 'ready', 'cancelled'], preparing: ['ready', 'cancelled'], ready: ['collected', 'cancelled'], pending_payment: ['cancelled'] };

export function OrdersList({ tenant, tz, initialStatus }: { tenant: string; tz: string; initialStatus: string }) {
  const t = useT();
  const locale = useLocale();
  const [status, setStatus] = useState(initialStatus);
  const [q, setQ] = useState('');
  const d = useApi<{ items: { id: string; number: string; status: string; refundStatus: string; totalMinor: number; paidMinor: number; createdAt: string; customerName: string; lines: number }[] }>(`/api/v1/t/${tenant}/orders?${new URLSearchParams({ ...(status ? { status } : {}), ...(q ? { q } : {}) })}`);
  return (
    <>
      <PageHead title={t('nav.orders')} />
      <p className="small muted">{t('ord.pickup_only')}</p>
      <div className="toolbar">
        <input className="input" type="search" placeholder={t('common.search')} aria-label={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" style={{ maxWidth: 200 }} aria-label={t('common.status')} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t('common.all')}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{t(`ord.status.${s}`)}</option>)}
        </select>
      </div>
      <DataState loading={d.loading && !d.data} error={d.error} onRetry={d.reload}>
        {!d.data?.items.length ? <div className="card"><EmptyState icon="bag" title={t('common.empty')} /></div> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>#</th><th>{t('common.date')}</th><th>{t('bk.customer')}</th><th>{t('common.status')}</th><th>{t('bk.total')}</th><th>{t('bk.paid')}</th></tr></thead>
            <tbody>{d.data.items.map((o) => (
              <tr key={o.id}><td><Link href={`/app/${tenant}/orders/${o.id}`} className="mono">{o.number}</Link></td><td className="small">{formatDateTime(o.createdAt, { tz, locale })}</td><td>{o.customerName}</td>
                <td><span className={`badge ${statusBadge(o.status)}`}>{t(`ord.status.${o.status}`)}</span>{o.refundStatus !== 'none' && <span className="badge amber" style={{ marginInlineStart: 4 }}>{o.refundStatus}</span>}</td>
                <td>{formatMoney(o.totalMinor, 'SAR', locale)}</td><td>{formatMoney(o.paidMinor, 'SAR', locale)}</td></tr>
            ))}</tbody></table></div>
        )}
      </DataState>
    </>
  );
}

interface OrderDetail {
  order: { id: string; number: string; status: string; refundStatus: string; totalMinor: number; paidMinor: number; refundedMinor: number; paymentTerms: string; customerName: string; customerPhone: string | null; createdAt: string; cancelReason: string | null };
  items: { id: string; name: string; variantName: string | null; unitPriceMinor: number; quantity: number; lineTotalMinor: number }[];
  payments: { id: string; method: string | null; amountMinor: number; status: string; provider: string; collectionRef: string | null }[];
  fulfillment: { method: string; status: string } | null;
}

export function OrderDetailView({ tenant, id, tz, caps }: { tenant: string; id: string; tz: string; caps: string[] }) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const d = useApi<OrderDetail>(`/api/v1/t/${tenant}/orders/${id}`);
  const tr = useSubmit<unknown, unknown>(`/api/v1/t/${tenant}/orders/${id}/transition`);
  const pay = useSubmit<unknown, unknown>(`/api/v1/t/${tenant}/orders/${id}/payments`);
  const inv = useSubmit<unknown, { id: string }>(`/api/v1/t/${tenant}/orders/${id}/invoice`);
  const [cancel, setCancel] = useState(false);
  const [reason, setReason] = useState('');
  const [collect, setCollect] = useState<{ amount: number | null; method: string; ref: string } | null>(null);
  const o = d.data?.order;
  const outstanding = o ? o.totalMinor - o.paidMinor : 0;
  const go = async (to: string, r?: string) => {
    if (await tr.submit({ to, reason: r })) { toast(t(`ord.status.${to}`), 'ok'); setCancel(false); void d.reload(); }
  };
  return (
    <DataState loading={d.loading && !d.data} error={d.error} onRetry={d.reload} rows={6}>
      {o && d.data && (
        <>
          <PageHead title={o.number} crumbs={t('nav.orders')} />
          <div className="row" style={{ marginBottom: 12 }}>
            <span className={`badge ${statusBadge(o.status)}`}>{t(`ord.status.${o.status}`)}</span>
            {o.refundStatus !== 'none' && <span className="badge amber">{t('ord.refund_status')}: {o.refundStatus}</span>}
            <span className="badge">{t('ord.pickup_only')}</span>
          </div>
          <div className="grid cols-2">
            <section className="card">
              <div>{o.customerName} <span className="mono small">{o.customerPhone ?? ''}</span></div>
              <div className="small muted">{formatDateTime(o.createdAt, { tz, locale })}</div>
              <table className="table" style={{ marginTop: 10 }}><tbody>
                {d.data.items.map((i) => <tr key={i.id}><td>{i.name}{i.variantName ? ` — ${i.variantName}` : ''}</td><td>× {i.quantity}</td><td>{formatMoney(i.lineTotalMinor, 'SAR', locale)}</td></tr>)}
                <tr><td colSpan={2}><strong>{t('bk.total')}</strong></td><td><strong>{formatMoney(o.totalMinor, 'SAR', locale)}</strong></td></tr>
              </tbody></table>
            </section>
            <section className="card stack">
              <ErrorAlert error={tr.error ?? pay.error ?? inv.error} />
              {caps.includes('orders.manage') && !cancel && (
                <div className="row">{(NEXT[o.status] ?? []).map((to) => (
                  <button key={to} type="button" className={`btn btn-sm ${to === 'cancelled' ? 'btn-danger' : 'btn-ghost'}`} disabled={tr.busy || (to === 'collected' && outstanding > 0)} onClick={() => (to === 'cancelled' ? setCancel(true) : go(to))}>{t(`ord.action.${to}`)}</button>
                ))}</div>
              )}
              {cancel && (
                <form onSubmit={(e) => { e.preventDefault(); void go('cancelled', reason); }}>
                  <Field label={t('bk.reason_prompt')} required>{(p) => <textarea {...p} className="input" value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
                  <div className="form-actions"><button type="button" className="btn btn-quiet btn-sm" onClick={() => setCancel(false)}>{t('common.cancel')}</button><button type="submit" className="btn btn-danger btn-sm" disabled={!reason.trim() || tr.busy}>{t('ord.action.cancelled')}</button></div>
                </form>
              )}
              {caps.includes('payments.collect') && outstanding > 0 && o.status !== 'cancelled' && (
                collect ? (
                  <form onSubmit={async (e) => { e.preventDefault(); if (await pay.submit({ amountMinor: collect.amount, method: collect.method, reference: collect.ref })) { setCollect(null); toast(t('common.saved'), 'ok'); void d.reload(); } }}>
                    <Field label={t('bk.amount')} required>{(p) => <MoneyInput {...p} value={collect.amount} onChange={(v) => setCollect({ ...collect, amount: v })} />}</Field>
                    <Field label={t('bk.collect_method')} required>{(p) => <select {...p} className="input" value={collect.method} onChange={(e) => setCollect({ ...collect, method: e.target.value })}><option value="cash">{t('bk.method.cash')}</option><option value="card_terminal">{t('bk.method.card_terminal')}</option></select>}</Field>
                    <Field label={t('bk.reference')} required>{(p) => <input {...p} className="input" value={collect.ref} onChange={(e) => setCollect({ ...collect, ref: e.target.value })} />}</Field>
                    <button type="submit" className="btn btn-gold btn-sm" disabled={pay.busy || !collect.amount || !collect.ref.trim()}>{t('common.confirm')}</button>
                  </form>
                ) : <button type="button" className="btn btn-sm" onClick={() => setCollect({ amount: outstanding, method: 'cash', ref: '' })}>{t('bk.collect')} ({formatMoney(outstanding, 'SAR', locale)})</button>
              )}
              {['paid', 'preparing', 'ready', 'collected'].includes(o.status) && (
                <button type="button" className="btn btn-sm" disabled={inv.busy} onClick={async () => { const r = await inv.submit({}); if (r) window.open(`/api/v1/t/${tenant}/finance/invoices/${r.id}/pdf`, '_blank', 'noopener'); }}>{t('bk.invoice')}</button>
              )}
              <ul className="small">{d.data.payments.map((p) => <li key={p.id}>{formatMoney(p.amountMinor, 'SAR', locale)} · {p.method ?? p.provider} · <span className={`badge ${statusBadge(p.status)}`}>{p.status}</span></li>)}</ul>
              {o.cancelReason && <div className="small muted">{t('common.reason')}: {o.cancelReason}</div>}
            </section>
          </div>
        </>
      )}
    </DataState>
  );
}
