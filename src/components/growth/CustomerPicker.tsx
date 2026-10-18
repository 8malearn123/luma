'use client';

import { useEffect, useId, useState } from 'react';
import { apiFetch } from '@/lib/client/api';
import { useT } from '../I18n';

interface Row {
  id: string;
  displayName: string;
  phone: string | null;
}

/** Accessible combobox-lite: search this business's customers (server-limited to 20). */
export function CustomerPicker({ tenant, value, onChange }: { tenant: string; value: Row | null; onChange: (r: Row | null) => void }) {
  const t = useT();
  const id = useId();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (value) return;
    const ctl = new AbortController();
    const h = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await apiFetch<{ items: Row[] }>(`/api/v1/t/${tenant}/loyalty/customers?q=${encodeURIComponent(q)}`, { signal: ctl.signal });
        setRows(r.items);
      } catch {
        /* keep previous */
      } finally {
        setBusy(false);
      }
    }, 250);
    return () => {
      clearTimeout(h);
      ctl.abort();
    };
  }, [q, tenant, value]);
  if (value) {
    return (
      <div className="row between card" style={{ padding: '8px 12px' }}>
        <span>
          {value.displayName} {value.phone && <span className="muted small mono">{value.phone}</span>}
        </span>
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => onChange(null)}>
          {t('common.edit')}
        </button>
      </div>
    );
  }
  return (
    <div className="field">
      <label htmlFor={id}>{t('growth.customer')}</label>
      <input id={id} className="input" placeholder={t('growth.search_customer')} value={q} onChange={(e) => setQ(e.target.value)} aria-busy={busy} />
      <div role="listbox" aria-label={t('growth.pick_customer')} className="stack" style={{ gap: 4, marginTop: 6, maxHeight: 220, overflowY: 'auto' }}>
        {rows.map((r) => (
          <button key={r.id} type="button" role="option" aria-selected={false} className="btn btn-quiet btn-sm" style={{ justifyContent: 'flex-start' }} onClick={() => onChange(r)}>
            {r.displayName} {r.phone && <span className="muted small mono">{r.phone}</span>}
          </button>
        ))}
        {!busy && rows.length === 0 && <span className="small muted">{t('common.empty')}</span>}
      </div>
    </div>
  );
}
