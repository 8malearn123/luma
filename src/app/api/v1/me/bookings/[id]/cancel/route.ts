import { z } from 'zod';
import { api } from '@/server/http/handler';
import { withTenant } from '@/server/db';
import { transition } from '@/server/booking/service';
import { bookingTenantFor, customerActor } from '@/server/booking/customer';

/** Customer cancellation. Refund due follows the terms captured at booking time. */
export const POST = api.user<{ id: string }>(
  async (c) => {
    const { reason } = await c.json(z.object({ reason: z.string().trim().max(500).optional() }));
    const tenantId = await bookingTenantFor(c.user.userId, c.params.id);
    return withTenant({ tenantId, userId: c.user.userId }, (tx) =>
      transition(tx, customerActor(c.user.userId, tenantId), c.params.id, 'cancelled', { reason: reason || 'customer cancelled' }),
    );
  },
  { idempotent: true },
);
