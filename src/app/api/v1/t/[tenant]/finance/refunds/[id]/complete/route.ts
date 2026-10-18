import { z } from 'zod';
import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { completeManualRefund } from '@/server/payments/service';
import { requireRecentStepUp } from '@/server/auth/service';

/** Mark a cash/terminal refund as paid back (manual payments only). */
export const POST = api.tenant<{ id: string }>('refunds.issue', async (c) => {
  requireRecentStepUp(c.user);
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  const b = await c.json(z.object({ reference: z.string().trim().min(1).max(80) }));
  await tx(c.t, (db) => completeManualRefund(db, c.t, c.params.id, b.reference));
  return { ok: true };
}, { idempotent: true });
