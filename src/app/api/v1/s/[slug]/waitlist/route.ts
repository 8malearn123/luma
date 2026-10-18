import { api } from '@/server/http/handler';
import { joinInput, joinWaitlist, myEntries } from '@/server/services/waitlist';
import { myRelationship, withStorefront } from '@/server/services/growth-public';

/** Join the waitlist of this business (sign-in required; consent is explicit). */
export const POST = api.user<{ slug: string }>(
  async (c) => {
    const b = await c.json(joinInput);
    return withStorefront(c.params.slug, c.user.userId, async (tx, tenantId) => {
      const tcId = await myRelationship(tx, tenantId, c.user.userId, c.user.displayName);
      return joinWaitlist(tx, tenantId, { userId: c.user.userId, tenantCustomerId: tcId }, b);
    });
  },
  { rateLimit: [20, 3600] },
);

export const GET = api.user<{ slug: string }>(async (c) =>
  withStorefront(c.params.slug, c.user.userId, async (tx) => ({ items: await myEntries(tx, c.user.userId) })),
);
