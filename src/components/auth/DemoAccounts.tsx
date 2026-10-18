'use client';

import { useRouter } from 'next/navigation';
import { useT } from '../I18n';
import { ErrorAlert, useSubmit } from '../ui/forms';

export interface DemoAccount {
  userId: string;
  displayName: string;
  label: string;
}

/**
 * Private-demo quick sign-in. Rendered and accepted by the server ONLY when
 * LUMA_DEMO_MODE=1 outside production, and only for users flagged is_demo.
 */
export function DemoAccounts({ accounts, next }: { accounts: DemoAccount[]; next?: string }) {
  const t = useT();
  const router = useRouter();
  const s = useSubmit<{ userId: string }, { ok: boolean; home: string }>('/api/v1/dev/demo-login');
  return (
    <section className="card" aria-labelledby="demo-h">
      <h2 id="demo-h" style={{ fontSize: '1rem' }}>
        {t('auth.demo_accounts')} <span className="badge amber">{t('common.dev_only')}</span>
      </h2>
      <p className="small muted">{t('auth.demo_accounts_hint')}</p>
      <ErrorAlert error={s.error} />
      <div className="grid cols-2" style={{ gap: 8 }}>
        {accounts.map((a) => (
          <button
            key={a.userId}
            type="button"
            className="btn btn-sm"
            style={{ justifyContent: 'flex-start', flexDirection: 'column', alignItems: 'flex-start', padding: '8px 12px', height: 'auto' }}
            disabled={s.busy}
            onClick={async () => {
              const r = await s.submit({ userId: a.userId });
              if (r) {
                router.push(next && next.startsWith('/') && !next.startsWith('//') ? next : r.home);
                router.refresh();
              }
            }}
          >
            <span>{a.displayName}</span>
            <span className="small muted" style={{ fontWeight: 400 }}>{a.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
