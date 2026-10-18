'use client';

import { useState } from 'react';
import { formatDateTime, formatMoney } from '@/lib/format';
import { useLocale, useT } from '../I18n';
import { Drawer, ErrorAlert, Field, useSubmit } from '../ui/forms';
import { useToast } from '../ui/Toast';
import { DataState, MoneyInput, statusBadge, useApi } from './hooks';
import { RescheduleForm } from './NewBooking';

interface Detail {
  booking: {
    id: string; number: string; status: string; financialStatus: string; startsAt: string; endsAt: string; totalMinor: number; paidMinor: number;
    refundedMinor: number; paymentTerms: string; customerNote: string | null; internalNote?: string | null; version: number; branchId: string;
  };
  items: { id: string; serviceId: string; variantId: string | null; staffId: string; serviceName: string; staffName: string; startsAt: string; endsAt: string; priceMinor: number; addonsMinor: number; status: string }[];
  events: { fromStatus: string | null; toStatus: string | null; kind: string; actorRole: string | null; reason: string | null; at: string }[];
  customer: { displayName: string; phone: string | null; privateNotes?: string | null } | null;
  allowed: string[];
  payments: { id: string; kind: string; method: string | null; amountMinor: number; status: string; provider: string; collectionRef: string | null; createdAt: string }[];
}

const NEEDS_REASON = new Set(['cancelled', 'no_show']);

