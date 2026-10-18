'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatDateTime, formatMoney } from '@/lib/format';
import { useLocale, useT } from '../I18n';
import { Drawer, EmptyState, ErrorAlert, Field, useSubmit } from '../ui/forms';
import { useToast } from '../ui/Toast';
import { DataState, MoneyInput, PageHead, statusBadge, useApi } from './hooks';
import { StepUp } from './FinanceView';

const STATUSES = ['pending_payment', 'paid', 'preparing', 'ready', 'collected', 'cancelled'];
const NEXT: Record<string, string[]> = { paid: ['preparing', 'ready', 'cancelled'], preparing: ['ready', 'cancelled'], ready: ['collected', 'cancelled'], pending_payment: ['cancelled'] };
const COD_NEXT = ['preparing', 'cancelled'];
const DELIVERY_NEXT: Record<string, string[]> = { pending: ['ready'], ready: ['out_for_delivery'], out_for_delivery: ['delivered', 'failed_attempt'], failed_attempt: ['out_for_delivery', 'ready'] };
const RETURN_STATUSES = ['requested', 'approved', 'received', 'completed', 'rejected', 'cancelled'];

export interface DeliveryAddress {
  recipientName: string;
  phone: string;
  city: string;
  district: string | null;
  street: string;
  buildingNo: string | null;
  postalCode: string | null;
  notes: string | null;
}
export const addressLine = (a: DeliveryAddress) => [a.buildingNo, a.street, a.district, a.city, a.postalCode].filter(Boolean).join('، ');

/** Tabs shared by the three order screens (plain links: each is its own page). */
export function OrdersNav({ tenant, active }: { tenant: string; active: 'orders' | 'deliveries' | 'returns' }) {
  const t = useT();
  const base = `/app/${tenant}/orders`;
  const tabs = [
    { key: 'orders', href: base, label: t('nav.orders') },
    { key: 'deliveries', href: `${base}/deliveries`, label: t('dlv.board') },
    { key: 'returns', href: `${base}/returns`, label: t('ret.queue') },
  ];
  return (
    <nav className="tabs" aria-label={t('nav.orders')}>
      {tabs.map((x) => (
        <Link key={x.key} href={x.href} className="tab" aria-current={active === x.key ? 'page' : undefined} aria-selected={active === x.key}>
          {x.label}
        </Link>
      ))}
    </nav>
  );
}

export function OrdersList({ tenant, tz, initialStatus }: { tenant: string; tz: string; initialStatus: string }) {
  const t = useT();
  const locale = useLocale();
  const [status, setStatus] = useState(initialStatus);
  const [q, setQ] = useState('');
  const d = useApi<{ items: { id: string; number: string; status: string; refundStatus: string; totalMinor: number; paidMinor: number; createdAt: string; customerName: string; lines: number; fulfillmentMethod: string }[] }>(`/api/v1/t/${tenant}/orders?${new URLSearchParams({ ...(status ? { status } : {}), ...(q ? { q } : {}) })}`);
  return (
    <>
      <PageHead title={t('nav.orders')} />
      <OrdersNav tenant={tenant} active="orders" />
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
            <thead><tr><th>#</th><th>{t('common.date')}</th><th>{t('bk.customer')}</th><th>{t('dlv.method')}</th><th>{t('common.status')}</th><th>{t('bk.total')}</th><th>{t('bk.paid')}</th></tr></thead>
            <tbody>{d.data.items.map((o) => (
              <tr key={o.id}><td><Link href={`/app/${tenant}/orders/${o.id}`} className="mono">{o.number}</Link></td><td className="small">{formatDateTime(o.createdAt, { tz, locale })}</td><td>{o.customerName}</td>
                <td><span className="badge">{t(`dlv.m.${o.fulfillmentMethod}`)}</span></td>
                <td><span className={`badge ${statusBadge(o.status)}`}>{t(`ord.status.${o.status}`)}</span>{o.refundStatus !== 'none' && <span className="badge amber" style={{ marginInlineStart: 4 }}>{t(`order.refund.${o.refundStatus}`)}</span>}</td>
                <td>{formatMoney(o.totalMinor, 'SAR', locale)}</td><td>{formatMoney(o.paidMinor, 'SAR', locale)}</td></tr>
            ))}</tbody></table></div>
        )}
      </DataState>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Delivery board
