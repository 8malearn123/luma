'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ApiError, apiFetch, newIdempotencyKey } from '@/lib/client/api';
import { formatDateTime, formatMoney } from '@/lib/format';
import { useLocale, useT } from '../I18n';
import { CartLines, type CartData } from './CartView';
import { AddressForm, addressText, type Address } from '../account/AddressBook';
import './booking.css';

interface Quote extends CartData {
  branch: { id: string; name: string; address: string | null };
  payOnline: boolean;
  payAtPickup: boolean;
  cashOnDelivery: boolean;
  fulfillment: ('pickup' | 'delivery')[];
  deliveryInstructions: string | null;
  addresses: Address[];
  returns: { windowDays: number; policyText: string | null } | null;
  policyText: string | null;
}
type DeliveryQuote =
  | { ok: true; zoneName: string; feeMinor: number; freeOverMinor: number | null; etaMinHours: number; etaMaxHours: number }
  | { ok: false; reason: 'not_covered' | 'below_minimum' | 'disabled'; minOrderMinor?: number };
interface Placed {
  orderId: string;
  number: string;
  totalMinor: number;
  terms: 'full' | 'on_site';
  fulfillment: 'pickup' | 'delivery';
  deliveryFeeMinor: number;
  holdExpiresAt: string;
  payment: { checkoutUrl: string | null } | null;
}

