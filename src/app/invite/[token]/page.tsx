import Link from 'next/link';
import { Brand } from '@/components/shell/Brand';
import { AcceptInvite } from '@/components/dashboard/AcceptInvite';
import { pageT, sessionUser } from '@/server/http/page';
import { invitationPreview } from '@/server/dashboard/members';

export const dynamic = 'force-dynamic';

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const user = await sessionUser();
  const { t } = await pageT(user);
  const inv = await invitationPreview(token);
  return (
    <main id="main" className="auth-wrap">
      <div className="auth-card stack">
        <Brand />
        <div className="card">
          <h1>{t('iv.title')}</h1>
          {!inv || !inv.valid ? (
            <div className="alert error" role="alert">{t('iv.invalid')}</div>
          ) : !user ? (
            <>
              <p>{t('iv.join', { name: inv.tenantName, role: t(`role.${inv.role}`) })}</p>
              <p className="small muted">{t('iv.signin_first')}</p>
              <Link className="btn btn-gold" href={`/auth/login?next=${encodeURIComponent(`/invite/${token}`)}`}>{t('nav.signin')}</Link>
            </>
          ) : (
            <AcceptInvite token={token} label={t('iv.join', { name: inv.tenantName, role: t(`role.${inv.role}`) })} />
          )}
        </div>
      </div>
    </main>
  );
}
