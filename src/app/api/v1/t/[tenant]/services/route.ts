import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { createService, listServices } from '@/server/services/catalog';
import { redactCosts } from '@/server/services/catalog-redact';
import { serviceInput } from '@/lib/validation/catalog';

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['active', 'inactive', 'archived']).optional(),
  categoryId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
});

export const GET = api.tenant(['catalog.manage', 'bookings.manage', 'bookings.view_assigned'], async (c) => {
  const q = c.query(listQuery);
  const r = await tx(c.t, (db) => listServices(db, q));
  return { ...r, items: r.items.map((s) => redactCosts(c.t, s as unknown as Record<string, unknown>)) };
});

export const POST = api.tenant(
  'catalog.manage',
  async (c) => {
    const body = await c.json(serviceInput);
    return tx(c.t, (db) => createService(db, c.t, body));
  },
  { idempotent: true },
);
