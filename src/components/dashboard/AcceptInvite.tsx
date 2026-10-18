'use client';

import { useRouter } from 'next/navigation';
import { useT } from '../I18n';
import { ErrorAlert, useSubmit } from '../ui/forms';

export function AcceptInvite({ token, label }: { token: string; label: string }) {
  const t = useT();
  const router = useRouter();
  const s = useSubmit<{ token: string }, { slug: string; role: string }>('/api/v1/invitations/accept');
  return (
    <div className="stack">
      <p>{label}</p>
      <ErrorAlert error={s.error} />
      <button type="button" className="btn btn-gold" disabled={s.busy} onClick={async () => {
        const r = await s.submit({ token });
        if (r) router.push(r.role === 'specialist' ? `/staff?t=${r.slug}` : `/app/${r.slug}`);
      }}>{t('common.confirm')}</button>
    </div>
  );
}
