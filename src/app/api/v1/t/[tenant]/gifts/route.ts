import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { issueGiftCard, issueInput, listGiftCards } from '@/server/services/giftcards';
import { requireGrowthFeature } from '@/server/services/growth';

export const GET = api.tenant('loyalty.manage', async (c) =>
  tx(c.t, async (db) => {
    await requireGrowthFeature(db, c.t, 'giftcards.enabled');
    return { items: await listGiftCards(db, { status: c.req.nextUrl.searchParams.get('status') ?? undefined }) };
  }),
);

/**
 * Issue: the response carries the full code exactly once. Deliberately NOT
 * using the idempotency layer — it stores response bodies for replay, which
 * would persist the code. Double submission is prevented client-side and every
 * issuance is audited (a duplicate card can be voided).
 */
export const POST = api.tenant(
  'loyalty.manage',
  async (c) => {
    const b = await c.json(issueInput);
    const r = await tx(c.t, (db) => issueGiftCard(db, c.t, b));
    return new Response(JSON.stringify(r), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  },
  { rateLimit: [60, 3600] },
);