// ─────────────────────────────────────────────────────────────
interface BoardRow {
  id: string;
  number: string;
  orderStatus: string;
  totalMinor: number;
  paidMinor: number;
  paymentTerms: string;
  deliveryFeeMinor: number;
  deliveryAddress: DeliveryAddress;
  createdAt: string;
  status: string;
  courierName: string | null;
  trackingRef: string | null;
  attempts: number;
  zoneName: string | null;
  customerName: string;
}
const COLUMNS = ['pending', 'ready', 'out_for_delivery', 'failed_attempt', 'delivered'];

export function DeliveryBoard({ tenant, tz }: { tenant: string; tz: string }) {
  const t = useT();
  const locale = useLocale();
  const d = useApi<{ items: BoardRow[] }>(`/api/v1/t/${tenant}/delivery`);
  return (
    <>
      <PageHead title={t('dlv.board')} actions={<button type="button" className="btn btn-sm" onClick={d.reload}>{t('common.refresh')}</button>} />
      <OrdersNav tenant={tenant} active="deliveries" />
      <p className="small muted">{t('dlv.board_hint')}</p>
      <DataState loading={d.loading && !d.data} error={d.error} onRetry={d.reload} rows={4}>
        {!d.data?.items.length ? <div className="card"><EmptyState icon="pin" title={t('dlv.none')}><p className="small muted">{t('dlv.none_hint')}</p></EmptyState></div> : (
          <div className="grid cols-3">
            {COLUMNS.map((col) => {
              const rows = d.data!.items.filter((r) => r.status === col);
              return (
                <section key={col} className="card stack" aria-label={t(`dlv.s.${col}`)}>
                  <div className="row between"><strong>{t(`dlv.s.${col}`)}</strong><span className="badge">{rows.length}</span></div>
                  {!rows.length && <div className="small muted">—</div>}
                  {rows.map((r) => (
                    <Link key={r.id} href={`/app/${tenant}/orders/${r.id}`} className="plain-link card" style={{ padding: 10 }}>
                      <div className="row between"><span className="mono">{r.number}</span><span className="small">{formatMoney(r.totalMinor, 'SAR', locale)}</span></div>
                      <div className="small">{r.customerName} · {r.deliveryAddress?.city}{r.deliveryAddress?.district ? ` / ${r.deliveryAddress.district}` : ''}</div>
                      <div className="small muted">{formatDateTime(r.createdAt, { tz, locale })}{r.zoneName ? ` · ${r.zoneName}` : ''}</div>
                      {r.paymentTerms === 'on_site' && r.paidMinor < r.totalMinor && <span className="badge amber">{t('dlv.cod_due', { amount: formatMoney(r.totalMinor - r.paidMinor, 'SAR', locale) })}</span>}
                      {r.trackingRef && <div className="small mono">{r.courierName ?? ''} {r.trackingRef}</div>}
                    </Link>
                  ))}
                </section>
              );
            })}
          </div>
        )}
      </DataState>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// Returns queue
// ─────────────────────────────────────────────────────────────
interface ReturnRow { number: string; status: string; orderId: string; orderNumber: string; customerName: string; reasonCode: string; reason: string; quantity: number; lines: number; createdAt: string; refundAmountMinor: number | null }
interface ReturnDetail {
  number: string;
  lines: { id: string; quantity: number; status: string; reason: string; reasonCode: string; decisionNote: string | null; restock: boolean; name: string; variantName: string | null; unitPriceMinor: number; purchased: number; orderNumber: string; orderId: string; createdAt: string }[];
  suggestion: { suggestedMinor: number; grossMinor: number; discountShareMinor: number; deliveryFeeMinor: number; refundableMinor: number };
}

export function ReturnsQueue({ tenant, tz, caps, initialNumber }: { tenant: string; tz: string; caps: string[]; initialNumber?: string }) {
  const t = useT();
  const locale = useLocale();
  const [status, setStatus] = useState('requested');
  const [open, setOpen] = useState<string | null>(initialNumber ?? null);
  const d = useApi<{ items: ReturnRow[] }>(`/api/v1/t/${tenant}/returns${status ? `?status=${status}` : ''}`);
  return (
    <>
      <PageHead title={t('ret.queue')} />
      <OrdersNav tenant={tenant} active="returns" />
      <div className="toolbar">
        <select className="input" style={{ maxWidth: 220 }} aria-label={t('common.status')} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t('common.all')}</option>
          {RETURN_STATUSES.map((s) => <option key={s} value={s}>{t(`ret.s.${s}`)}</option>)}
        </select>
      </div>
      <DataState loading={d.loading && !d.data} error={d.error} onRetry={d.reload}>
        {!d.data?.items.length ? <div className="card"><EmptyState icon="undo" title={t('ret.none')} /></div> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>#</th><th>{t('common.date')}</th><th>{t('nav.orders')}</th><th>{t('bk.customer')}</th><th>{t('ret.reason')}</th><th>{t('ret.qty')}</th><th>{t('common.status')}</th><th /></tr></thead>
            <tbody>{d.data.items.map((r) => (
              <tr key={r.number}>
                <td className="mono">{r.number}</td><td className="small">{formatDateTime(r.createdAt, { tz, locale })}</td>
                <td><Link className="mono" href={`/app/${tenant}/orders/${r.orderId}`}>{r.orderNumber}</Link></td><td>{r.customerName}</td>
                <td className="small">{t(`ret.reason.${r.reasonCode}`)}</td><td>{r.quantity}</td>
                <td><span className={`badge ${retBadge(r.status)}`}>{t(`ret.s.${r.status}`)}</span></td>
                <td><button type="button" className="btn btn-sm" onClick={() => setOpen(r.number)}>{t('common.details')}</button></td>
              </tr>
            ))}</tbody></table></div>
        )}
      </DataState>
      {open && <ReturnDrawer tenant={tenant} number={open} caps={caps} onClose={() => setOpen(null)} onChanged={d.reload} />}
    </>
  );
}

