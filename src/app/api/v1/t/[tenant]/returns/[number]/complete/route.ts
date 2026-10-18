import { z } from 'zod';
import { api } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { completeReturn } from '@/server/commerce/returns';
import { requireRecentStepUp } from '@/server/auth/service';

const NUM = /^RET-\d{6,}$/;

/** Completes a return; a refund above zero needs refunds.issue AND a recent re-authentication. */
export const POST = api.tenant<{ number: string }>('orders.manage', async (c) => {
  if (!NUM.test(c.params.number)) throw notFound('return');
  const b = await c.json(z.object({ refundAmountMinor: z.number().int().min(0).max(100_000_000) }));
  if (b.refundAmountMinor > 0) requireRecentStepUp(c.user);
  return tx(c.t, (db) => completeReturn(db, c.t, c.params.number, { refundAmountMinor: b.refundAmountMinor, idempotencyKey: c.req.headers.get('idempotency-key')! }));
}, { idempotent: true });
