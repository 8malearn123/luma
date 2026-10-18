'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError, apiFetch, newIdempotencyKey } from '@/lib/client/api';
import { useT } from '../I18n';
import { ErrorAlert, Field } from '../ui/forms';

interface Item { id: string; name: string; variantName: string | null; quantity: number; returnedQty: number; openReturnQty: number; returnable: boolean }
interface Ret { number: string; status: string; quantity: number; name: string; reasonCode: string; decisionNote: string | null; refundAmountMinor: number | null }
const REASONS = ['damaged', 'wrong_item', 'not_as_described', 'changed_mind', 'allergy', 'other'];

/** Customer return request + status of her requests on this order. */
export function OrderReturns({ orderId, items, returns, open, until, policyText, money }: {
  orderId: string; items: Item[]; returns: Ret[]; open: boolean; until: string | null; policyText: string | null; money: Record<string, string>;
}) {
  const t = useT();
  const router = useRouter();
  const [form, setForm] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reasonCode, setReasonCode] = useState('damaged');
  const [reason, setReason] = useState('');
  const [err, setErr] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(newIdempotencyKey);
  const eligible = items.filter((i) => i.returnable && i.quantity - i.returnedQty - i.openReturnQty > 0);
  const lines = Object.entries(qty).filter(([, q]) => q > 0).map(([orderItemId, quantity]) => ({ orderItemId, quantity }));
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      await apiFetch(`/api/v1/me/orders/${orderId}/returns`, { method: 'POST', body: { items: lines, reasonCode, reason }, idempotencyKey: key });
      setForm(false);
      setQty({});
      setReason('');
      setKey(newIdempotencyKey());
      router.refresh();
    } catch (x) {
      setErr(x as ApiError);
    } finally {
      setBusy(false);
    }
  }
  const groups = Object.values(returns.reduce<Record<string, Ret[]>>((g, r) => ((g[r.number] ??= []).push(r), g), {}));
  return (
    <section className="card stack" aria-labelledby="ret-h">
      <h2 id="ret-h" style={{ margin: 0, fontSize: '1.05rem' }}>{t('ret.title')}</h2>
      {groups.map((g) => (
        <div key={g[0].number} className="row between">
          <div>
            <span className="mono">{g[0].number}</span> · {g.map((r) => `${r.name} × ${r.quantity}`).join('، ')}
            {g[0].decisionNote && <div className="small muted">{g[0].decisionNote}</div>}
            {g[0].refundAmountMinor ? <div className="small">{t('ret.refund_amount')}: {money[g[0].number]}</div> : null}
          </div>
          <div className="row">
            <span className="badge">{t(`ret.s.${g[0].status}`)}</span>
            {g[0].status === 'requested' && (
              <button type="button" className="btn btn-quiet btn-sm" onClick={async () => { try { await apiFetch(`/api/v1/me/returns/${g[0].number}/cancel`, { method: 'POST', body: {} }); router.refresh(); } catch (x) { setErr(x as ApiError); } }}>{t('ret.cancel_request')}</button>
            )}
          </div>
        </div>
      ))}
      {open ? (
        !form ? (
          eligible.length ? (
            <div>
              <button type="button" className="btn btn-sm" onClick={() => setForm(true)}>{t('ret.request_cta')}</button>
              {until && <div className="small muted">{t('ret.window_until', { date: until })}</div>}
            </div>
          ) : <p className="small muted">{t('ret.nothing_eligible')}</p>
        ) : (
          <form onSubmit={submit} className="stack">
            <ErrorAlert error={err} />
            {policyText && <details><summary className="small">{t('ret.policy')}</summary><p className="small" style={{ whiteSpace: 'pre-line' }}>{policyText}</p></details>}
            {items.map((i) => {
              const max = i.quantity - i.returnedQty - i.openReturnQty;
              return (
                <Field key={i.id} label={`${i.name}${i.variantName ? ` — ${i.variantName}` : ''}`} hint={!i.returnable ? t('ret.not_returnable') : t('ret.max_qty', { n: Math.max(0, max) })}>
                  {(p) => <input {...p} className="input input-ltr" type="number" min={0} max={Math.max(0, max)} disabled={!i.returnable || max <= 0} value={qty[i.id] ?? 0} onChange={(e) => setQty({ ...qty, [i.id]: Math.max(0, Math.min(max, Number(e.target.value) || 0)) })} />}
                </Field>
              );
            })}
            <Field label={t('ret.reason')} required>{(p) => <select {...p} className="input" value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>{REASONS.map((r) => <option key={r} value={r}>{t(`ret.reason.${r}`)}</option>)}</select>}</Field>
            <Field label={t('ret.details')} required hint={t('ret.details_hint')}>{(p) => <textarea {...p} className="input" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
            <p className="small muted">{t('ret.customer_honest')}</p>
            <div className="form-actions">
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setForm(false)}>{t('common.cancel')}</button>
              <button type="submit" className="btn btn-gold btn-sm" disabled={busy || !lines.length || reason.trim().length < 3}>{t('ret.submit')}</button>
            </div>
          </form>
        )
      ) : (
        <p className="small muted">{until ? t('ret.window_closed_on', { date: until }) : t('ret.not_available')}</p>
      )}
    </section>
  );
}
