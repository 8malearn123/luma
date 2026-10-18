'use client';

import { useState } from 'react';
import { apiFetch, ApiError } from '@/lib/client/api';

/**
 * Adds a product to the (single-tenant) cart via the storefront cart API.
 * Price and stock are re-checked by the server at checkout; this only records intent.
 */
export function AddToCart({ slug, productId, variants, disabled, labels }: {
  slug: string;
  productId: string;
  variants: { id: string; name: string }[];
  disabled?: boolean;
  labels: { add: string; added: string; out: string; error: string; variant: string; viewCart: string };
}) {
  const [variantId, setVariantId] = useState<string | null>(variants[0]?.id ?? null);
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [msg, setMsg] = useState<string | null>(null);
  if (disabled) return <button type="button" className="sf-btn" aria-disabled="true" disabled>{labels.out}</button>;
  return (
    <div className="sf-row">
      {variants.length > 0 && (
        <label className="sf-field" style={{ margin: 0 }}>
          <span className="sf-small">{labels.variant}</span>
          <select className="sf-input" value={variantId ?? ''} onChange={(e) => setVariantId(e.target.value)}>
            {variants.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </label>
      )}
      <button
        type="button"
        className="sf-btn"
        disabled={state === 'busy'}
        onClick={async () => {
          setState('busy');
          setMsg(null);
          try {
            await apiFetch(`/api/v1/s/${slug}/cart`, { method: 'POST', body: { productId, variantId, quantity: 1 } });
            setState('done');
          } catch (e) {
            setState('error');
            setMsg(e instanceof ApiError ? e.message : null);
          }
        }}
      >
        {state === 'done' ? labels.added : labels.add}
      </button>
      {state === 'done' && <a href={`/s/${slug}/cart`}>{labels.viewCart}</a>}
      <span role="status" aria-live="polite" className="sf-small">{state === 'error' ? `${labels.error}${msg ? ` (${msg})` : ''}` : ''}</span>
    </div>
  );
}
