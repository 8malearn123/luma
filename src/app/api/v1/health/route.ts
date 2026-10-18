import { NextResponse } from 'next/server';
import { sql } from '@/server/db';

/** Liveness + DB reachability + queue depth. No secrets, no tenant data. */
export async function GET() {
  try {
    const [r] = await sql()<{ queued: number; failed: number; outbox: number }[]>`
      select (select count(*)::int from job_runs where status = 'queued') as queued,
             (select count(*)::int from job_runs where status = 'failed') as failed,
             (select count(*)::int from outbox_events where processed_at is null) as outbox`;
    return NextResponse.json({ ok: true, db: 'up', jobs: { queued: r.queued, failed: r.failed }, outboxBacklog: r.outbox }, { headers: { 'cache-control': 'no-store' } });
  } catch {
    return NextResponse.json({ ok: false, db: 'down' }, { status: 503 });
  }
}
