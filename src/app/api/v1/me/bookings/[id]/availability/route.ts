import { z } from 'zod';
import { api } from '@/server/http/handler';
import { withTenant } from '@/server/db';
import { findAvailability } from '@/server/booking/availability';
import { bookingTenantFor } from '@/server/booking/customer';
import { AppError } from '@/server/errors';

/** Alternative times for rescheduling the same services (own current slot counts as free). */
export const POST = api.user<{ id: string }>(async (c) => {
  const b = await c.json(z.object({ from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), days: z.number().int().min(1).max(14).default(7), keepStaff: z.boolean().default(true) }));
  const tenantId = await bookingTenantFor(c.user.userId, c.params.id);
  return withTenant({ tenantId, userId: c.user.userId }, async (tx) => {
    const [bk] = await tx<{ branchId: string; status: string }[]>`select branch_id, status from bookings where id = ${c.params.id} and customer_user_id = ${c.user.userId}`;
    if (!['held', 'confirmed'].includes(bk.status)) throw new AppError('invalid_transition', 'errors.invalid_transition');
    const items = await tx<{ serviceId: string; variantId: string | null; addons: { id: string }[]; staffId: string }[]>`
      select service_id, variant_id, addons, staff_id from booking_items where booking_id = ${c.params.id} and status = 'active' order by seq`;
    const r = await findAvailability(
      tx,
      tenantId,
      { branchId: bk.branchId, from: b.from, days: b.days, items: items.map((i) => ({ serviceId: i.serviceId, variantId: i.variantId, addonIds: (i.addons ?? []).map((a) => a.id), staffId: b.keepStaff ? i.staffId : null })) },
      'public',
      { excludeBookingId: c.params.id },
    );
    return { timezone: r.timezone, days: r.days, reason: r.reason ?? null, items: items.map((i) => ({ serviceId: i.serviceId, variantId: i.variantId, addonIds: (i.addons ?? []).map((a) => a.id) })) };
  });
});
