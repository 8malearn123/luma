import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { listEntries } from '@/server/services/waitlist';
import { requireGrowthFeature } from '@/server/services/growth';

export const GET = api.tenant('waitlist.manage', async (c) =>
  tx(c.t, async (db) => {
    await requireGrowthFeature(db, c.t, 'waitlist.enabled');
    return { items: await listEntries(db, { status: c.req.nextUrl.searchParams.get('status') ?? undefined }) };
  }),
);
