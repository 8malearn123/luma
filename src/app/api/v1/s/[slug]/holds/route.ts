import { api } from '@/server/http/handler';
import { createHold, holdInput } from '@/server/booking/service';
import { customerActor, customerTenantRelationship, publicTenant, runPublic } from '@/server/booking/customer';

/**
 * Create a hold. The customer is derived from the session; price, totals and
 * payment terms are computed on the server. The requested terms kind must be
 * one of the server-computed options.
 */
export const POST = api.user<{ slug: string }>(
  async (c) => {
    const t = await publicTenant(c.params.slug);
    const input = await c.json(holdInput);
    return runPublic(t, c.user.userId, async (tx) => {
      const tcId = await customerTenantRelationship(tx, t.id, c.user.userId, c.user.displayName);
      const h = await createHold(tx, customerActor(c.user.userId, t.id), { ...input, tenantCustomerId: tcId, customerUserId: c.user.userId, source: 'online', analyticsSession: c.req.cookies.get('luma_sid')?.value ?? null });
      return {
        bookingId: h.bookingId,
        number: h.number,
        status: h.status,
        holdExpiresAt: h.holdExpiresAt,
        totalMinor: h.totalMinor,
        dueNowMinor: h.dueNowMinor,
        termsKind: h.termsKind,
        explanationKey: h.terms.customerExplanationKey,
      };
    });
  },
  { idempotent: true, rateLimit: [30, 60] },
);
