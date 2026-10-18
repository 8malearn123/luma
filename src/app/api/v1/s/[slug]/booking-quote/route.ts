import { z } from 'zod';
import { api } from '@/server/http/handler';
import { verifyItinerary, type ChosenItem } from '@/server/booking/availability';
import { computePaymentTerms } from '@/server/booking/terms';
import { chosenItemSchema } from '@/server/booking/service';
import { publicTenant, runPublic } from '@/server/booking/customer';

/**
 * Read-only review quote for a chosen itinerary: server price and the payment
 * options this customer may use (business policy + her active decisions +
 * methods actually connected). Nothing is reserved; the hold re-verifies.
 */
export const POST = api.user<{ slug: string }>(
  async (c) => {
    const t = await publicTenant(c.params.slug);
    const b = await c.json(z.object({ branchId: z.string().uuid(), items: z.array(chosenItemSchema).min(1).max(5) }));
    return runPublic(t, c.user.userId, async (tx) => {
      const items = [...b.items].sort((x, y) => +new Date(x.startsAt) - +new Date(y.startsAt));
      const { planned } = await verifyItinerary(tx, t.id, b.branchId, items as ChosenItem[], 'public');
      const total = planned.reduce((n, p) => n + p.priceMinor, 0);
      const terms = await computePaymentTerms(tx, t.id, c.user.userId, total);
      const [pol] = await tx<{ policyText: string | null; policyTextEn: string | null; holdMinutes: number; cancellationWindowHours: number }[]>`
        select policy_text, policy_text_en, hold_minutes, cancellation_window_hours from booking_policies limit 1`;
      return {
        totalMinor: total,
        items: planned.map((p) => ({ serviceId: p.item.serviceId, staffId: p.staffId, startsAt: new Date(p.startsAt).toISOString(), endsAt: new Date(p.endsAt).toISOString(), priceMinor: p.priceMinor })),
        options: terms.options,
        blocked: terms.blocked,
        fallback: terms.fallback,
        explanationKey: terms.customerExplanationKey,
        policy: pol ?? null,
      };
    });
  },
  { rateLimit: [60, 60] },
);
