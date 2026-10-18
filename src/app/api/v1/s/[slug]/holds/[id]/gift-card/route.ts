import { z } from 'zod';
import { api } from '@/server/http/handler';
import { transition } from '@/server/booking/service';
import { customerActor, publicTenant, runPublic } from '@/server/booking/customer';
import { AppError, notFound } from '@/server/errors';
import { redeemGiftCard } from '@/server/services/giftcards';

/**
 * Apply a gift card to the customer's own held booking. Applies at most the
 * amount due now (deposit/full) or the outstanding total (on-site terms). When
 * the gift card covers what online terms require, the booking is confirmed by
 * the system — exactly as a verified provider payment would.
 */
export const POST = api.user<{ slug: string; id: string }>(
  async (c) => {
    if (!z.string().uuid().safeParse(c.params.id).success) throw notFound();
    const { code } = await c.json(z.object({ code: z.string().trim().min(8).max(40) }));
    const t = await publicTenant(c.params.slug);
    return runPublic(t, c.user.userId, async (tx) => {
      const [b] = await tx<{ id: string; status: string; customerUserId: string | null; paymentTerms: string; totalMinor: number; depositDueMinor: number; paidMinor: number }[]>`
        select id, status, customer_user_id, payment_terms, total_minor, deposit_due_minor, paid_minor from bookings
        where id = ${c.params.id} and tenant_id = ${t.id} for update`;
      if (!b || b.customerUserId !== c.user.userId) throw notFound('booking');
      if (!['held', 'pending_payment'].includes(b.status)) throw new AppError('invalid_transition', 'errors.invalid_transition');
      const target = b.paymentTerms === 'deposit' ? b.depositDueMinor : b.totalMinor;
      const due = Math.max(0, target - b.paidMinor);
      if (due <= 0) throw new AppError('validation', 'errors.nothing_to_pay');
      const r = await redeemGiftCard(tx, { tenantId: t.id, userId: c.user.userId, callerKey: `${c.user.userId}:${c.ip ?? ''}` }, code, due, { bookingId: b.id });
      const [after] = await tx<{ paidMinor: number }[]>`select paid_minor from bookings where id = ${b.id}`;
      const remaining = Math.max(0, target - after.paidMinor);
      let status = b.status;
      if (remaining === 0 && (b.paymentTerms === 'full' || b.paymentTerms === 'deposit')) {
        await transition(tx, { kind: 'system', tenantId: t.id, reason: 'gift card covered amount due' }, b.id, 'confirmed');
        status = 'confirmed';
      }
      return { appliedMinor: r.appliedMinor, dueNowMinor: b.paymentTerms === 'on_site' ? 0 : remaining, status };
    });
  },
  { idempotent: true, rateLimit: [10, 600] },
);
