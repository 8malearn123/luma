'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiFetch } from '@/lib/client/api';
import { parseMoneyToMinor } from '@/lib/format';
import { useT } from '../I18n';
import { ErrorAlert, Field, useSubmit } from '../ui/forms';
import { useToast } from '../ui/Toast';

export interface FieldDef {
  name: string;
  label: string;
  type?: 'text' | 'textarea' | 'select' | 'number' | 'checkbox' | 'datetime' | 'money' | 'list' | 'json' | 'password';
  options?: { value: string; label: string }[];
  required?: boolean;
  hint?: string;
  defaultValue?: string | number | boolean | null;
  /** for type=number: empty → null */
  nullable?: boolean;
  ltr?: boolean;
}

/**
 * Declarative admin/policy form: converts field types (money → minor units,
 * datetime-local → ISO, list → string[], json → value), keeps input after
 * errors, retries with the same idempotency key, and handles step-up
 * re-authentication inline when the server asks for it.
 */
export function ActionForm({
  path,
  method = 'POST',
  fields,
  submitLabel,
  extra,
  confirmText,
  danger,
  onDoneHref,
  compact,
}: {
  path: string;
  method?: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  fields: FieldDef[];
  submitLabel: string;
  extra?: Record<string, unknown>;
  confirmText?: string;
  danger?: boolean;
  onDoneHref?: string;
  compact?: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const toast = useToast();
  const s = useSubmit<Record<string, unknown>, unknown>(path, method);
  const [values, setValues] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(fields.map((f) => [f.name, f.type === 'checkbox' ? !!f.defaultValue : f.defaultValue == null ? '' : String(f.defaultValue)])),
  );
  const [needStepUp, setNeedStepUp] = useState(false);
  const [pw, setPw] = useState('');
  const [localErr, setLocalErr] = useState<string | null>(null);

  const build = (): Record<string, unknown> | null => {
    const out: Record<string, unknown> = { ...(extra ?? {}) };
    for (const f of fields) {
      const v = values[f.name];
      if (f.type === 'checkbox') out[f.name] = !!v;
      else if (f.type === 'number') out[f.name] = v === '' ? (f.nullable ? null : undefined) : Number(v);
      else if (f.type === 'money') {
        if (v === '') out[f.name] = f.nullable ? null : undefined;
        else {
          const m = parseMoneyToMinor(String(v));
          if (m === null) {
            setLocalErr(`${f.label}: ${t('errors.validation')}`);
            return null;
          }
          out[f.name] = m;
        }
      } else if (f.type === 'datetime') out[f.name] = v ? new Date(String(v)).toISOString() : undefined;
      else if (f.type === 'list') out[f.name] = String(v).split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);
      else if (f.type === 'json') {
        try {
          out[f.name] = JSON.parse(String(v || 'null'));
        } catch {
          setLocalErr(`${f.label}: ${t('errors.bad_json')}`);
          return null;
        }
      } else out[f.name] = v === '' ? undefined : v;
    }
    return out;
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalErr(null);
    if (confirmText && !window.confirm(confirmText)) return;
    const body = build();
    if (!body) return;
    const r = await s.submit(body);
    if (r !== null) {
      toast(t('platform.done'), 'ok');
      if (onDoneHref) router.push(onDoneHref);
      router.refresh();
    }
  }

  const stepUp = s.error?.message === 'errors.step_up_required';
  return (
    <form onSubmit={onSubmit} noValidate aria-busy={s.busy} className={compact ? 'row' : undefined} style={compact ? { alignItems: 'flex-end' } : undefined}>
      {localErr && <div className="alert error" role="alert">{localErr}</div>}
      <ErrorAlert error={s.error} />
      {(stepUp || needStepUp) && (
        <div className="alert warn">
          <div className="stack" style={{ width: '100%' }}>
            <span>{t('errors.step_up_required')}</span>
            <div className="row">
              <input type="password" className="input input-ltr" style={{ maxWidth: 260 }} aria-label={t('platform.step_up_password')} value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" />
              <button
                type="button"
                className="btn btn-sm btn-gold"
                onClick={async () => {
                  try {
                    await apiFetch('/api/v1/auth/step-up', { method: 'POST', body: { password: pw } });
                    setPw('');
                    setNeedStepUp(false);
                    const body = build();
                    if (body && (await s.submit(body)) !== null) {
                      toast(t('platform.done'), 'ok');
                      router.refresh();
                    }
                  } catch {
                    setNeedStepUp(true);
                    setLocalErr(t('errors.bad_credentials'));
                  }
                }}
              >
                {t('platform.step_up_submit')}
              </button>
            </div>
          </div>
        </div>
      )}
      {fields.map((f) => (
        <div key={f.name} style={compact ? { flex: f.type === 'textarea' ? '2 1 260px' : '1 1 160px' } : undefined}>
          {f.type === 'checkbox' ? (
            <label className="check" style={{ marginBottom: 12 }}>
              <input type="checkbox" checked={!!values[f.name]} onChange={(e) => setValues({ ...values, [f.name]: e.target.checked })} />
              {f.label}
            </label>
          ) : (
            <Field label={f.label} hint={f.hint} required={f.required} error={s.fieldErrors[f.name]}>
              {(p) =>
                f.type === 'textarea' || f.type === 'json' ? (
                  <textarea {...p} className={`input${f.type === 'json' || f.ltr ? ' input-ltr mono' : ''}`} rows={f.type === 'json' ? 12 : 3} value={String(values[f.name])} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })} />
                ) : f.type === 'select' ? (
                  <select {...p} className="input" value={String(values[f.name])} onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}>
                    {f.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    {...p}
                    className={`input${f.ltr || f.type === 'number' || f.type === 'money' ? ' input-ltr' : ''}`}
                    type={f.type === 'datetime' ? 'datetime-local' : f.type === 'number' ? 'number' : f.type === 'password' ? 'password' : 'text'}
                    inputMode={f.type === 'money' ? 'decimal' : undefined}
                    value={String(values[f.name])}
                    onChange={(e) => setValues({ ...values, [f.name]: e.target.value })}
                  />
                )
              }
            </Field>
          )}
        </div>
      ))}
      <div className="form-actions" style={compact ? { marginBottom: 12 } : undefined}>
        <button type="submit" className={`btn ${danger ? 'btn-danger' : 'btn-gold'}${compact ? ' btn-sm' : ''}`} disabled={s.busy}>
          {s.busy ? t('common.saving') : submitLabel}
        </button>
      </div>
    </form>
  );
}