/** Checkout: server-priced quote (incl. delivery fee from the business's zones); the customer approves the exact total. */
export function CheckoutView({ slug, timezone }: { slug: string; timezone: string }) {
  const t = useT();
  const locale = useLocale();
  const [q, setQ] = useState<Quote | null>(null);
  const [err, setErr] = useState<ApiError | null>(null);
  const [mode, setMode] = useState<'online' | 'pickup'>('online');
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState<Placed | null>(null);
  const [method, setMethod] = useState<'pickup' | 'delivery'>('pickup');
  const [addressId, setAddressId] = useState<string | null>(null);
  const [addingAddress, setAddingAddress] = useState(false);
  const [dq, setDq] = useState<DeliveryQuote | null>(null);
  const key = useRef(newIdempotencyKey());
  const m = (x: number) => formatMoney(x, 'SAR', locale);

  const load = () =>
    apiFetch<Quote>(`/api/v1/s/${slug}/quote`)
      .then((r) => {
        setQ(r);
        setMode(r.payOnline ? 'online' : 'pickup');
        setApproved(false);
        setMethod((cur) => (r.fulfillment.includes(cur) ? cur : r.fulfillment[0] ?? 'pickup'));
        setAddressId((cur) => (cur && r.addresses.some((a) => a.id === cur) ? cur : (r.addresses.find((a) => a.isDefault) ?? r.addresses[0])?.id ?? null));
      })
      .catch(setErr);
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const [coupon, setCoupon] = useState('');

  // delivery fee comes from the server for the chosen address
  useEffect(() => {
    if (method !== 'delivery' || !addressId || !q) return setDq(null);
    let live = true;
    apiFetch<DeliveryQuote>(`/api/v1/s/${slug}/delivery-quote?addressId=${addressId}&subtotalMinor=${q.subtotalMinor}`)
      .then((r) => live && (setDq(r), setApproved(false)))
      .catch(() => live && setDq({ ok: false, reason: 'not_covered' }));
    return () => {
      live = false;
    };
  }, [method, addressId, q, slug]);
  const fee = method === 'delivery' && dq?.ok ? dq.feeMinor : 0;
  const total = (q?.subtotalMinor ?? 0) + fee;

  async function place() {
    if (!q || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await apiFetch<Placed>(`/api/v1/s/${slug}/checkout`, {
        method: 'POST',
        body: {
          branchId: q.branch.id, acceptedSubtotalMinor: q.subtotalMinor, payAtPickup: mode === 'pickup', couponCode: coupon.trim() || undefined,
          fulfillment: method, ...(method === 'delivery' ? { addressId, acceptedDeliveryFeeMinor: fee } : {}),
        },
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
      if (ae.code === 'conflict') void load(); // price/stock/fee changed: re-quote for approval
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
          {placed.fulfillment === 'pickup' && <p>{t('checkout.reserved_until', { time: formatDateTime(placed.holdExpiresAt, { tz: timezone, locale }) })}</p>}
          <p>{placed.fulfillment === 'delivery' ? t('checkout.cod') : t('checkout.pay_at_pickup')} — {m(placed.totalMinor)}</p>
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
  const onSiteOk = method === 'delivery' ? q.cashOnDelivery : q.payAtPickup;
  const noPay = !q.payOnline && !onSiteOk;
  const deliveryBlocked = method === 'delivery' && (!addressId || !dq?.ok);
  return (
    <div className="sf-container sf-section">
      <h1 className="sf-h1">{t('checkout.title')}</h1>
      {err && <div className="sf-alert" role="alert">{t(err.message)}</div>}
      {q.priceChanged && <div className="sf-alert">{t('cart.price_changed_notice')}</div>}
      <CartLines cart={q} />
      {q.fulfillment.length > 1 && (
        <fieldset className="sf-field">
          <legend>{t('checkout.fulfillment')}</legend>
          <label className="sf-check"><input type="radio" name="ful" checked={method === 'pickup'} onChange={() => setMethod('pickup')} /> {t('checkout.pickup')}</label>
          <label className="sf-check"><input type="radio" name="ful" checked={method === 'delivery'} onChange={() => setMethod('delivery')} /> {t('checkout.delivery')}</label>
        </fieldset>
      )}
      {method === 'pickup' ? (
        <div className="sf-card">
          <h2 className="sf-h3">{t('checkout.pickup')}</h2>
          <p>{q.branch.name}{q.branch.address ? ` — ${q.branch.address}` : ''}</p>
          {!q.fulfillment.includes('delivery') && <p className="sf-muted">{t('checkout.pickup_only')}</p>}
        </div>
      ) : (
        <div className="sf-card">
          <h2 className="sf-h3">{t('checkout.delivery_to')}</h2>
          {q.addresses.length > 0 && !addingAddress && (
            <fieldset className="sf-field">
              <legend className="sf-muted">{t('checkout.choose_address')}</legend>
              {q.addresses.map((a) => (
                <label key={a.id} className="sf-check">
                  <input type="radio" name="addr" checked={addressId === a.id} onChange={() => setAddressId(a.id)} /> <span><strong>{a.label || a.recipientName}</strong> — {addressText(a)}</span>
                </label>
              ))}
            </fieldset>
          )}
          {addingAddress || !q.addresses.length ? (
            <AddressForm variant="sf" onSaved={(a) => { setAddingAddress(false); setAddressId(a.id); void load(); }} onCancel={q.addresses.length ? () => setAddingAddress(false) : undefined} />
          ) : (
            <button type="button" className="sf-btn-secondary" onClick={() => setAddingAddress(true)}>{t('addr.add')}</button>
          )}
          {dq && (dq.ok ? (
            <p>{t('checkout.delivery_fee')}: <strong>{fee === 0 ? t('checkout.free') : m(fee)}</strong> · {t('checkout.eta', { a: dq.etaMinHours, b: dq.etaMaxHours })}{dq.freeOverMinor && fee > 0 ? <span className="sf-muted"> · {t('checkout.free_over', { amount: m(dq.freeOverMinor) })}</span> : null}</p>
          ) : (
            <div className="sf-alert" role="alert">{t(`checkout.delivery_${dq.reason}`, { amount: dq.minOrderMinor ? m(dq.minOrderMinor) : '' })}</div>
          ))}
          {q.deliveryInstructions && <p className="sf-muted" style={{ whiteSpace: 'pre-line' }}>{q.deliveryInstructions}</p>}
          <p className="sf-muted">{t('checkout.delivery_honest')}</p>
        </div>
      )}
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
          {onSiteOk && (
            <label className="sf-check">
              <input type="radio" name="pay" checked={mode === 'pickup'} onChange={() => setMode('pickup')} /> {method === 'delivery' ? t('checkout.cod') : t('checkout.pay_at_pickup')}
            </label>
          )}
        </fieldset>
      )}
      {q.returns && (
        <details className="sf-card">
          <summary>{t('checkout.returns_policy', { days: q.returns.windowDays })}</summary>
          {q.returns.policyText && <p style={{ whiteSpace: 'pre-line' }}>{q.returns.policyText}</p>}
        </details>
      )}
      {q.policyText && (
        <details className="sf-card">
          <summary>{t('booking.policy')}</summary>
          <p style={{ whiteSpace: 'pre-line' }}>{q.policyText}</p>
        </details>
      )}
      <div className="sf-field">
        <label htmlFor="co-coupon">{t('booking.coupon')}</label>
        <input id="co-coupon" className="sf-input" maxLength={40} autoComplete="off" value={coupon} onChange={(e) => setCoupon(e.target.value)} />
        <span className="sf-muted">{t('checkout.coupon_hint')}</span>
      </div>
      <label className="sf-check">
        <input type="checkbox" checked={approved} onChange={(e) => setApproved(e.target.checked)} /> {t('checkout.approve_total', { total: m(total) })}
        {fee > 0 && <span className="sf-muted"> ({t('checkout.incl_delivery', { fee: m(fee) })})</span>}
      </label>
      <div className="sf-actions">
        <Link className="sf-btn-secondary" href={`/s/${slug}/cart`}>{t('common.back')}</Link>
        <button type="button" className="sf-btn" disabled={!approved || busy || noPay || !q.ok || deliveryBlocked} onClick={place}>
          {busy ? t('common.loading') : t('checkout.place_order')}
        </button>
      </div>
    </div>
  );
}
