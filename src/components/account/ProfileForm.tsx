'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useT } from '../I18n';
import { ErrorAlert, Field, useSubmit } from '../ui/forms';
import { useToast } from '../ui/Toast';

export function ProfileForm({ initial, contact }: { initial: { fullName: string; preferredLocale: 'ar' | 'en' }; contact: string }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [v, setV] = useState(initial);
  const s = useSubmit<typeof v, { ok: boolean }>('/api/v1/me/profile', 'PATCH');
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (await s.submit(v)) {
          toast(t('common.saved'), 'ok');
          router.refresh();
        }
      }}
    >
      <ErrorAlert error={s.error} />
      <p className="small muted mono">{contact}</p>
      <Field label={t('account.full_name')} required error={s.fieldErrors.fullName}>
        {(p) => <input {...p} className="input" value={v.fullName} onChange={(e) => setV({ ...v, fullName: e.target.value })} />}
      </Field>
      <Field label={t('account.preferred_language')} required>
        {(p) => (
          <select {...p} className="input" value={v.preferredLocale} onChange={(e) => setV({ ...v, preferredLocale: e.target.value as 'ar' | 'en' })}>
            <option value="ar">العربية</option>
            <option value="en">English</option>
          </select>
        )}
      </Field>
      <div className="form-actions">
        <button className="btn btn-gold" disabled={s.busy} type="submit">{s.busy ? t('common.saving') : t('common.save')}</button>
      </div>
    </form>
  );
}
