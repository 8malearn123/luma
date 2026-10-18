import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { createCommissionRule, listCommissionRules } from '@/server/services/team';

export const GET = api.tenant(['finance.view', 'staff.manage'], async (c) => ({ items: await tx(c.t, (db) => listCommissionRules(db)) }));

export const POST = api.tenant(['finance.view', 'staff.manage'], async (c) => {
  const b = await c.json(
    z.object({
      staffId: z.string().uuid().nullable().optional(),
      serviceId: z.string().uuid().nullable().optional(),
      kind: z.enum(['percentage', 'fixed']),
      rateBps: z.number().int().min(0).max(10000).nullable().optional(),
      fixedMinor: z.number().int().min(0).max(10_000_000).nullable().optional(),
      effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  );
  return tx(c.t, (db) => createCommissionRule(db, c.t, b));
}, { idempotent: true });
