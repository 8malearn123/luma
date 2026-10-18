'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useT } from '../I18n';
import { ErrorAlert, Field, useSubmit } from '../ui/forms';

type Mode = 'login' | 'register' | 'verify' | 'recover' | 'reset';

interface VerifyRes {
  verificationRequired?: boolean;
  destination?: string | null;
  devOutbox?: boolean;
  ok?: boolean;
}

/** Only same-site relative paths are accepted as post-login destinations (no open redirect). */
function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/account';
  return next;
}

export function AuthForm({ initialMode, next, devOtp }: { initialMode: Mode; next?: string; devOtp: boolean }) {
  const t = useT();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<{ dest: string | null; dev: boolean } | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const login = useSubmit<unknown, VerifyRes>('/api/v1/auth/login');
  const reg = useSubmit<unknown, VerifyRes>('/api/v1/auth/register');
  const verify = useSubmit<unknown, VerifyRes>('/api/v1/auth/verify');
  const resend = useSubmit<unknown, VerifyRes>('/api/v1/auth/resend');
  const recover = useSubmit<unknown, { destination: string }>('/api/v1/auth/recover');
  const reset = useSubmit<unknown, VerifyRes>('/api/v1/auth/reset');

  const done = () => {
    router.push(safeNext(next));
    router.refresh();
  };

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setInfo(null);
    if (mode === 'login') {
      const r = await login.submit({ identifier, password });
      if (r?.verificationRequired) {
        setSentTo({ dest: r.destination ?? null, dev: !!r.devOutbox });
        setMode('verify');
      } else if (r?.ok) done();
    } else if (mode === 'register') {
      const r = await reg.submit({ identifier, password, displayName });
      if (r) {
        setSentTo({ dest: r.destination ?? null, dev: !!r.devOutbox });
        setMode('verify');
      }
    } else if (mode === 'verify') {
      const r = await verify.submit({ identifier, code });
      if (r?.ok) done();
    } else if (mode === 'recover') {
      const r = await recover.submit({ identifier });
      if (r) {
        setSentTo({ dest: r.destination, dev: devOtp });
        setMode('reset');
      }
    } else if (mode === 'reset') {
      const r = await reset.submit({ identifier, code, password });
      if (r?.ok) {
        setInfo(t('auth.reset_done'));
        setPassword('');
        setCode('');
        setMode('login');
      }
    }
  }

  const active = { login, register: reg, verify, recover, reset }[mode];
  const title = {
    login: t('auth.title_signin'),
    register: t('auth.title_register'),
    verify: t('auth.verify_title'),
    recover: t('auth.recover_title'),
    reset: t('auth.recover_title'),
  }[mode];
  const submitLabel = {
    login: t('auth.submit_signin'),
    register: t('auth.submit_register'),
    verify: t('auth.verify_submit'),
    recover: t('auth.recover_submit'),
    reset: t('auth.reset_submit'),
  }[mode];

  return (
    <form onSubmit={onSubmit} noValidate aria-busy={active.busy}>
      <h1 style={{ textAlign: 'center' }}>{title}</h1>
      {info && <div className="alert ok" role="status">{info}</div>}
      <ErrorAlert error={active.error} />

      {(mode === 'verify' || mode === 'reset') && sentTo && (
        <div className="alert info" role="status">
          {mode === 'verify' ? t('auth.verify_sent', { dest: sentTo.dest ?? '—' }) : t('auth.recover_sent', { dest: sentTo.dest ?? '—' })}
          {sentTo.dev && (
            <div style={{ marginTop: 6 }}>
              <strong>{t('common.dev_only')}: </strong>
              {t('auth.verify_dev')}{' '}
              <a href="/dev/outbox" target="_blank" rel="noreferrer">
                /dev/outbox
              </a>
            </div>
          )}
        </div>
      )}

      {mode !== 'verify' && mode !== 'reset' && (
        <Field label={t('auth.identifier')} hint={t('auth.identifier_hint')} error={active.fieldErrors.identifier} required>
          {(p) => (
            <input
              {...p}
              className="input input-ltr"
              autoComplete="username"
              inputMode="email"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />
          )}
        </Field>
      )}

      {mode === 'register' && (
        <Field label={t('auth.display_name')} error={active.fieldErrors.displayName} required>
          {(p) => <input {...p} className="input" autoComplete="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />}
        </Field>
      )}

      {(mode === 'verify' || mode === 'reset') && (
        <Field label={t('auth.code')} required>
          {(p) => (
            <input
              {...p}
              className="input input-ltr mono"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            />
          )}
        </Field>
      )}

      {(mode === 'login' || mode === 'register' || mode === 'reset') && (
        <Field
          label={mode === 'reset' ? t('auth.new_password') : t('auth.password')}
          hint={mode !== 'login' ? t('auth.password_hint') : undefined}
          error={active.fieldErrors.password}
          required
        >
          {(p) => (
            <input
              {...p}
              type="password"
              className="input input-ltr"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}
        </Field>
      )}

      <button className="btn btn-gold" style={{ width: '100%' }} disabled={active.busy} type="submit">
        {active.busy ? t('common.loading') : submitLabel}
      </button>

      <div className="stack" style={{ marginTop: 16, alignItems: 'center', fontSize: 13.5 }}>
        {mode === 'login' && (
          <>
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setMode('recover')}>
              {t('auth.forgot')}
            </button>
            <span className="muted">
              {t('auth.no_account')}{' '}
              <Link href={`/auth/register${next ? `?next=${encodeURIComponent(next)}` : ''}`}>{t('nav.register')}</Link>
            </span>
          </>
        )}
        {mode === 'register' && (
          <span className="muted">
            {t('auth.have_account')} <Link href={`/auth/login${next ? `?next=${encodeURIComponent(next)}` : ''}`}>{t('nav.signin')}</Link>
          </span>
        )}
        {mode === 'verify' && (
          <button
            type="button"
            className="btn btn-quiet btn-sm"
            disabled={resend.busy}
            onClick={async () => {
              const r = await resend.submit({ identifier });
              if (r?.destination) setSentTo({ dest: r.destination, dev: !!r.devOutbox });
            }}
          >
            {t('auth.resend')}
          </button>
        )}
        {(mode === 'recover' || mode === 'reset') && (
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setMode('login')}>
            {t('common.back')}
          </button>
        )}
      </div>
    </form>
  );
}
