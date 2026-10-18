import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { createSegment, explainSegment, segmentSchema } from '@/server/marketing/campaigns';

export const GET = api.tenant('marketing.view', async (c) =>
  tx(c.t, async (db) => {
    const rows = await db<{ id: string; name: string; definition: { conditions: Parameters<typeof explainSegment>[0]['conditions'] } }[]>`select id, name, definition from campaign_segments order by created_at desc limit 100`;
    return { items: rows.map((r) => ({ id: r.id, name: r.name, explanation: explainSegment(r.definition, c.user.locale) })) };
  }),
);

export const POST = api.tenant('marketing.manage', async (c) => {
  const b = await c.json(segmentSchema);
  return tx(c.t, (db) => createSegment(db, c.t, b));
});
