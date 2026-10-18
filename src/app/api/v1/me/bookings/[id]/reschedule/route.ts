import { api } from '@/server/http/handler';
import { withTenant } from '@/server/db';
import { reschedule, rescheduleInput } from '@/server/booking/service';
import { bookingTenantFor, customerActor } from '@/server/booking/customer';

/** Atomic reschedule: the replacement is reserved before the original is released; failure keeps the original. */
export const POST = api.user<{ id: string }>(
  async (c) => {
    const input = await c.json(rescheduleInput);
    const tenantId = await bookingTenantFor(c.user.userId, c.params.id);
    return withTenant({ tenantId, userId: c.user.userId }, (tx) => reschedule(tx, customerActor(c.user.userId, tenantId), c.params.id, input));
  },
  { idempotent: true },
);
