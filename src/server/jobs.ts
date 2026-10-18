import { hostname } from 'node:os';
import { sql, withSystem, withTenant, type Db, type Tx } from './db';

/**
 * PostgreSQL-backed job queue (FOR UPDATE SKIP LOCKED) + transactional outbox.
 *
 * - enqueueJob is idempotent by idempotency_key (e.g. "marketing.weekly:<tenant>:2026-W42").
 * - Every job carries its tenant_id; the handler runs inside withTenant(job.tenant_id),
 *   so RLS confines it to that tenant even if the handler has a bug.
 * - Retries use exponential backoff and are only configured for idempotent handlers.
 * - Outbox events are written in the SAME transaction as the business change,
 *   so a committed booking never loses its notification.
 */
export interface JobRow {
  id: string;
  tenantId: string | null;
  kind: string;
  payload: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  createdBy: string | null;
}

export type JobHandler = (job: JobRow, tx: Tx) => Promise<Record<string, unknown> | void>;

const handlers = new Map<string, JobHandler>();
export function registerJob(kind: string, h: JobHandler) {
  handlers.set(kind, h);
}

export async function enqueueJob(
  db: Db,
  j: { kind: string; tenantId: string | null; key: string; payload?: Record<string, unknown>; runAt?: Date; maxAttempts?: number; createdBy?: string | null },
): Promise<{ id: string; created: boolean; status: string }> {
  const rows = await db<{ id: string; status: string }[]>`
    insert into job_runs (tenant_id, kind, idempotency_key, payload, run_at, max_attempts, created_by)
    values (${j.tenantId}, ${j.kind}, ${j.key}, ${db.json((j.payload ?? {}) as never)}, ${j.runAt ?? new Date()},
            ${j.maxAttempts ?? 3}, ${j.createdBy ?? null})
    on conflict (idempotency_key) do nothing
    returning id, status`;
  if (rows[0]) return { ...rows[0], created: true };
  const [existing] = await db<{ id: string; status: string }[]>`select id, status from job_runs where idempotency_key = ${j.key}`;
  return { ...existing, created: false };
}

export async function emitOutbox(db: Db, e: { tenantId: string | null; topic: string; payload: Record<string, unknown>; dedupeKey?: string }) {
  await db`insert into outbox_events (tenant_id, topic, payload, dedupe_key)
           values (${e.tenantId}, ${e.topic}, ${db.json(e.payload as never)}, ${e.dedupeKey ?? null})
           on conflict (dedupe_key) do nothing`;
}

const WORKER_ID = `${hostname()}:${process.pid}`;

/** Claims and runs up to `max` due jobs. Returns number processed. */
export async function runDueJobs(max = 10): Promise<number> {
  let n = 0;
  for (; n < max; n++) {
    const job = await withSystem('job claim', async (tx) => {
      const [j] = await tx<JobRow[]>`
        update job_runs set status = 'running', locked_at = now(), locked_by = ${WORKER_ID}, attempts = attempts + 1
        where id = (select id from job_runs where status = 'queued' and run_at <= now()
                    order by run_at limit 1 for update skip locked)
        returning id, tenant_id, kind, payload, attempts, max_attempts, created_by`;
      return j;
    });
    if (!job) break;
    const h = handlers.get(job.kind);
    try {
      if (!h) throw new Error(`no handler for ${job.kind}`);
      const result = job.tenantId
        ? await withTenant({ tenantId: job.tenantId, userId: job.createdBy }, (tx) => h(job, tx))
        : await withSystem(`job ${job.kind}`, (tx) => h(job, tx));
      await sql()`update job_runs set status = 'succeeded', finished_at = now(), result = ${sql().json((result ?? {}) as never)},
                  error = null, updated_at = now() where id = ${job.id}`;
    } catch (e) {
      const msg = String((e as Error)?.message ?? e).slice(0, 500);
      const retry = job.attempts < job.maxAttempts;
      await sql()`update job_runs set status = ${retry ? 'queued' : 'failed'}, error = ${msg}, updated_at = now(),
                  run_at = now() + make_interval(secs => ${Math.min(3600, 30 * 2 ** job.attempts)}),
                  finished_at = ${retry ? null : new Date()} where id = ${job.id}`;
    }
  }
  return n;
}

/** Re-queue jobs whose worker died mid-run (lock older than 15 minutes). */
export async function recoverStaleJobs() {
  await withSystem('stale job recovery', (tx) => tx`
    update job_runs set status = 'queued', locked_at = null, locked_by = null
    where status = 'running' and locked_at < now() - interval '15 minutes'`);
}

export type OutboxHandler = (e: { id: number; tenantId: string | null; topic: string; payload: Record<string, unknown> }) => Promise<void>;
const outboxHandlers = new Map<string, OutboxHandler>();
export function registerOutbox(topic: string, h: OutboxHandler) {
  outboxHandlers.set(topic, h);
}

export async function drainOutbox(max = 50): Promise<number> {
  let n = 0;
  for (; n < max; n++) {
    const done = await withSystem('outbox drain', async (tx) => {
      const [e] = await tx<{ id: number; tenantId: string | null; topic: string; payload: Record<string, unknown>; attempts: number }[]>`
        select id, tenant_id, topic, payload, attempts from outbox_events
        where processed_at is null and available_at <= now() order by id limit 1 for update skip locked`;
      if (!e) return false;
      const h = outboxHandlers.get(e.topic);
      try {
        if (h) await h(e);
        await tx`update outbox_events set processed_at = now(), attempts = attempts + 1, last_error = null where id = ${e.id}`;
      } catch (err) {
        await tx`update outbox_events set attempts = attempts + 1, last_error = ${String((err as Error).message).slice(0, 500)},
                 available_at = now() + make_interval(secs => ${Math.min(3600, 15 * 2 ** e.attempts)}) where id = ${e.id}`;
      }
      return true;
    });
    if (!done) break;
  }
  return n;
}
