import { z } from 'zod';
import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { joinGroupSession } from '@/server/services/groups';

/** Staff adds a customer (of THIS business) to a session — on-site/manual terms only. */
export const POST = api.tenant<{ id: string }>(
  'bookings.manage',
  async (c) => {
    if (!uuid.safeParse(c.params.id).success) throw notFound();
    const b = await c.json(z.object({ tenantCustomerId: z.string().uuid(), seats: z.number().int().min(1).max(10).default(1), termsKind: z.enum(['on_site', 'manual_approval']).default('on_site') }));
    return tx(c.t, async (db) => {
      const [cust] = await db<{ userId: string | null }[]>`select user_id from tenant_customers where id = ${b.tenantCustomerId}`;
      if (!cust) throw notFound();
      return joinGroupSession(db, c.t.tenant.id, { sessionId: c.params.id, seats: b.seats, termsKind: b.termsKind, tenantCustomerId: b.tenantCustomerId, customerUserId: cust.userId, createdBy: c.user.userId, source: 'staff' });
    });
  },
  { idempotent: true },
);
