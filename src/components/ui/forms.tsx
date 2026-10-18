'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ApiError, apiFetch, newIdempotencyKey } from '@/lib/client/api';
import { useT } from '../I18n';
import { Icon } from '../Icon';

/** Labeled field with hint + error, wired for screen readers. */
export function Field({
  label,
  hint,
  error,
  children,
  required,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean; required?: boolean }) => ReactNode;
}) {
  const id = useId();
  const t = useT();
  const desc = [hint ? `${id}-h` : '', error ? `${id}-e` : ''].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : <span className="muted small"> ({t('common.optional')})</span>}
      </label>
      {children({ id, 'aria-describedby': desc, 'aria-invalid': error ? true : undefined, required })}
      {hint && (
        <span id={`${id}-h`} className="hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={`${id}-e`} className="err" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

export interface SubmitState {
  busy: boolean;
  error: ApiError | null;
  fieldErrors: Record<string, string>;
}

/**
 * Submission helper: disables re-submission while in flight, keeps one
 * idempotency key per logical submission (reused on retry, reset on success),
 * and maps server validation details to field errors without clearing input.
 */
export function useSubmit<TBody, TRes>(path: string | (() => string), method: 'POST' | 'PATCH' | 'PUT' | 'DELETE' = 'POST') {
  const [state, setState] = useState<SubmitState>({ busy: false, error: null, fieldErrors: {} });
  const keyRef = useRef<string | null>(null);
  const t = useT();
  const submit = useCallback(
    async (body?: TBody, opts: { ifMatch?: string | number } = {}): Promise<TRes | null> => {
      if (state.busy) return null;
      keyRef.current ??= newIdempotencyKey();
      setState({ busy: true, error: null, fieldErrors: {} });
      try {
        const res = await apiFetch<TRes>(typeof path === 'function' ? path() : path, {
          method,
          body: body ?? {},
          idempotencyKey: keyRef.current,
          ifMatch: opts.ifMatch,
        });
        keyRef.current = null;
        setState({ busy: false, error: null, fieldErrors: {} });
        return res;
      } catch (e) {
        const err = e instanceof ApiError ? e : new ApiError('internal', 'errors.internal', 500);
        const fe: Record<string, string> = {};
        const d = err.details as { fieldErrors?: Record<string, string[]> } | Record<string, string> | undefined;
        if (d && typeof d === 'object') {
          if ('fieldErrors' in d && d.fieldErrors) {
            for (const [k, v] of Object.entries(d.fieldErrors)) if (v?.[0]) fe[k] = t(v[0]) === v[0] ? v[0] : t(v[0]);
          } else {
            for (const [k, v] of Object.entries(d)) if (typeof v === 'string' && v.startsWith('errors.')) fe[k] = t(v);
          }
        }
        // a definitive server answer (4xx except 409 in-progress) gets a fresh key next time
        if (err.status >= 400 && err.status < 500 && err.code !== 'conflict') keyRef.current = null;
        setState({ busy: false, error: err, fieldErrors: fe });
        return null;
      }
    },
    [path, method, state.busy, t],
  );
  return { ...state, submit };
}

export function ErrorAlert({ error }: { error: ApiError | null }) {
  const t = useT();
  if (!error) return null;
  return (
    <div className="alert error" role="alert">
      <Icon name="alert" size={18} />
      <div>
        <div>{t(error.message, (error.details as Record<string, string | number>) ?? undefined)}</div>
        {error.requestId && <div className="small muted mono">ref: {error.requestId.slice(0, 8)}</div>}
      </div>
    </div>
  );
}

/** Warn before leaving with unsaved changes (tab close + in-app link clicks). */
export function useUnsavedGuard(dirty: boolean) {
  const t = useT();
  useEffect(() => {
    if (!dirty) return;
    const onBefore = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (a && !a.target && a.origin === location.origin && !window.confirm(t('common.unsaved_changes'))) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener('beforeunload', onBefore);
    document.addEventListener('click', onClick, true);
    return () => {
      window.removeEventListener('beforeunload', onBefore);
      document.removeEventListener('click', onClick, true);
    };
  }, [dirty, t]);
}

export function EmptyState({ icon = 'box', title, children }: { icon?: Parameters<typeof Icon>[0]['name']; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={34} />
      <div style={{ fontWeight: 600, color: 'var(--text2)' }}>{title}</div>
      {children && <div className="small" style={{ marginTop: 6 }}>{children}</div>}
    </div>
  );
}

export function Drawer({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <div className="drawer-head">
          <h2 style={{ margin: 0, fontSize: '1.05rem' }}>{title}</h2>
          <button type="button" className="btn icon-btn" onClick={onClose} aria-label={t('common.close')}>
            <Icon name="x" size={18} />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-head" style={{ borderTop: '1px solid var(--line)', borderBottom: 0 }}>{footer}</div>}
      </div>
    </>
  );
}
