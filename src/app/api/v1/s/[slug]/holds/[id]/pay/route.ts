import { z } from 'zod';
import { api } from '@/server/http/handler';
import { startBookingPayment } from '@/server/payments/service';
import { publicTenant, runPublic } from '@/server/booking/customer';
import { AppError, notFound } from '@/server/errors';

/** Start (or resume) the online payment for a hold; returns the provider's hosted checkout URL. */
export const POST = api.user<{ slug: string; id: string }>(
  async (c) => {
    if (!z.string().uuid().safeParse(c.params.id).success) throw notFound();
    const key = c.req.headers.get('idempotency-key');
    if (!key) throw new AppError('validation', 'errors.idempotency_key_required');
    const t = await publicTenant(c.params.slug);
    return runPublic(t, c.user.userId, (tx) => startBookingPayment(tx, c.user.userId, c.params.id, key));
  },
  { idempotent: true, rateLimit: [20, 60] },
);
