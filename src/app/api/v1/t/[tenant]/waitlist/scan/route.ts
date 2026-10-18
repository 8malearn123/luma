import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { expireWaitlist, issueOffers } from '@/server/services/waitlist';
import { requireGrowthFeature } from '@/server/services/growth';

/** Run the matcher now (the background job does the same every few minutes). */
export const POST = api.tenant(
  'waitlist.manage',
  async (c) =>
    tx(c.t, async (db) => {
      await requireGrowthFeature(db, c.t, 'waitlist.enabled');
      const expired = await expireWaitlist(db);
      const offers = await issueOffers(db);
      return { ...expired, offersIssued: offers.length };
    }),
  { rateLimit: [20, 600] },
);