const retBadge = (s: string) => ({ requested: 'amber', approved: 'blue', received: 'blue', completed: 'green', rejected: 'red', cancelled: '' })[s] ?? '';

function ReturnDrawer({ tenant, number, caps, onClose, onChanged }: { tenant: string; number: string; caps: string[]; onClose: () => void; onChanged: () => void }) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const d = useApi<ReturnDetail>(`/api/v1/t/${tenant}/returns/${number}`);
  const decide = useSubmit<unknown, unknown>(`/api/v1/t/${tenant}/returns/${number}/decision`);
  const receive = useSubmit<unknown, unknown>(`/api/v1/t/${tenant}/returns/${number}/receive`);
  const complete = useSubmit<unknown, { creditNote: { id: string; number: string } | null }>(`/api/v1/t/${tenant}/returns/${number}/complete`);
  const [note, setNote] = useState('');
  const [restock, setRestock] = useState<Record<string, boolean>>({});
  const [refund, setRefund] = useState<number | null>(null);
  const [needStep, setNeedStep] = useState(false);
  useEffect(() => {
    if (d.data) setRefund(d.data.suggestion.suggestedMinor);
  }, [d.data]);
  const st = d.data?.lines[0]?.status;
  const done = () => { onChanged(); void d.reload(); };
  const doComplete = async () => {
    const r = await complete.submit({ refundAmountMinor: caps.includes('refunds.issue') ? (refund ?? 0) : 0 });
    if (r) { toast(t('ret.completed_toast'), 'ok'); done(); }
    else if (complete.error?.message === 'errors.step_up_required') setNeedStep(true);
  };
  useEffect(() => {
    if (complete.error?.message === 'errors.step_up_required') setNeedStep(true);
  }, [complete.error]);
  const m = (x: number) => formatMoney(x, 'SAR', locale);
  return (
    <Drawer title={`${t('ret.request')} ${number}`} onClose={onClose}>
      <DataState loading={d.loading && !d.data} error={d.error} onRetry={d.reload}>
        {d.data && (
          <div className="stack">
            <div className="row"><span className={`badge ${retBadge(st ?? '')}`}>{t(`ret.s.${st}`)}</span><Link className="mono small" href={`/app/${tenant}/orders/${d.data.lines[0].orderId}`}>{d.data.lines[0].orderNumber}</Link></div>
            <div className="card">
              <div className="small muted">{t(`ret.reason.${d.data.lines[0].reasonCode}`)}</div>
              <p style={{ whiteSpace: 'pre-line', margin: '4px 0 0' }}>{d.data.lines[0].reason}</p>
              {d.data.lines[0].decisionNote && <p className="small">{t('ret.decision_note')}: {d.data.lines[0].decisionNote}</p>}
            </div>
            <table className="table"><tbody>
              {d.data.lines.map((l) => (
                <tr key={l.id}>
                  <td>{l.name}{l.variantName ? ` — ${l.variantName}` : ''}<div className="small muted">{t('ret.of_purchased', { q: l.quantity, n: l.purchased })}</div></td>
                  <td className="mono">{m(l.unitPriceMinor * l.quantity)}</td>
                  {st === 'approved' && (
                    <td><label className="check"><input type="checkbox" checked={!!restock[l.id]} onChange={(e) => setRestock({ ...restock, [l.id]: e.target.checked })} /> {t('ret.restock')}</label></td>
                  )}
                  {st !== 'approved' && l.restock && <td><span className="badge green">{t('ret.restocked')}</span></td>}
                </tr>
              ))}
            </tbody></table>
            <ErrorAlert error={decide.error ?? receive.error ?? (complete.error?.message === 'errors.step_up_required' ? null : complete.error)} />
            {st === 'requested' && caps.includes('orders.manage') && (
              <div className="stack">
                <Field label={t('ret.decision_note')} hint={t('ret.reject_needs_note')}>{(p) => <textarea {...p} className="input" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
                <div className="form-actions">
                  <button type="button" className="btn btn-danger btn-sm" disabled={decide.busy || !note.trim()} onClick={async () => { if (await decide.submit({ decision: 'reject', note })) { toast(t('ret.s.rejected'), 'ok'); done(); } }}>{t('ret.reject')}</button>
                  <button type="button" className="btn btn-gold btn-sm" disabled={decide.busy} onClick={async () => { if (await decide.submit({ decision: 'approve', note: note || undefined })) { toast(t('ret.s.approved'), 'ok'); done(); } }}>{t('ret.approve')}</button>
                </div>
              </div>
            )}
            {st === 'approved' && caps.includes('orders.manage') && (
              <div className="form-actions">
                <button type="button" className="btn btn-sm" disabled={receive.busy} onClick={async () => { if (await receive.submit({ restock: d.data!.lines.map((l) => ({ returnId: l.id, restock: !!restock[l.id] })) })) { toast(t('ret.s.received'), 'ok'); done(); } }}>{t('ret.mark_received')}</button>
              </div>
            )}
            {(st === 'approved' || st === 'received') && caps.includes('orders.manage') && (
              needStep ? <StepUp onDone={() => { setNeedStep(false); void doComplete(); }} onCancel={() => setNeedStep(false)} /> : (
                <div className="card stack">
                  <strong>{t('ret.complete_title')}</strong>
                  <div className="small muted">
                    {t('ret.suggest_breakdown', { gross: m(d.data.suggestion.grossMinor), discount: m(d.data.suggestion.discountShareMinor), fee: m(d.data.suggestion.deliveryFeeMinor) })}
                  </div>
                  {caps.includes('refunds.issue') ? (
                    <Field label={t('ret.refund_amount')} hint={t('ret.refund_max', { max: m(d.data.suggestion.suggestedMinor) })}>{(p) => <MoneyInput {...p} value={refund} onChange={setRefund} />}</Field>
                  ) : <div className="alert warn small">{t('ret.no_refund_cap')}</div>}
                  <div className="small muted">{t('ret.refund_honest')}</div>
                  <button type="button" className="btn btn-gold btn-sm" disabled={complete.busy || (refund ?? 0) > d.data.suggestion.suggestedMinor} onClick={doComplete}>{t('ret.complete')}</button>
                </div>
              )
            )}
          </div>
        )}
      </DataState>
    </Drawer>
  );
}

