import { z } from 'zod';
import { api, uuid } from '@/server/http/handler';
import { AppError, notFound } from '@/server/errors';
import { acceptOffer } from '@/server/services/waitlist';
import { withStorefront } from '@/server/services/growth-public';

export const POST = api.user<{ slug: string; id: string }>(
  async (c) => {
    if (!uuid.safeParse(c.params.id).success) throw notFound();
    const b = await c.json(z.object({ termsKind: z.enum(['full', 'deposit', 'on_site', 'manual_approval']) }));
    const r = await withStorefront(c.params.slug, c.user.userId, (tx) => acceptOffer(tx, c.user.userId, c.params.id, b.termsKind));
    if (!r.ok) throw new AppError('slot_unavailable', 'growth.offer_slot_taken');
    return { bookingId: r.hold.bookingId, number: r.hold.number, status: r.hold.status, holdExpiresAt: r.hold.holdExpiresAt, dueNowMinor: r.hold.dueNowMinor };
  },
  { idempotent: true },
);
