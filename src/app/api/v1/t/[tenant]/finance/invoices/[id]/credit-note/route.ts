import { z } from 'zod';
import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { issueCreditNote } from '@/server/finance/invoices';
import { requireRecentStepUp } from '@/server/auth/service';

/** Manual credit note (correction). Returns issue theirs automatically. */
export const POST = api.tenant<{ id: string }>('refunds.issue', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound('invoice');
  requireRecentStepUp(c.user);
  const b = await c.json(z.object({ amountMinor: z.number().int().min(1).max(100_000_000), reason: z.string().trim().min(3).max(300) }));
  return tx(c.t, (db) => issueCreditNote(db, c.t, c.params.id, b));
}, { idempotent: true });
