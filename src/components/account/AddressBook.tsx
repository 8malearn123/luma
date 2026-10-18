'use client';

import { useCallback, useEffect, useState } from 'react';
import { ApiError, apiFetch, newIdempotencyKey } from '@/lib/client/api';
import { useT } from '../I18n';
import { EmptyState, ErrorAlert } from '../ui/forms';

export interface Address {
  id: string;
  label: string | null;
  recipientName: string;
  phone: string;
  city: string;
  district: string | null;
  street: string;
  buildingNo: string | null;
  postalCode: string | null;
  notes: string | null;
  isDefault: boolean;
}
type Draft = Omit<Address, 'id'>;
const EMPTY: Draft = { label: '', recipientName: '', phone: '+966', city: '', district: '', street: '', buildingNo: '', postalCode: '', notes: '', isDefault: false };

export const addressText = (a: Pick<Address, 'buildingNo' | 'street' | 'district' | 'city' | 'postalCode'>) => [a.buildingNo, a.street, a.district, a.city, a.postalCode].filter(Boolean).join('، ');

/**
 * Address form used in the account and at checkout. `variant` only switches
 * class names (account app styles vs. the storefront's own theme).
 */
export function AddressForm({ initial, onSaved, onCancel, variant = 'app' }: { initial?: Address; onSaved: (a: { id: string }) => void; onCancel?: () => void; variant?: 'app' | 'sf' }) {
  const t = useT();
  const [v, setV] = useState<Draft>(initial ? { ...initial } : EMPTY);
  const [err, setErr] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [key] = useState(newIdempotencyKey);
  const c = variant === 'sf' ? { input: 'sf-input', field: 'sf-field', btn: 'sf-btn', btn2: 'sf-btn-secondary', check: 'sf-check', alert: 'sf-alert' } : { input: 'input', field: 'field', btn: 'btn btn-gold btn-sm', btn2: 'btn btn-quiet btn-sm', check: 'check', alert: '' };
  const field = (k: keyof Draft, label: string, opts: { required?: boolean; ltr?: boolean; type?: string; max?: number; autoComplete?: string } = {}) => (
    <div className={c.field}>
      <label htmlFor={`addr-${k}`}>{label}{opts.required ? ' *' : ''}</label>
      <input
        id={`addr-${k}`}
        className={`${c.input}${opts.ltr ? ' input-ltr' : ''}`}
        type={opts.type ?? 'text'}
        dir={opts.ltr ? 'ltr' : undefined}
        maxLength={opts.max}
        required={opts.required}
        autoComplete={opts.autoComplete}
        value={(v[k] as string) ?? ''}
        onChange={(e) => setV({ ...v, [k]: e.target.value })}
      />
    </div>
  );
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const body = { ...v, label: v.label || null, district: v.district || null, buildingNo: v.buildingNo || null, postalCode: v.postalCode || null, notes: v.notes || null };
      const r = initial
        ? await apiFetch<{ id: string }>(`/api/v1/me/addresses/${initial.id}`, { method: 'PUT', body })
        : await apiFetch<{ id: string }>('/api/v1/me/addresses', { method: 'POST', body, idempotencyKey: key });
      onSaved(r);
    } catch (x) {
      setErr(x as ApiError);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="stack" aria-busy={busy}>
      {err && (variant === 'sf' ? <div className={c.alert} role="alert">{t(err.message)}</div> : <ErrorAlert error={err} />)}
      {field('recipientName', t('addr.recipient'), { required: true, max: 120, autoComplete: 'name' })}
      {field('phone', t('addr.phone'), { required: true, ltr: true, type: 'tel', max: 16, autoComplete: 'tel' })}
      {field('city', t('addr.city'), { required: true, max: 80, autoComplete: 'address-level2' })}
      {field('district', t('addr.district'), { max: 80, autoComplete: 'address-level3' })}
      {field('street', t('addr.street'), { required: true, max: 200, autoComplete: 'address-line1' })}
      {field('buildingNo', t('addr.building'), { ltr: true, max: 20 })}
      {field('postalCode', t('addr.postal'), { ltr: true, max: 5, autoComplete: 'postal-code' })}
      {field('notes', t('addr.notes'), { max: 300 })}
      {field('label', t('addr.label'), { max: 40 })}
      <label className={c.check}><input type="checkbox" checked={v.isDefault} onChange={(e) => setV({ ...v, isDefault: e.target.checked })} /> {t('addr.make_default')}</label>
      <div className="row" style={{ gap: 8 }}>
        {onCancel && <button type="button" className={c.btn2} onClick={onCancel}>{t('common.cancel')}</button>}
        <button type="submit" className={c.btn} disabled={busy || !v.recipientName.trim() || !v.city.trim() || !v.street.trim() || !/^\+[1-9]\d{7,14}$/.test(v.phone)}>{busy ? t('common.loading') : t('common.save')}</button>
      </div>
    </form>
  );
}

/** /account/addresses — the person's own address book (RLS: owner only). */
export function AddressBook() {
  const t = useT();
  const [items, setItems] = useState<Address[] | null>(null);
  const [err, setErr] = useState<ApiError | null>(null);
  const [edit, setEdit] = useState<Address | 'new' | null>(null);
  const load = useCallback(() => apiFetch<{ items: Address[] }>('/api/v1/me/addresses').then((r) => setItems(r.items)).catch(setErr), []);
  useEffect(() => {
    void load();
  }, [load]);
  if (!items) return err ? <ErrorAlert error={err} /> : <div className="skeleton" style={{ height: 120 }} />;
  return (
    <div className="stack">
      <p className="small muted">{t('addr.privacy')}</p>
      {err && <ErrorAlert error={err} />}
      {edit ? (
        <div className="card"><AddressForm initial={edit === 'new' ? undefined : edit} onSaved={() => { setEdit(null); void load(); }} onCancel={() => setEdit(null)} /></div>
      ) : (
        <div><button type="button" className="btn btn-gold btn-sm" onClick={() => setEdit('new')}>{t('addr.add')}</button></div>
      )}
      {!items.length && !edit && <EmptyState icon="pin" title={t('addr.empty')} />}
      {items.map((a) => (
        <div key={a.id} className="card row between">
          <div>
            <strong>{a.label || a.recipientName}</strong> {a.isDefault && <span className="badge gold">{t('addr.default')}</span>}
            <div>{a.recipientName} · <span className="mono" dir="ltr">{a.phone}</span></div>
            <div className="small muted">{addressText(a)}</div>
          </div>
          <div className="row">
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setEdit(a)}>{t('common.edit')}</button>
            <button type="button" className="btn btn-quiet btn-sm" onClick={async () => { if (!window.confirm(t('addr.delete_confirm'))) return; try { await apiFetch(`/api/v1/me/addresses/${a.id}`, { method: 'DELETE' }); void load(); } catch (x) { setErr(x as ApiError); } }}>{t('common.delete')}</button>
          </div>
        </div>
      ))}
    </div>
  );
}
