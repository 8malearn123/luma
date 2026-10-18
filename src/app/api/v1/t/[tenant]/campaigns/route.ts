import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { campaignInput, createCampaign } from '@/server/marketing/campaigns';
import { entitlements, requireFeature } from '@/server/tenancy/plan';

export const GET = api.tenant('marketing.view', async (c) =>
  tx(c.t, async (db) => ({
    items: await db`select c.id, c.name, c.channel, c.status, c.scheduled_at, c.approved_at, c.utm_campaign, c.coupon_code, c.created_at, s.name as segment_name,
                      (select count(*) from campaign_recipients r where r.campaign_id = c.id and r.status = 'simulated')::int as simulated,
                      (select count(*) from campaign_recipients r where r.campaign_id = c.id and r.status = 'suppressed')::int as suppressed
                    from campaigns c left join campaign_segments s on s.id = c.segment_id order by c.created_at desc limit 100`,
  })),
);

export const POST = api.tenant('marketing.manage', async (c) => {
  const b = await c.json(campaignInput);
  return tx(c.t, async (db) => {
    requireFeature(await entitlements(db, c.t.tenant.id), 'marketing.enabled');
    return createCampaign(db, c.t, b);
  });
});
