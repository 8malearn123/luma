import { z } from 'zod';
import { api } from '@/server/http/handler';
import { AppError } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { redeemGiftCard } from '@/server/services/giftcards';

export const POST = api.tenant(
  ['payments.collect'],
  async (c) => {
    const b = await c.json(
      z.object({ code: z.string().trim().min(16).max(24), amountMinor: z.number().int().positive(), bookingId: z.string().uuid().optional(), orderId: z.string().uuid().optional() }),
    );
    if (!!b.bookingId === !!b.orderId) throw new AppError('validation', 'errors.validation');
    return tx(c.t, (db) => redeemGiftCard(db, { tenantId: c.t.tenant.id, userId: c.user.userId, callerKey: `${c.t.tenant.id}:${c.user.userId}` }, b.code, b.amountMinor, { bookingId: b.bookingId, orderId: b.orderId }));
  },
  { idempotent: true },
);
