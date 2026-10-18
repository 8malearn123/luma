'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ApiError, apiFetch } from '@/lib/client/api';
import { formatMoney } from '@/lib/format';
import { useLocale, useT } from '../I18n';
import './booking.css';

export interface CartLine {
  productId: string;
  variantId: string | null;
  name: string;
  variantName: string | null;
  quantity: number;
  unitPriceMinor: number;
  seenPriceMinor: number;
  priceChanged: boolean;
  lineTotalMinor: number;
  available: number;
  maxPerOrder: number;
  problem: null | 'unavailable' | 'insufficient_stock' | 'over_limit';
}
export interface CartData {
  lines: CartLine[];
  subtotalMinor: number;
  priceChanged: boolean;
  ok: boolean;
}

export function CartLines({ cart, onQty, onRemove, busy }: { cart: CartData; onQty?: (l: CartLine, q: number) => void; onRemove?: (l: CartLine) => void; busy?: boolean }) {
  const t = useT();
  const locale = useLocale();
  const m = (x: number) => formatMoney(x, 'SAR', locale);
  return (
    <table className="sf-table">
      <thead>
        <tr>
          <th>{t('common.name')}</th>
          <th>{t('cart.qty')}</th>
          <th>{t('common.total')}</th>
          {onRemove && <th><span className="sr-only">{t('common.actions')}</span></th>}
        </tr>
      </thead>
      <tbody>
        {cart.lines.map((l) => (
          <tr key={`${l.productId}:${l.variantId ?? ''}`}>
            <td>
              <div>{l.name}{l.variantName ? ` — ${l.variantName}` : ''}</div>
              <div className="sf-muted">{m(l.unitPriceMinor)}</div>
              {l.priceChanged && <div className="sf-badge">{t('cart.price_changed_line', { old: m(l.seenPriceMinor) })}</div>}
              {l.problem && <div className="sf-badge" role="alert">{t(`cart.problem.${l.problem}`, { n: l.available })}</div>}
            </td>
            <td>
              {onQty ? (
                <input
                  className="sf-input sf-qty"
                  type="number"
                  min={1}
                  max={l.maxPerOrder}
                  aria-label={t('cart.qty')}
                  value={l.quantity}
                  disabled={busy}
                  onChange={(e) => {
                    const q = Math.max(1, Math.min(l.maxPerOrder, Number(e.target.value) || 1));
                    onQty(l, q);
                  }}
                />
              ) : (
                l.quantity
              )}
            </td>
            <td>{m(l.lineTotalMinor)}</td>
            {onRemove && (
              <td>
                <button type="button" className="sf-btn-secondary" disabled={busy} onClick={() => onRemove(l)}>
                  {t('booking.remove')}
                </button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function CartView({ slug }: { slug: string }) {
  const t = useT();
  const locale = useLocale();
  const [cart, setCart] = useState<CartData | null>(null);
  const [err, setErr] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const base = `/api/v1/s/${slug}/cart`;
  useEffect(() => {
    apiFetch<CartData>(base).then(setCart).catch(setErr);
  }, [base]);
  const run = async (p: Promise<CartData>) => {
    setBusy(true);
    try {
      setCart(await p);
      setErr(null);
    } catch (e) {
      setErr(e as ApiError);
    } finally {
      setBusy(false);
    }
  };
  if (err && !cart) return <div className="sf-alert" role="alert">{t(err.message)}</div>;
  if (!cart) return <p className="sf-muted">{t('common.loading')}</p>;
  return (
    <div className="sf-container sf-section">
      <h1 className="sf-h1">{t('cart.title')}</h1>
      {err && <div className="sf-alert" role="alert">{t(err.message)}</div>}
      {cart.lines.length === 0 ? (
        <>
          <p className="sf-muted">{t('cart.empty')}</p>
          <Link className="sf-btn" href={`/s/${slug}/products`}>{t('cart.continue_shopping')}</Link>
        </>
      ) : (
        <>
          {cart.priceChanged && <div className="sf-alert">{t('cart.price_changed_notice')}</div>}
          <CartLines
            cart={cart}
            busy={busy}
            onQty={(l, q) => run(apiFetch<CartData>(base, { method: 'POST', body: { productId: l.productId, variantId: l.variantId, quantity: q } }))}
            onRemove={(l) => run(apiFetch<CartData>(base, { method: 'DELETE', body: { productId: l.productId, variantId: l.variantId } }))}
          />
          <div className="sf-row" style={{ marginTop: 12 }}>
            <strong>{t('cart.subtotal')}</strong>
            <strong>{formatMoney(cart.subtotalMinor, 'SAR', locale)}</strong>
          </div>
          <div className="sf-actions">
            <Link className="sf-btn-secondary" href={`/s/${slug}/products`}>{t('cart.continue_shopping')}</Link>
            <Link className="sf-btn" aria-disabled={!cart.ok} href={cart.ok ? `/s/${slug}/checkout` : '#'}>{t('cart.checkout')}</Link>
          </div>
        </>
      )}
    </div>
  );
}
