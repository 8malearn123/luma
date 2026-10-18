'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useT } from '@/components/I18n';
import { ErrorAlert, Field, useSubmit, useUnsavedGuard } from '@/components/ui/forms';
import { apiFetch } from '@/lib/client/api';

const TYPES = ['salon', 'expert', 'spa', 'clinic', 'studio'] as const;

/** Latin slug suggestion from a (possibly Arabic) name; the owner can always edit it. */
function suggestSlug(name: string) {
  const s = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return s.length >= 3 ? s : '';
}

export function CreateBusinessForm() {
  const t = useT();
  const router = useRouter();
  const [f, setF] = useState({ name: '', businessType: 'salon' as (typeof TYPES)[number], city: '', branchName: '', slug: '' });
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugState, setSlugState] = useState<null | { valid: boolean; available: boolean }>(null);
  const create = useSubmit<typeof f, { slug: string; next: string }>('/api/v1/tenants');
  const dirty = !!(f.name || f.city);
  useUnsavedGuard(dirty && !create.busy);

  useEffect(() => {
    if (!slugTouched) setF((x) => ({ ...x, slug: suggestSlug(x.name) }));
  }, [f.name, slugTouched]);

  useEffect(() => {
    if (!f.slug) return setSlugState(null);
    const ctl = new AbortController();
    const h = setTimeout(async () => {
      try {
        const r = await apiFetch<{ valid: boolean; available: boolean }>(`/api/v1/tenants/slug-available?slug=${encodeURIComponent(f.slug)}`, { signal: ctl.signal });
        setSlugState(r);
      } catch {
        /* network errors are shown on submit */
      }
    }, 350);
    return () => {
      clearTimeout(h);
      ctl.abort();
    };
  }, [f.slug]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  return (
    <form
      noValidate
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await create.submit({ ...f, branchName: f.branchName || f.name });
        if (r) router.push(r.next);
      }}
    >
      <ErrorAlert error={create.error} />
      <Field label={t('onb.business_name')} required error={create.fieldErrors.name}>
        {(p) => <input {...p} className="input" value={f.name} onChange={set('name')} maxLength={120} />}
      </Field>
      <Field label={t('onb.business_type')} required>
        {(p) => (
          <select {...p} className="input" value={f.businessType} onChange={set('businessType')}>
            {TYPES.map((x) => (
              <option key={x} value={x}>
                {t(`onb.type.${x}`)}
              </option>
            ))}
          </select>
        )}
      </Field>
      <div className="grid cols-2" style={{ gap: 12 }}>
        <Field label={t('onb.city')} required error={create.fieldErrors.city}>
          {(p) => <input {...p} className="input" value={f.city} onChange={set('city')} maxLength={80} />}
        </Field>
        <Field label={t('onb.branch_name')} hint={t('ops.branch_name_hint')}>
          {(p) => <input {...p} className="input" value={f.branchName} onChange={set('branchName')} maxLength={120} />}
        </Field>
      </div>
      <Field
        label={t('onb.slug')}
        required
        hint={`/s/${f.slug || '…'}`}
        error={create.fieldErrors.slug ?? (slugState && !slugState.valid ? t('errors.slug_invalid') : slugState && !slugState.available ? t('errors.slug_taken') : null)}
      >
        {(p) => (
          <input
            {...p}
            className="input input-ltr mono"
            value={f.slug}
            onChange={(e) => {
              setSlugTouched(true);
              setF({ ...f, slug: e.target.value.toLowerCase() });
            }}
            maxLength={48}
            autoCapitalize="none"
          />
        )}
      </Field>
      {slugState?.available && <p className="small" style={{ color: 'var(--green)' }}>{t('ops.slug_available')}</p>}
      <div className="form-actions">
        <button type="submit" className="btn btn-gold" disabled={create.busy || !f.name || !f.city || !f.slug}>
          {create.busy ? t('common.saving') : t('common.next')}
        </button>
      </div>
    </form>
  );
}
