import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { sellMembership } from '@/server/services/memberships';

export const POST = api.tenant(
  ['loyalty.manage', 'payments.collect'],
  async (c) => {
    const b = await c.json(
      z.object({
        planId: z.string().uuid(),
        tenantCustomerId: z.string().uuid(),
        sale: z.object({ method: z.enum(['cash', 'card_terminal']), reference: z.string().trim().min(1).max(80) }).nullable(),
      }),
    );
    return tx(c.t, (db) => sellMembership(db, c.t, b));
  },
  { idempotent: true },
);
