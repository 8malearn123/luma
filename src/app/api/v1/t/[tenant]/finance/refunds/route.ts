import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { listRefunds } from '@/server/finance/reports';
import { issueRefund } from '@/server/payments/service';
import { requireRecentStepUp } from '@/server/auth/service';

export const GET = api.tenant(['finance.view', 'refunds.issue'], async (c) => {
  const q = c.query(z.object({ status: z.enum(['pending', 'processing', 'succeeded', 'failed', 'cancelled']).optional() }));
  return { items: await tx(c.t, (db) => listRefunds(db, q.status)) };
});

/** Sensitive: requires refunds.issue AND a recent password re-entry (step-up). */
export const POST = api.tenant('refunds.issue', async (c) => {
  requireRecentStepUp(c.user);
  const b = await c.json(z.object({ paymentId: z.string().uuid(), amountMinor: z.number().int().min(1), reason: z.string().trim().min(3).max(300) }));
  return tx(c.t, (db) => issueRefund(db, c.t, { ...b, idempotencyKey: c.req.headers.get('idempotency-key')! }));
}, { idempotent: true });
