# Runbook

## Processes
- **web**: `npm run build && npm start` (Next.js). Stateless; scale horizontally.
- **worker**: `npm run worker` (jobs, outbox, hold/order expiry, payment reconciliation).
  Safe to run more than one instance (SKIP LOCKED, idempotent handlers).
- **migrations**: `npm run db:migrate` with `MIGRATION_DATABASE_URL` (schema owner). Forward-only,
  checksummed; a modified applied migration aborts the run. Never reset a shared database.

## Health checks
- `GET /api/v1/health` → DB reachability and queue depth (no secrets).
- Jobs: `select status, count(*) from job_runs group by 1;` — `failed` rows carry `error`.
- Outbox backlog: `select count(*) from outbox_events where processed_at is null;`
- Provider events: `select outcome, count(*) from provider_events group by 1;`

## Common failures
| Symptom | Likely cause | Action |
|---|---|---|
| Customers see "time no longer available" often | Concurrent demand, or stale availability | Expected behavior (single-winner). Check `booking_allocations` for stuck holds: `select count(*) from booking_allocations where active and expires_at < now()` — the worker sweeps them every minute. |
| Paid booking still `pending_payment` | Webhook not delivered or app failed after provider success | Worker reconciliation re-applies succeeded payments each minute (`reconciliation_runs`). Check `provider_events` for `rejected` (bad signature/secret) or `unknown_payment`. |
| Payment `needs_review` | Amount/currency/account mismatch or conflicting events | Never auto-resolved. Finance compares provider dashboard vs `payments`/`payment_attempts`, then refunds or records manually with an audit reason. |
| `refund_pending` stuck | Provider refund job failing | `job_runs where kind='refund.execute' and status='failed'`; fix credentials, then set the job back to `queued`. Refunds are idempotent by refund id — never refund twice from the provider dashboard. |
| Verification codes not arriving | No messaging provider connected (`EMAIL_PROVIDER/SMS_PROVIDER=none`) | In production this returns an explicit "provider unavailable" error; nothing is pretended. Connect a provider adapter. |
| AI features show "not configured" | `AI_PROVIDER/OPENAI_API_KEY/OPENAI_MODEL` unset or quota exhausted | Manual tools keep working; configure keys; check `ai_runs.error_code`. |
| Storefront change not visible | Saved only to draft | Publish from the builder; versions list shows the live version. |

## Realtime notifications
- Each app instance holds one `LISTEN luma_notifications` connection (in addition to the pool). Streams end after 5 minutes and reconnect; heartbeat every 25 s.
- Behind a proxy, disable response buffering for `/api/v1/me/notifications/stream` (the route sends `X-Accel-Buffering: no`).
- If streaming is unavailable, browsers fall back to polling every 60 s automatically — no action needed.

## Rollback
- **Storefront**: Builder → Versions → restore an earlier version into the draft → publish.
  Design only; bookings/inventory are never rolled back.
- **Application**: redeploy the previous build. Migrations are additive; if a migration must be
  undone, write a new compensating migration (never edit applied ones).
- **Data corrections**: financial, stock, points and booking history are append-only; correct
  with offsetting entries (journal correction, stock adjustment with reason, booking events).

## Backups & restore drill (required before any commercial-readiness claim)
1. Enable automated daily backups + PITR on the managed Postgres (or `pg_dump -Fc` nightly to
   encrypted object storage with 30-day retention).
2. Back up the object storage bucket (`STORAGE_LOCAL_DIR` in dev) with versioning.
3. **Drill** (quarterly, and before launch): restore the latest backup into a fresh database,
   run `npm run db:migrate` (should be a no-op), run `npm test` against it, open a storefront and
   a booking detail, compare row counts of `bookings`, `payments`, `financial_entries` with
   production. Record the date and duration. *Not yet performed — no production environment exists.*

## Secrets
Server-side environment only (`.env.example` lists them). Provider credentials per business are
stored encrypted (AES-256-GCM, `LUMA_ENCRYPTION_KEY`); rotating that key requires re-encrypting
`payment_accounts` secrets (write a one-off script; not yet needed).

## Incident handling for data exposure
Revoke sessions (`update sessions set revoked_at = now() …`), revoke support grants, rotate
`SESSION_SECRET` (invalidates signed media URLs and verification codes), review `audit_logs`.
