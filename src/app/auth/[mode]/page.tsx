import { notFound, redirect } from 'next/navigation';
import { AuthForm } from '@/components/auth/AuthForm';
import { DemoAccounts } from '@/components/auth/DemoAccounts';
import { Brand } from '@/components/shell/Brand';
import { devOtpEnabled } from '@/server/auth/service';
import { env } from '@/server/env';
import { sessionUser } from '@/server/http/page';
import { listDemoAccounts } from '@/server/demo';

const MODES = { login: 'login', register: 'register', recover: 'recover' } as const;

export default async function AuthPage({ params, searchParams }: { params: Promise<{ mode: string }>; searchParams: Promise<{ next?: string }> }) {
  const { mode } = await params;
  const { next } = await searchParams;
  const m = MODES[mode as keyof typeof MODES];
  if (!m) notFound();
  if (m !== 'recover' && (await sessionUser())) redirect(next && next.startsWith('/') && !next.startsWith('//') ? next : '/account');
  const demo = env().LUMA_DEMO_MODE && env().NODE_ENV !== 'production';
  const demoAccounts = demo && m === 'login' ? await listDemoAccounts() : [];
  return (
    <main id="main" className="auth-wrap">
      <div className="auth-card stack">
        <Brand />
        <div className="card">
          <AuthForm initialMode={m} next={next} devOtp={devOtpEnabled()} />
        </div>
        {demoAccounts.length > 0 && <DemoAccounts accounts={demoAccounts} next={next} />}
      </div>
    </main>
  );
}
