import { notFound } from 'next/navigation';
import { sql } from '@/server/db';
import { devOtpEnabled } from '@/server/auth/service';
import { formatDateTime } from '@/lib/format';
import { maskDestination } from '@/server/crypto';

export const dynamic = 'force-dynamic';

/** DEVELOPMENT ONLY — messages that a real provider would have delivered. 404 in production. */
export default async function DevOutbox() {
  if (!devOtpEnabled()) notFound();
  const rows = await sql()<{ id: string; channel: string; destination: string; body: string; createdAt: Date }[]>`
    select id, channel, destination, body, created_at from dev_outbox_messages order by created_at desc limit 30`;
  return (
    <main id="main" className="content" style={{ margin: '0 auto' }}>
      <div className="alert warn" role="note">
        Development outbox — nothing here was sent to anyone. Disabled when NODE_ENV=production. / صندوق رسائل التطوير — لم يُرسل أي شيء فعلياً.
      </div>
      <h1>Dev outbox</h1>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>When</th><th>Channel</th><th>To</th><th>Message</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="mono small">{formatDateTime(r.createdAt, { locale: 'en' })}</td>
                <td>{r.channel}</td>
                <td className="mono small">{maskDestination(r.destination)}</td>
                <td>{r.body}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
