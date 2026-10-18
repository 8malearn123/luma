'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ApiError, apiFetch } from '@/lib/client/api';
import { useT } from '../I18n';
import { ErrorAlert } from '../ui/forms';
import { Icon } from '../Icon';

/** GET helper with loading / error / reload and stale-request protection. */
export function useApi<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(!!url);
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!url) return;
    const my = ++seq.current;
    setLoading(true);
    try {
      const d = await apiFetch<T>(url);
      if (my === seq.current) {
        setData(d);
        setError(null);
      }
    } catch (e) {
      if (my === seq.current) setError(e instanceof ApiError ? e : new ApiError('internal', 'errors.internal', 500));
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [url]);
  useEffect(() => {
    void load();
  }, [load]);
  return { data, error, loading, reload: load, setData };
}

/** Standard loading / error / permission-denied rendering around a data region. */
export function DataState({ loading, error, onRetry, children, rows = 3 }: { loading: boolean; error: ApiError | null; onRetry?: () => void; children: ReactNode; rows?: number }) {
  const t = useT();
  if (error) {
    if (error.status === 403)
      return (
        <div className="alert warn" role="alert">
          <Icon name="lock" size={18} /> {t('common.permission_denied')}
        </div>
      );
    return (
      <div>
        <ErrorAlert error={error} />
        {onRetry && (
          <button type="button" className="btn btn-sm" onClick={onRetry}>
            {t('common.retry')}
          </button>
        )}
      </div>
    );
  }
  if (loading)
    return (
      <div className="stack" aria-busy="true" aria-label={t('common.loading')}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="skeleton" style={{ height: 38 }} />
        ))}
      </div>
    );
  return <>{children}</>;
}

/** Money input in SAR that keeps integer minor units. */
export function MoneyInput({ id, value, onChange, ...rest }: { id?: string; value: number | null; onChange: (v: number | null) => void; 'aria-describedby'?: string; 'aria-invalid'?: boolean; required?: boolean }) {
  const [text, setText] = useState(value == null ? '' : (value / 100).toString());
  useEffect(() => {
    setText(value == null ? '' : (value / 100).toString());
  }, [value]);
  return (
    <input
      id={id}
      {...rest}
      className="input input-ltr mono"
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const s = e.target.value.trim();
        if (!s) return onChange(null);
        const m = /^(\d{1,9})(?:\.(\d{1,2}))?$/.exec(s);
        if (m) onChange(Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0')));
      }}
    />
  );
}

export function Tabs({ tabs, value, onChange }: { tabs: { key: string; label: string }[]; value: string; onChange: (k: string) => void }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tb) => (
        <button key={tb.key} type="button" role="tab" className="tab" aria-selected={value === tb.key} onClick={() => onChange(tb.key)}>
          {tb.label}
        </button>
      ))}
    </div>
  );
}

/** Keep a tab in the URL (?tab=) so deep links and back navigation work. */
export function useUrlTab(defaultKey: string): [string, (k: string) => void] {
  const [tab, setTab] = useState(defaultKey);
  useEffect(() => {
    const k = new URL(location.href).searchParams.get('tab');
    if (k) setTab(k);
  }, []);
  const set = (k: string) => {
    setTab(k);
    const u = new URL(location.href);
    u.searchParams.set('tab', k);
    history.replaceState(null, '', u);
  };
  return [tab, set];
}

export function PageHead({ title, crumbs, actions }: { title: string; crumbs?: string; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        {crumbs && <div className="crumbs">{crumbs}</div>}
        <h1>{title}</h1>
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export const statusBadge = (s: string) =>
  ({
    confirmed: 'green', completed: 'green', paid: 'green', collected: 'green', succeeded: 'green', ready: 'green', active: 'green',
    held: 'amber', pending_payment: 'amber', pending: 'amber', processing: 'amber', preparing: 'blue', checked_in: 'blue', in_service: 'blue',
    deposit_paid: 'blue', partially_paid: 'amber', refund_pending: 'amber', partially_refunded: 'amber', needs_review: 'red',
    cancelled: 'red', no_show: 'red', expired: '', failed: 'red', refunded: '', unpaid: 'amber', suspended: 'red',
  })[s] ?? '';
