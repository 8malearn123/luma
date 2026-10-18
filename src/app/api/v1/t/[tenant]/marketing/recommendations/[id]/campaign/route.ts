import { api, uuid } from '@/server/http/handler';
import { AppError, notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { createCampaign, createSegment } from '@/server/marketing/campaigns';

/** Convert a recommendation into a campaign DRAFT (never sent until approved). */
export const POST = api.tenant<{ id: string }>('marketing.manage', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  return tx(c.t, async (db) => {
    const [r] = await db<{ id: string; content: { title: { ar: string }; channel: string | null; draft_content: { channel: string; text: { ar: string; en: string } } | null } }[]>`
      select id, content from recommendations where id = ${c.params.id}`;
    if (!r) throw notFound();
    if (!r.content.draft_content) throw new AppError('validation', 'errors.recommendation_no_draft');
    const channel = (['email', 'sms', 'whatsapp', 'instagram_post', 'in_app'].includes(r.content.draft_content.channel) ? r.content.draft_content.channel : 'whatsapp') as 'email' | 'sms' | 'whatsapp' | 'instagram_post' | 'in_app';
    const seg = await createSegment(db, c.t, { name: `${r.content.title.ar}`.slice(0, 120), conditions: [{ type: 'last_visit_days_lt', days: 365 }, ...(channel === 'instagram_post' ? [] : [{ type: 'has_consent' as const, channel: channel === 'in_app' ? ('push' as const) : channel }])] });
    const camp = await createCampaign(db, c.t, { name: r.content.title.ar.slice(0, 120), segmentId: seg.id, channel, content: { text: r.content.draft_content.text.ar, textEn: r.content.draft_content.text.en }, holdoutBps: 2000, attributionWindowDays: 14, frequencyCapDays: 7, recommendationId: r.id });
    return { campaignId: camp.id };
  });
});
