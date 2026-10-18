import { pageT, requireUser } from '@/server/http/page';
import { listSessions } from '@/server/auth/service';
import { SessionsList } from '@/components/account/SessionsList';

export default async function SecurityPage() {
  const user = await requireUser();
  const { t } = await pageT(user);
  const sessions = await listSessions(user.userId);
  return (
    <>
      <div className="page-head"><h1>{t('account.security')}</h1></div>
      <section className="card">
        <h2>{t('auth.sessions')}</h2>
        <SessionsList
          items={sessions.map((s) => ({ id: s.id as string, userAgent: (s.userAgent as string) ?? '', ip: (s.ip as string) ?? '', lastSeenAt: new Date(s.lastSeenAt as Date).toISOString(), current: s.id === user.sessionId }))}
        />
      </section>
    </>
  );
}