// ─────────────────────────────────────────────────────────────
// Order detail
// ─────────────────────────────────────────────────────────────
interface OrderDetail {
  order: { id: string; number: string; status: string; refundStatus: string; subtotalMinor: number; discountMinor: number; deliveryFeeMinor: number; totalMinor: number; paidMinor: number; refundedMinor: number; paymentTerms: string; customerName: string; customerPhone: string | null; createdAt: string; cancelReason: string | null; fulfillmentMethod: string; deliveryAddress: DeliveryAddress | null };
  items: { id: string; name: string; variantName: string | null; unitPriceMinor: number; quantity: number; lineTotalMinor: number; returnedQty: number }[];
  payments: { id: string; method: string | null; amountMinor: number; status: string; provider: string; collectionRef: string | null }[];
  fulfillment: { method: string; status: string; courierName: string | null; trackingRef: string | null; trackingUrl: string | null; attempts: number } | null;
  timeline: { status: string; note: string | null; createdAt: string }[];
  returns: { number: string; status: string; quantity: number; name: string; reasonCode: string }[];
  invoices: { id: string; number: string; kind: string; totalMinor: number }[];
  zone: { name: string } | null;
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
  const delivery = o?.fulfillmentMethod === 'delivery';
  const cod = delivery && o?.paymentTerms === 'on_site';
  const go = async (to: string, r?: string) => {
    if (await tr.submit({ to, reason: r })) { toast(t(`ord.status.${to}`), 'ok'); setCancel(false); void d.reload(); }
  };
  const m = (x: number) => formatMoney(x, 'SAR', locale);
  // deliveries move through the delivery panel; only preparing / cancel stay here
  const next = o ? (delivery ? (cod && o.status === 'pending_payment' ? COD_NEXT : (NEXT[o.status] ?? []).filter((x) => x !== 'ready' && x !== 'collected')) : (NEXT[o.status] ?? [])) : [];
  return (
    <DataState loading={d.loading && !d.data} error={d.error} onRetry={d.reload} rows={6}>
      {o && d.data && (
        <>
          <PageHead title={o.number} crumbs={t('nav.orders')} />
          <div className="row" style={{ marginBottom: 12 }}>
            <span className={`badge ${statusBadge(o.status)}`}>{t(`ord.status.${o.status}`)}</span>
            {o.refundStatus !== 'none' && <span className="badge amber">{t('ord.refund_status')}: {t(`order.refund.${o.refundStatus}`)}</span>}
            <span className="badge">{t(`dlv.m.${o.fulfillmentMethod}`)}</span>
            {cod && <span className="badge amber">{t('dlv.cod')}</span>}
          </div>
          <div className="grid cols-2">
            <section className="card">
              <div>{o.customerName} <span className="mono small">{o.customerPhone ?? ''}</span></div>
              <div className="small muted">{formatDateTime(o.createdAt, { tz, locale })}</div>
              <table className="table" style={{ marginTop: 10 }}><tbody>
                {d.data.items.map((i) => <tr key={i.id}><td>{i.name}{i.variantName ? ` — ${i.variantName}` : ''}{i.returnedQty > 0 && <div className="small muted">{t('ret.returned_qty', { n: i.returnedQty })}</div>}</td><td>× {i.quantity}</td><td>{m(i.lineTotalMinor)}</td></tr>)}
                {o.discountMinor > 0 && <tr><td colSpan={2}>{t('inv.discount')}</td><td>−{m(o.discountMinor)}</td></tr>}
                {o.deliveryFeeMinor > 0 && <tr><td colSpan={2}>{t('dlv.fee')}</td><td>{m(o.deliveryFeeMinor)}</td></tr>}
                <tr><td colSpan={2}><strong>{t('bk.total')}</strong></td><td><strong>{m(o.totalMinor)}</strong></td></tr>
              </tbody></table>
            </section>
            <section className="card stack">
              <ErrorAlert error={tr.error ?? pay.error ?? inv.error} />
              {caps.includes('orders.manage') && !cancel && next.length > 0 && (
                <div className="row">{next.map((to) => (
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
                    <Field label={t('bk.reference')} required hint={cod ? t('dlv.cod_ref_hint') : undefined}>{(p) => <input {...p} className="input" value={collect.ref} onChange={(e) => setCollect({ ...collect, ref: e.target.value })} />}</Field>
                    <button type="submit" className="btn btn-gold btn-sm" disabled={pay.busy || !collect.amount || !collect.ref.trim()}>{t('common.confirm')}</button>
                  </form>
                ) : <button type="button" className="btn btn-sm" onClick={() => setCollect({ amount: outstanding, method: 'cash', ref: '' })}>{cod ? t('dlv.record_cod') : t('bk.collect')} ({m(outstanding)})</button>
              )}
              <div className="row">
                {['paid', 'preparing', 'ready', 'collected'].includes(o.status) && !d.data.invoices.some((x) => x.kind === 'invoice') && (
                  <button type="button" className="btn btn-sm" disabled={inv.busy} onClick={async () => { const r = await inv.submit({}); if (r) { toast(t('inv.issued'), 'ok'); void d.reload(); } }}>{t('bk.invoice')}</button>
                )}
                {d.data.invoices.map((x) => <Link key={x.id} className="btn btn-quiet btn-sm" href={`/app/${tenant}/finance/invoices/${x.id}`}>{x.kind === 'credit_note' ? t('inv.credit_short') : t('inv.invoice_short')} {x.number}</Link>)}
              </div>
              <ul className="small">{d.data.payments.map((p) => <li key={p.id}>{m(p.amountMinor)} · {p.method ?? p.provider} · <span className={`badge ${statusBadge(p.status)}`}>{p.status}</span></li>)}</ul>
              {o.cancelReason && <div className="small muted">{t('common.reason')}: {o.cancelReason}</div>}
            </section>
          </div>

          <div className="grid cols-2" style={{ marginTop: 14 }}>
            {delivery && o.deliveryAddress && d.data.fulfillment ? (
              <DeliveryPanel tenant={tenant} orderId={o.id} address={o.deliveryAddress} f={d.data.fulfillment} zone={d.data.zone?.name ?? null} orderStatus={o.status} outstanding={outstanding} canManage={caps.includes('orders.manage')} onChanged={d.reload} />
            ) : (
              <section className="card"><h3>{t('dlv.m.pickup')}</h3><p className="small muted">{t('dlv.pickup_hint')}</p></section>
            )}
            <section className="card">
              <h3>{t('dlv.timeline')}</h3>
              <Timeline events={d.data.timeline} tz={tz} />
            </section>
          </div>

          <section className="card" style={{ marginTop: 14 }}>
            <div className="row between"><h3>{t('ret.title')}</h3>{o.status === 'collected' && caps.includes('orders.manage') && <StaffReturnButton tenant={tenant} orderId={o.id} items={d.data.items} onDone={d.reload} />}</div>
            {!d.data.returns.length ? <p className="small muted">{t('ret.none_on_order')}</p> : (
              <ul className="small">{d.data.returns.map((r, i) => <li key={i}><Link className="mono" href={`/app/${tenant}/orders/returns?n=${r.number}`}>{r.number}</Link> · {r.name} × {r.quantity} · <span className={`badge ${retBadge(r.status)}`}>{t(`ret.s.${r.status}`)}</span></li>)}</ul>
            )}
          </section>
        </>
      )}
    </DataState>
  );
}

export function Timeline({ events, tz }: { events: { status: string; note: string | null; createdAt: string }[]; tz?: string }) {
  const t = useT();
  const locale = useLocale();
  if (!events.length) return <p className="small muted">—</p>;
  return (
    <ol className="timeline">
      {events.map((e, i) => (
        <li key={i} data-current={i === events.length - 1}>
          <div>{t(`tl.${e.status}`)}{e.note ? <span className="muted"> — {e.note}</span> : null}</div>
          <div className="small muted">{formatDateTime(e.createdAt, { tz, locale })}</div>
        </li>
      ))}
    </ol>
  );
}

function DeliveryPanel({ tenant, orderId, address, f, zone, orderStatus, outstanding, canManage, onChanged }: {
  tenant: string; orderId: string; address: DeliveryAddress; f: NonNullable<OrderDetail['fulfillment']>; zone: string | null; orderStatus: string; outstanding: number; canManage: boolean; onChanged: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const s = useSubmit<unknown, unknown>(`/api/v1/t/${tenant}/orders/${orderId}/delivery`);
  const [form, setForm] = useState<{ to: string; courierName: string; trackingRef: string; trackingUrl: string; note: string } | null>(null);
  const next = (DELIVERY_NEXT[f.status] ?? []).filter((x) => x !== 'ready' || ['paid', 'preparing', 'pending_payment', 'ready'].includes(orderStatus));
  const send = async (body: { status: string; courierName?: string | null; trackingRef?: string | null; trackingUrl?: string | null; note?: string }) => {
    if (await s.submit(body)) { toast(t(`dlv.s.${body.status}`), 'ok'); setForm(null); onChanged(); }
  };
  const submit = () => form && send({ status: form.to, courierName: form.courierName || null, trackingRef: form.trackingRef || null, trackingUrl: form.trackingUrl || null, note: form.note || undefined });
  return (
    <section className="card stack">
      <div className="row between"><h3>{t('dlv.title')}</h3><span className="badge gold">{t(`dlv.s.${f.status}`)}</span></div>
      <address style={{ fontStyle: 'normal' }}>
        <strong>{address.recipientName}</strong> · <a className="mono" href={`tel:${address.phone}`}>{address.phone}</a>
        <div>{addressLine(address)}</div>
        {address.notes && <div className="small muted">{address.notes}</div>}
        {zone && <div className="small muted">{t('dlv.zone')}: {zone}</div>}
      </address>
      {(f.courierName || f.trackingRef) && (
        <div className="small">{t('dlv.courier')}: {f.courierName ?? '—'} · <span className="mono">{f.trackingRef ?? ''}</span>{f.trackingUrl && <> · <a href={f.trackingUrl} target="_blank" rel="noopener noreferrer">{t('dlv.track_link')}</a></>}</div>
      )}
      {f.attempts > 1 && <div className="small muted">{t('dlv.attempts', { n: f.attempts })}</div>}
      <ErrorAlert error={s.error} />
      {canManage && !form && next.length > 0 && (
        <div className="row">
          {next.map((to) => (
            <button key={to} type="button" className={`btn btn-sm ${to === 'failed_attempt' ? 'btn-danger' : to === 'delivered' ? 'btn-gold' : 'btn-ghost'}`}
              disabled={s.busy || (to === 'delivered' && outstanding > 0)}
              title={to === 'delivered' && outstanding > 0 ? t('dlv.collect_first', { amount: formatMoney(outstanding, 'SAR', locale) }) : undefined}
              onClick={() => (to === 'out_for_delivery' || to === 'failed_attempt' ? setForm({ to, courierName: f.courierName ?? '', trackingRef: f.trackingRef ?? '', trackingUrl: f.trackingUrl ?? '', note: '' }) : void send({ status: to }))}>
              {t(`dlv.action.${to}`)}
            </button>
          ))}
        </div>
      )}
      {next.includes('delivered') && outstanding > 0 && <div className="small muted">{t('dlv.collect_first', { amount: formatMoney(outstanding, 'SAR', locale) })}</div>}
      {form && (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          {form.to === 'out_for_delivery' && (
            <>
              <Field label={t('dlv.courier')}>{(p) => <input {...p} className="input" maxLength={80} value={form.courierName} onChange={(e) => setForm({ ...form, courierName: e.target.value })} />}</Field>
              <Field label={t('dlv.tracking_ref')}>{(p) => <input {...p} className="input input-ltr mono" maxLength={80} value={form.trackingRef} onChange={(e) => setForm({ ...form, trackingRef: e.target.value })} />}</Field>
              <Field label={t('dlv.tracking_url')} hint={t('dlv.tracking_url_hint')} error={s.fieldErrors.trackingUrl}>{(p) => <input {...p} className="input input-ltr" type="url" inputMode="url" placeholder="https://" value={form.trackingUrl} onChange={(e) => setForm({ ...form, trackingUrl: e.target.value })} />}</Field>
            </>
          )}
          <Field label={t('dlv.note')} required={form.to === 'failed_attempt'}>{(p) => <input {...p} className="input" maxLength={500} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />}</Field>
          <div className="form-actions">
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setForm(null)}>{t('common.cancel')}</button>
            <button type="submit" className="btn btn-gold btn-sm" disabled={s.busy || (form.to === 'failed_attempt' && !form.note.trim())}>{t(`dlv.action.${form.to}`)}</button>
          </div>
        </form>
      )}
      <p className="small muted">{t('dlv.no_courier_integration')}</p>
    </section>
  );
}

function StaffReturnButton({ tenant, orderId, items, onDone }: { tenant: string; orderId: string; items: OrderDetail['items']; onDone: () => void }) {
  const t = useT();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reasonCode, setReasonCode] = useState('other');
  const [reason, setReason] = useState('');
  const s = useSubmit<unknown, { number: string }>(`/api/v1/t/${tenant}/orders/${orderId}/returns`);
  if (!open) return <button type="button" className="btn btn-sm" onClick={() => setOpen(true)}>{t('ret.staff_new')}</button>;
  const lines = Object.entries(qty).filter(([, q]) => q > 0).map(([orderItemId, quantity]) => ({ orderItemId, quantity }));
  return (
    <Drawer title={t('ret.staff_new')} onClose={() => setOpen(false)}>
      <form className="stack" onSubmit={async (e) => { e.preventDefault(); const r = await s.submit({ items: lines, reasonCode, reason }); if (r) { toast(`${t('ret.created')} ${r.number}`, 'ok'); setOpen(false); onDone(); } }}>
        <ErrorAlert error={s.error} />
        <p className="small muted">{t('ret.staff_hint')}</p>
        {items.map((i) => {
          const max = i.quantity - i.returnedQty;
          return (
            <Field key={i.id} label={`${i.name}${i.variantName ? ` — ${i.variantName}` : ''}`} hint={t('ret.max_qty', { n: max })}>
              {(p) => <input {...p} className="input input-ltr" type="number" min={0} max={max} value={qty[i.id] ?? 0} onChange={(e) => setQty({ ...qty, [i.id]: Math.max(0, Math.min(max, Number(e.target.value) || 0)) })} />}
            </Field>
          );
        })}
        <Field label={t('ret.reason')} required>{(p) => <select {...p} className="input" value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>{['damaged', 'wrong_item', 'not_as_described', 'changed_mind', 'allergy', 'other'].map((r) => <option key={r} value={r}>{t(`ret.reason.${r}`)}</option>)}</select>}</Field>
        <Field label={t('ret.details')} required>{(p) => <textarea {...p} className="input" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
        <button type="submit" className="btn btn-gold btn-sm" disabled={s.busy || !lines.length || reason.trim().length < 3}>{t('ret.create')}</button>
      </form>
    </Drawer>
  );
}

