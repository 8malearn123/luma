'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ApiError, apiFetch, newIdempotencyKey } from '@/lib/client/api';
import { formatDateTime, formatMoney } from '@/lib/format';
import { useLocale, useT } from '../I18n';
import { CartLines, type CartData } from './CartView';
import './booking.css';

interface Quote extends CartData {
  branch: { id: string; name: string; address: string | null };
  payOnline: boolean;
  payAtPickup: boolean;
  policyText: string | null;
}
interface Placed {
  orderId: string;
  number: string;
  totalMinor: number;
  terms: 'full' | 'on_site';
  holdExpiresAt: string;
  payment: { checkoutUrl: string | null } | null;
}

/** Checkout: server-priced quote; the customer approves the exact total; pickup only. */
export function CheckoutView({ slug, timezone }: { slug: string; timezone: string }) {
  const t = useT();
  const locale = useLocale();
  const [q, setQ] = useState<Quote | null>(null);
  const [err, setErr] = useState<ApiError | null>(null);
  const [mode, setMode] = useState<'online' | 'pickup'>('online');
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState<Placed | null>(null);
  const key = useRef(newIdempotencyKey());
  const m = (x: number) => formatMoney(x, 'SAR', locale);

  const load = () =>
    apiFetch<Quote>(`/api/v1/s/${slug}/quote`)
      .then((r) => {
        setQ(r);
        setMode(r.payOnline ? 'online' : 'pickup');
        setApproved(false);
      })
      .catch(setErr);
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function place() {
    if (!q || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await apiFetch<Placed>(`/api/v1/s/${slug}/checkout`, {
        method: 'POST',
        body: { branchId: q.branch.id, acceptedSubtotalMinor: q.subtotalMinor, payAtPickup: mode === 'pickup' },
        idempotencyKey: key.current,
      });
      if (r.payment?.checkoutUrl) {
        window.location.href = r.payment.checkoutUrl;
        return;
      }
      setPlaced(r);
    } catch (e) {
      const ae = e as ApiError;
      setErr(ae);
      key.current = newIdempotencyKey();
      if (ae.code === 'conflict') void load(); // price/stock changed: re-quote for approval
    } finally {
      setBusy(false);
    }
  }

  if (placed)
    return (
      <div className="sf-container sf-section">
        <h1 className="sf-h1">{t('checkout.placed')}</h1>
        <div className="sf-card">
          <p>
            {t('booking.number')}: <strong className="ltr-num">{placed.number}</strong>
          </p>
          <p>{t('checkout.reserved_until', { time: formatDateTime(placed.holdExpiresAt, { tz: timezone, locale }) })}</p>
          <p>{t('checkout.pay_at_pickup')} — {m(placed.totalMinor)}</p>
        </div>
        <div className="sf-actions">
          <Link className="sf-btn" href={`/account/orders/${placed.orderId}`}>{t('booking.view_in_account')}</Link>
        </div>
      </div>
    );
  if (!q) return <div className="sf-container sf-section">{err ? <div className="sf-alert" role="alert">{t(err.message)}</div> : <p className="sf-muted">{t('common.loading')}</p>}</div>;
  if (!q.lines.length)
    return (
      <div className="sf-container sf-section">
        <p className="sf-muted">{t('cart.empty')}</p>
        <Link className="sf-btn" href={`/s/${slug}/products`}>{t('cart.continue_shopping')}</Link>
      </div>
    );
  const noPay = !q.payOnline && !q.payAtPickup;
  return (
    <div className="sf-container sf-section">
      <h1 className="sf-h1">{t('checkout.title')}</h1>
      {err && <div className="sf-alert" role="alert">{t(err.message)}</div>}
      {q.priceChanged && <div className="sf-alert">{t('cart.price_changed_notice')}</div>}
      <CartLines cart={q} />
      <div className="sf-card">
        <h2 className="sf-h3">{t('checkout.pickup')}</h2>
        <p>{q.branch.name}{q.branch.address ? ` — ${q.branch.address}` : ''}</p>
        <p className="sf-muted">{t('checkout.pickup_only')}</p>
      </div>
      {noPay ? (
        <div className="sf-alert" role="alert">{t('checkout.no_payment')}</div>
      ) : (
        <fieldset className="sf-field">
          <legend>{t('booking.payment_options')}</legend>
          {q.payOnline && (
            <label className="sf-check">
              <input type="radio" name="pay" checked={mode === 'online'} onChange={() => setMode('online')} /> {t('checkout.pay_online')}
            </label>
          )}
          {q.payAtPickup && (
            <label className="sf-check">
              <input type="radio" name="pay" checked={mode === 'pickup'} onChange={() => setMode('pickup')} /> {t('checkout.pay_at_pickup')}
            </label>
          )}
        </fieldset>
      )}
      {q.policyText && (
        <details className="sf-card">
          <summary>{t('booking.policy')}</summary>
          <p style={{ whiteSpace: 'pre-line' }}>{q.policyText}</p>
        </details>
      )}
      <label className="sf-check">
        <input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} /> {t('checkout.approve_total', { total: m(q.subtotalMinor) })}
      </label>
      <div className="sf-actions">
        <Link className="sf-btn-secondary" href={`/s/${slug}/cart`}>{t('common.back')}</Link>
        <button type="button" className="sf-btn" disabled={!approved || busy || noPay || !q.ok} onClick={place}>
          {busy ? t('common.loading') : t('checkout.place_order')}
        </button>
      </div>
    </div>
  );
}