export function BookingDrawer({ tenant, id, tz, caps, onClose, onChanged }: { tenant: string; id: string; tz: string; caps: string[]; onClose: () => void; onChanged: () => void }) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const base = `/api/v1/t/${tenant}/bookings/${id}`;
  const d = useApi<Detail>(base);
  const tr = useSubmit<{ to: string; reason?: string }, { status: string; refundDueMinor: number }>(`${base}/transition`);
  const pay = useSubmit<unknown, { paymentId: string }>(`${base}/payments`);
  const note = useSubmit<unknown, unknown>(base, 'PATCH');
  const inv = useSubmit<unknown, { id: string; number: string }>(`${base}/invoice`);
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [collect, setCollect] = useState<{ amount: number | null; method: 'cash' | 'card_terminal'; ref: string } | null>(null);
  const [noteText, setNoteText] = useState<string | null>(null);
  const [resched, setResched] = useState(false);
  const can = (c: string) => caps.includes(c);
  const b = d.data?.booking;
  const outstanding = b ? Math.max(0, b.totalMinor - (b.paidMinor - b.refundedMinor)) : 0;

  async function doTransition(to: string, r?: string) {
    const res = await tr.submit({ to, reason: r });
    if (res) {
      toast(t(`bk.status.${res.status}`), 'ok');
      setReasonFor(null);
      setReason('');
      void d.reload();
      onChanged();
    }
  }

  return (
    <Drawer title={b ? `${t('bk.number')} ${b.number}` : t('common.loading')} onClose={onClose}>
      <DataState loading={d.loading && !d.data} error={d.error} onRetry={d.reload} rows={5}>
        {b && d.data && (
          <div className="stack">
            <div className="row">
              <span className={`badge ${statusBadge(b.status)}`}>{t(`bk.status.${b.status}`)}</span>
              <span className={`badge ${statusBadge(b.financialStatus)}`}>{t(`fin.${b.financialStatus}`)}</span>
              <span className="badge">{t(`terms.${b.paymentTerms}`)}</span>
            </div>
            <div>
              <div className="label">{t('bk.when')}</div>
              <div>{formatDateTime(b.startsAt, { tz, locale, dateStyle: 'full' })}</div>
            </div>
            {d.data.customer && (
              <div>
                <div className="label">{t('bk.customer')}</div>
                <div>{d.data.customer.displayName} {d.data.customer.phone && <span className="mono small">{d.data.customer.phone}</span>}</div>
                {d.data.customer.privateNotes && <div className="small muted">{d.data.customer.privateNotes}</div>}
              </div>
            )}
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr><th>{t('bk.services')}</th><th>{t('bk.staff')}</th><th>{t('common.time')}</th><th>{t('common.price')}</th></tr>
                </thead>
                <tbody>
                  {d.data.items.filter((i) => i.status === 'active').map((i) => (
                    <tr key={i.id}>
                      <td>{i.serviceName}</td>
                      <td>{i.staffName}</td>
                      <td className="mono small">{formatDateTime(i.startsAt, { tz, locale, timeOnly: true })}–{formatDateTime(i.endsAt, { tz, locale, timeOnly: true })}</td>
                      <td>{formatMoney(i.priceMinor + i.addonsMinor, 'SAR', locale)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid cols-3">
              <div className="stat"><div className="k">{t('bk.total')}</div><div className="v" style={{ fontSize: 18 }}>{formatMoney(b.totalMinor, 'SAR', locale)}</div></div>
              <div className="stat"><div className="k">{t('bk.paid')}</div><div className="v" style={{ fontSize: 18 }}>{formatMoney(b.paidMinor - b.refundedMinor, 'SAR', locale)}</div></div>
              <div className="stat"><div className="k">{t('bk.outstanding')}</div><div className="v" style={{ fontSize: 18 }}>{formatMoney(outstanding, 'SAR', locale)}</div></div>
            </div>
            {b.customerNote && (
              <div><div className="label">{t('bk.customer_note')}</div><div>{b.customerNote}</div></div>
            )}

            <ErrorAlert error={tr.error ?? pay.error ?? note.error ?? inv.error} />

            {d.data.allowed.length > 0 && !reasonFor && (
              <div className="row">
                {d.data.allowed.map((to) => (
                  <button key={to} type="button" className={`btn btn-sm ${to === 'cancelled' || to === 'no_show' ? 'btn-danger' : 'btn-ghost'}`} disabled={tr.busy}
                    onClick={() => (NEEDS_REASON.has(to) ? setReasonFor(to) : doTransition(to))}>
                    {t(`bk.action.${to}`)}
                  </button>
                ))}
                {can('bookings.manage') && ['confirmed', 'held'].includes(b.status) && (
                  <button type="button" className="btn btn-sm" onClick={() => setResched(!resched)}>{t('bk.reschedule')}</button>
                )}
              </div>
            )}
            {reasonFor && (
              <form className="card" onSubmit={(e) => { e.preventDefault(); void doTransition(reasonFor, reason); }}>
                <Field label={t('bk.reason_prompt')} required>
                  {(p) => <textarea {...p} className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />}
                </Field>
                <div className="form-actions">
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => setReasonFor(null)}>{t('common.cancel')}</button>
                  <button type="submit" className="btn btn-danger btn-sm" disabled={tr.busy || !reason.trim()}>{t(`bk.action.${reasonFor}`)}</button>
                </div>
              </form>
            )}
            {resched && (
              <RescheduleForm tenant={tenant} tz={tz} booking={b} items={d.data.items.filter((i) => i.status === 'active')}
                onDone={() => { setResched(false); void d.reload(); onChanged(); }} />
            )}

            {can('payments.collect') && outstanding > 0 && !['cancelled', 'expired', 'held'].includes(b.status) && (
              collect ? (
                <form className="card" onSubmit={async (e) => {
                  e.preventDefault();
                  const r = await pay.submit({ amountMinor: collect.amount, method: collect.method, reference: collect.ref });
                  if (r) { setCollect(null); toast(t('common.saved'), 'ok'); void d.reload(); onChanged(); }
                }}>
                  <h3>{t('bk.collect')}</h3>
                  <Field label={t('bk.amount')} required>{(p) => <MoneyInput {...p} value={collect.amount} onChange={(v) => setCollect({ ...collect, amount: v })} />}</Field>
                  <Field label={t('bk.collect_method')} required>
                    {(p) => (
                      <select {...p} className="input" value={collect.method} onChange={(e) => setCollect({ ...collect, method: e.target.value as 'cash' })}>
                        <option value="cash">{t('bk.method.cash')}</option>
                        <option value="card_terminal">{t('bk.method.card_terminal')}</option>
                      </select>
                    )}
                  </Field>
                  <Field label={t('bk.reference')} required>{(p) => <input {...p} className="input" value={collect.ref} onChange={(e) => setCollect({ ...collect, ref: e.target.value })} maxLength={80} />}</Field>
                  <div className="form-actions">
                    <button type="button" className="btn btn-quiet btn-sm" onClick={() => setCollect(null)}>{t('common.cancel')}</button>
                    <button type="submit" className="btn btn-gold btn-sm" disabled={pay.busy || !collect.amount || !collect.ref.trim()}>{t('common.confirm')}</button>
                  </div>
                </form>
              ) : (
                <button type="button" className="btn btn-sm" onClick={() => setCollect({ amount: outstanding, method: 'cash', ref: '' })}>{t('bk.collect')}</button>
              )
            )}

            {(can('payments.collect') || can('finance.view')) && ['confirmed', 'checked_in', 'in_service', 'completed'].includes(b.status) && (
              <div className="row">
                <button type="button" className="btn btn-sm" disabled={inv.busy} onClick={async () => {
                  const r = await inv.submit({});
                  if (r) window.open(`/api/v1/t/${tenant}/finance/invoices/${r.id}/pdf`, '_blank', 'noopener');
                }}>{t('bk.invoice')}</button>
                <span className="small muted">{t('fi.not_zatca')}</span>
              </div>
            )}

            {d.data.payments.length > 0 && (
              <div>
                <div className="label">{t('fi.payments')}</div>
                <ul className="small" style={{ paddingInlineStart: 18 }}>
                  {d.data.payments.map((p) => (
                    <li key={p.id}>{formatMoney(p.amountMinor, 'SAR', locale)} · {p.method ?? p.provider} · <span className={`badge ${statusBadge(p.status)}`}>{p.status}</span>{p.collectionRef ? ` · ${p.collectionRef}` : ''}</li>
                  ))}
                </ul>
              </div>
            )}

            {can('bookings.manage') && (
              <form onSubmit={async (e) => { e.preventDefault(); if (await note.submit({ internalNote: noteText ?? '' })) { toast(t('common.saved'), 'ok'); setNoteText(null); void d.reload(); } }}>
                <Field label={t('bk.internal_note')}>
                  {(p) => <textarea {...p} className="input" value={noteText ?? b.internalNote ?? ''} onChange={(e) => setNoteText(e.target.value)} maxLength={2000} />}
                </Field>
                {noteText !== null && <button type="submit" className="btn btn-sm" disabled={note.busy}>{t('common.save')}</button>}
              </form>
            )}

            <details>
              <summary>{t('bk.history')}</summary>
              <ul className="small" style={{ paddingInlineStart: 18 }}>
                {d.data.events.map((e, i) => (
                  <li key={i}>{formatDateTime(e.at, { tz, locale })} — {e.kind}{e.toStatus ? `: ${t(`bk.status.${e.toStatus}`)}` : ''}{e.reason ? ` (${e.reason})` : ''}</li>
                ))}
              </ul>
            </details>
          </div>
        )}
      </DataState>
    </Drawer>
  );
}
