/**
 * Background worker: runs due jobs, drains the transactional outbox, and runs
 * periodic maintenance (hold expiry, unpaid order expiry, payment
 * reconciliation, stale job recovery). Safe to run several instances
 * (FOR UPDATE SKIP LOCKED + idempotent handlers).
 *   npm run worker            # loop
 *   npm run worker -- --once  # one pass (cron / tests)
 */
import '../src/server/jobs-registry';
import { closeDb, withSystem } from '../src/server/db';
import { drainOutbox, enqueueScheduled, recoverStaleJobs, runDueJobs } from '../src/server/jobs';
import { sweepExpiredHolds } from '../src/server/booking/service';
import { expireUnpaidOrders } from '../src/server/commerce/orders';
import { reconcilePayments } from '../src/server/payments/service';
import { scheduleDueAnalyses } from '../src/server/marketing/analysis';

const log = (msg: string, extra: Record<string, unknown> = {}) => console.log(JSON.stringify({ at: new Date().toISOString(), msg, ...extra }));

let lastMaintenance = 0;
async function pass() {
  const jobs = await runDueJobs(20);
  const events = await drainOutbox(100);
  if (Date.now() - lastMaintenance > 60_000) {
    lastMaintenance = Date.now();
    await recoverStaleJobs();
    await enqueueScheduled();
    await scheduleDueAnalyses(); // per-tenant weekly/monthly marketing analyses in each business timezone (idempotent per period)
    const holds = await withSystem('maintenance: hold expiry across tenants', (tx) => sweepExpiredHolds(tx));
    const orders = await withSystem('maintenance: unpaid order expiry', (tx) => expireUnpaidOrders(tx));
    const recon = await withSystem('maintenance: payment reconciliation', async (tx) => {
      const r = await reconcilePayments(tx);
      if (r.checked) {
        await tx`insert into reconciliation_runs (kind, finished_at, checked, actions, status) values ('payments', now(), ${r.checked}, ${tx.json(r.outcomes as never)}, 'succeeded')`;
      }
      return r;
    });
    log('maintenance', { expiredHolds: holds.expired, expiredOrders: orders.expired, reconciled: recon.checked });
  }
  return jobs + events;
}

async function main() {
  const once = process.argv.includes('--once');
  let stop = false;
  process.on('SIGTERM', () => (stop = true));
  process.on('SIGINT', () => (stop = true));
  do {
    try {
      const n = await pass();
      if (n) log('processed', { n });
      if (!once && !n) await new Promise((r) => setTimeout(r, 2000));
    } catch (e) {
      log('worker error', { error: String((e as Error).message) });
      await new Promise((r) => setTimeout(r, 5000));
    }
  } while (!once && !stop);
  await closeDb();
}

main();
