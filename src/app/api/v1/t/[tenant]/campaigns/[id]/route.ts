import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { campaignResults, explainSegment } from '@/server/marketing/campaigns';

export const GET = api.tenant<{ id: string }>('marketing.view', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  return tx(c.t, async (db) => {
    const [camp] = await db<{ segmentId: string | null }[]>`select * from campaigns where id = ${c.params.id}`;
    if (!camp) throw notFound();
    const [seg] = camp.segmentId ? await db<{ name: string; definition: { conditions: Parameters<typeof explainSegment>[0]['conditions'] } }[]>`select name, definition from campaign_segments where id = ${camp.segmentId}` : [];
    const recipients = await db`select status, reason, arm, count(*)::int as n from campaign_recipients where campaign_id = ${c.params.id} group by 1, 2, 3`;
    return { campaign: camp, segment: seg ? { name: seg.name, explanation: explainSegment(seg.definition, c.user.locale) } : null, recipients, results: await campaignResults(db, c.params.id) };
  });
});
