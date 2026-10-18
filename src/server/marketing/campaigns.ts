import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Tx } from '../db';
import { AppError, forbidden, notFound } from '../errors';
import { audit } from '../audit';
import { recordDelivery } from '../services/notifications';
import type { TenantContext } from '../tenancy/context';
import { messagingStatus } from '../messaging';
import { utcToWall, timeToMin } from '@/lib/tz';

/**
 * Campaigns. Nothing is ever sent from this codebase: no messaging provider is
 * connected, so "sending" produces deliveries recorded as `simulated` and is
 * refused entirely in production. Sending requires: approval by a member with
 * campaign.approve, channel consent per recipient, no opt-out / suppression,
 * frequency cap, and quiet hours.
 */
export const conditionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('last_visit_days_gt'), days: z.number().int().min(1).max(3650) }),
  z.object({ type: z.literal('last_visit_days_lt'), days: z.number().int().min(1).max(3650) }),
  z.object({ type: z.literal('visits_gte'), count: z.number().int().min(1).max(1000) }),
  z.object({ type: z.literal('visited_service'), serviceIds: z.array(z.string().uuid()).min(1).max(20) }),
  z.object({ type: z.literal('has_consent'), channel: z.enum(['email', 'sms', 'whatsapp', 'push']) }),
]);
export const segmentSchema = z.object({ name: z.string().trim().min(1).max(120), conditions: z.array(conditionSchema).min(1).max(8) });
export type SegmentDef = z.infer<typeof segmentSchema>;

export function explainSegment(def: Pick<SegmentDef, 'conditions'>, locale: 'ar' | 'en' = 'ar'): string[] {
  return def.conditions.map((c) => {
    switch (c.type) {
      case 'last_visit_days_gt': return locale === 'ar' ? `آخر زيارة قبل أكثر من ${c.days} يوماً` : `Last visit more than ${c.days} days ago`;
      case 'last_visit_days_lt': return locale === 'ar' ? `آخر زيارة خلال آخر ${c.days} يوماً` : `Last visit within ${c.days} days`;
      case 'visits_gte': return locale === 'ar' ? `${c.count} زيارات مكتملة على الأقل` : `At least ${c.count} completed visits`;
      case 'visited_service': return locale === 'ar' ? `زارت إحدى الخدمات المحددة (${c.serviceIds.length})` : `Visited one of ${c.serviceIds.length} selected services`;
      case 'has_consent': return locale === 'ar' ? `موافقة تسويقية على ${c.channel}` : `Marketing consent on ${c.channel}`;
    }
  });
}

/** Compile allowlisted conditions into a parameterized query (never string-built SQL). */
export async function segmentMembers(tx: Tx, def: Pick<SegmentDef, 'conditions'>) {
  const conds = def.conditions.map((c) => {
    switch (c.type) {
      case 'last_visit_days_gt': return tx`(st.last_visit is not null and st.last_visit < now() - make_interval(days => ${c.days}))`;
      case 'last_visit_days_lt': return tx`(st.last_visit >= now() - make_interval(days => ${c.days}))`;
      case 'visits_gte': return tx`(st.visits >= ${c.count})`;
      case 'visited_service': return tx`exists (select 1 from booking_items i join bookings b on b.id = i.booking_id where b.tenant_customer_id = tc.id and b.status = 'completed' and i.service_id = any(${c.serviceIds}::uuid[]))`;
      case 'has_consent': return tx`(${latestConsent(tx, c.channel)})`;
    }
  });
  const where = conds.reduce((acc, c) => tx`${acc} and ${c}`, tx`tc.archived_at is null`);
  return tx<{ id: string; phone: string | null; email: string | null; visits: number; lastVisit: Date | null }[]>`
    select tc.id, tc.phone, tc.email, st.visits, st.last_visit from tenant_customers tc
    cross join lateral (select count(*)::int as visits, max(b.starts_at) as last_visit from bookings b where b.tenant_customer_id = tc.id and b.status = 'completed') st
    where ${where} order by tc.id`;
}

const latestConsent = (tx: Tx, channel: string) =>
  tx`coalesce((select c.status = 'granted' from customer_consents c where c.tenant_customer_id = tc.id and c.channel = ${channel} and c.purpose = 'marketing' order by c.recorded_at desc limit 1), false)`;

export async function createSegment(tx: Tx, ctx: TenantContext, input: SegmentDef) {
  if (!ctx.caps.has('marketing.manage')) throw forbidden();
  for (const c of input.conditions) {
    if (c.type === 'visited_service') {
      const ok = await tx`select count(*)::int as n from services where id = any(${c.serviceIds}::uuid[])`;
      if (ok[0].n !== new Set(c.serviceIds).size) throw new AppError('validation', 'errors.invalid_reference');
    }
  }
  const [s] = await tx<{ id: string }[]>`insert into campaign_segments (tenant_id, name, definition, created_by) values (${ctx.tenant.id}, ${input.name}, ${tx.json({ conditions: input.conditions } as never)}, ${ctx.user.userId}) returning id`;
  return s;
}

export const campaignInput = z.object({
  name: z.string().trim().min(1).max(120),
  segmentId: z.string().uuid(),
  channel: z.enum(['email', 'sms', 'whatsapp', 'instagram_post', 'in_app']),
  content: z.object({ text: z.string().trim().min(1).max(1000), textEn: z.string().max(1000).optional() }),
  couponCode: z.string().trim().max(40).optional().nullable(),
  holdoutBps: z.number().int().min(0).max(5000).default(0),
  attributionWindowDays: z.number().int().min(1).max(60).default(7),
  frequencyCapDays: z.number().int().min(1).max(90).default(7),
  recommendationId: z.string().uuid().optional().nullable(),
});

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'campaign';

export async function createCampaign(tx: Tx, ctx: TenantContext, input: z.infer<typeof campaignInput>) {
  if (!ctx.caps.has('marketing.manage')) throw forbidden();
  const utm = `${slug(input.name)}-${Date.now().toString(36)}`;
  const [c] = await tx<{ id: string }[]>`
    insert into campaigns (tenant_id, name, segment_id, channel, content, coupon_code, utm_campaign, attribution_window_days, holdout_bps, frequency_cap_days, recommendation_id, created_by)
    values (${ctx.tenant.id}, ${input.name}, ${input.segmentId}, ${input.channel}, ${tx.json(input.content as never)}, ${input.couponCode ?? null}, ${utm},
            ${input.attributionWindowDays}, ${input.holdoutBps}, ${input.frequencyCapDays}, ${input.recommendationId ?? null}, ${ctx.user.userId})
    returning id`;
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: 'campaign.drafted', targetType: 'campaign', targetId: c.id });
  return { id: c.id, utmCampaign: utm };
}

interface CampaignRow {
  id: string; tenantId: string; name: string; segmentId: string | null; channel: string; status: string; content: { text: string };
  couponCode: string | null; utmCampaign: string; scheduledAt: Date | null; attributionWindowDays: number; holdoutBps: number;
  frequencyCapDays: number; quietHours: { start: string; end: string }; approvedBy: string | null; updatedAt: Date;
}

async function load(tx: Tx, id: string) {
  const [c] = await tx<CampaignRow[]>`select * from campaigns where id = ${id} for update`;
  if (!c) throw notFound('campaign');
  return c;
}

const FLOW: Record<string, string[]> = {
  draft: ['approved', 'cancelled'],
  approved: ['scheduled', 'sending', 'draft', 'cancelled'],
  scheduled: ['sending', 'paused', 'cancelled'],
  paused: ['scheduled', 'cancelled'],
  sending: ['sent', 'failed'],
  sent: ['completed'],
};
const move = async (tx: Tx, c: CampaignRow, to: string) => {
  if (!(FLOW[c.status] ?? []).includes(to)) throw new AppError('invalid_transition', 'errors.invalid_transition', { from: c.status, to });
  await tx`update campaigns set status = ${to}, updated_at = now() where id = ${c.id}`;
};

export async function approveCampaign(tx: Tx, ctx: TenantContext, id: string) {
  if (!ctx.caps.has('campaign.approve')) throw forbidden();
  const c = await load(tx, id);
  if (!c.segmentId || !c.content?.text) throw new AppError('validation', 'errors.campaign_incomplete');
  await move(tx, c, 'approved');
  await tx`update campaigns set approved_by = ${ctx.user.userId}, approved_at = now() where id = ${id}`;
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: 'campaign.approved', targetType: 'campaign', targetId: id });
}

/** Quiet hours are wall-clock in the business timezone; a send inside them is moved to the end of the window. */
export function adjustForQuietHours(at: Date, tz: string, q: { start: string; end: string }): Date {
  const w = utcToWall(at, tz);
  const m = w.minutes;
  const s = timeToMin(q.start);
  const e = timeToMin(q.end);
  const inQuiet = s > e ? m >= s || m < e : m >= s && m < e;
  if (!inQuiet) return at;
  const addMin = s > e && m >= s ? 24 * 60 - m + e : e - m;
  return new Date(+at + addMin * 60000);
}

export async function scheduleCampaign(tx: Tx, ctx: TenantContext, id: string, at: Date) {
  if (!ctx.caps.has('campaign.approve')) throw forbidden();
  const c = await load(tx, id);
  if (+at < Date.now() - 60000) throw new AppError('validation', 'errors.schedule_in_past');
  const adjusted = adjustForQuietHours(at, ctx.tenant.timezone, c.quietHours);
  await move(tx, c, 'scheduled');
  await tx`update campaigns set scheduled_at = ${adjusted} where id = ${id}`;
  return { scheduledAt: adjusted, adjustedForQuietHours: +adjusted !== +at };
}

export async function cancelCampaign(tx: Tx, ctx: TenantContext, id: string) {
  if (!ctx.caps.has('marketing.manage')) throw forbidden();
  const c = await load(tx, id);
  await move(tx, c, 'cancelled');
}

export const destinationHash = (channel: string, dest: string) => createHash('sha256').update(`${channel}|${dest.trim().toLowerCase()}`).digest();

/** Holdout assignment is deterministic per (campaign, customer), so re-building recipients is stable. */
export const inHoldout = (campaignId: string, customerId: string, bps: number) => bps > 0 && createHash('sha256').update(`${campaignId}|${customerId}`).digest().readUInt16BE(0) % 10000 < bps;
export const MIN_HOLDOUT_SAMPLE = 200;

export async function buildRecipients(tx: Tx, c: CampaignRow) {
  const [seg] = await tx<{ definition: { conditions: SegmentDef['conditions'] } }[]>`select definition from campaign_segments where id = ${c.segmentId}`;
  if (!seg) throw notFound('segment');
  const members = await segmentMembers(tx, seg.definition);
  const consentChannel = c.channel === 'instagram_post' ? null : c.channel === 'in_app' ? 'push' : c.channel;
  const useHoldout = c.holdoutBps > 0 && members.length >= MIN_HOLDOUT_SAMPLE;
  const stats = { members: members.length, treatment: 0, holdout: 0, suppressed: { noConsent: 0, optedOut: 0, suppressionList: 0, frequencyCap: 0, noDestination: 0 }, holdoutApplied: useHoldout };
  for (const m of members) {
    let status: 'pending' | 'suppressed' = 'pending';
    let reason: string | null = null;
    if (consentChannel) {
      const [cons] = await tx<{ status: string }[]>`select status from customer_consents where tenant_customer_id = ${m.id} and channel = ${consentChannel} and purpose = 'marketing' order by recorded_at desc limit 1`;
      if (!cons) { status = 'suppressed'; reason = 'no_consent'; stats.suppressed.noConsent++; }
      else if (cons.status !== 'granted') { status = 'suppressed'; reason = 'opted_out'; stats.suppressed.optedOut++; }
      const dest = c.channel === 'email' ? m.email : m.phone;
      if (status === 'pending' && !dest && c.channel !== 'in_app') { status = 'suppressed'; reason = 'no_destination'; stats.suppressed.noDestination++; }
      if (status === 'pending' && dest) {
        const [sup] = await tx`select 1 from suppression_list where channel = ${c.channel} and destination_hash = ${destinationHash(c.channel, dest)} and (tenant_id = ${c.tenantId} or tenant_id is null)`;
        if (sup) { status = 'suppressed'; reason = 'suppression_list'; stats.suppressed.suppressionList++; }
      }
    }
    if (status === 'pending') {
      const [recent] = await tx`select 1 from campaign_recipients r where r.tenant_customer_id = ${m.id} and r.campaign_id <> ${c.id}
        and r.status in ('simulated','sent') and r.created_at > now() - make_interval(days => ${c.frequencyCapDays})`;
      if (recent) { status = 'suppressed'; reason = 'frequency_cap'; stats.suppressed.frequencyCap++; }
    }
    const arm = status === 'pending' && useHoldout && inHoldout(c.id, m.id, c.holdoutBps) ? 'holdout' : 'treatment';
    if (status === 'pending') arm === 'holdout' ? stats.holdout++ : stats.treatment++;
    await tx`insert into campaign_recipients (tenant_id, campaign_id, tenant_customer_id, arm, status, reason)
             values (${c.tenantId}, ${c.id}, ${m.id}, ${arm}, ${status}, ${reason})
             on conflict (tenant_id, campaign_id, tenant_customer_id) do update set arm = excluded.arm, status = excluded.status, reason = excluded.reason`;
  }
  return stats;
}

/**
 * "Send": requires approved/scheduled status. No provider is connected, so
 * deliveries are recorded as simulated (never in production — refused).
 */
export async function sendCampaign(tx: Tx, ctx: TenantContext | null, id: string, opts: { production: boolean }) {
  if (ctx && !ctx.caps.has('campaign.approve')) throw forbidden();
  const c = await load(tx, id);
  if (!c.approvedBy) throw new AppError('forbidden', 'errors.campaign_not_approved');
  if (c.status !== 'approved' && c.status !== 'scheduled') throw new AppError('invalid_transition', 'errors.invalid_transition', { from: c.status });
  const channelStatus = c.channel === 'email' ? messagingStatus().email : c.channel === 'sms' || c.channel === 'whatsapp' ? messagingStatus().sms : 'disconnected';
  if (opts.production && channelStatus !== 'connected') throw new AppError('unavailable', 'errors.campaign_channel_unavailable');
  await move(tx, c, 'sending');
  const stats = await buildRecipients(tx, { ...c, status: 'sending' });
  const recips = await tx<{ tenantCustomerId: string }[]>`select tenant_customer_id from campaign_recipients where campaign_id = ${id} and status = 'pending' and arm = 'treatment'`;
  for (const r of recips) {
    if (c.channel !== 'instagram_post') {
      await recordDelivery(tx, { tenantId: c.tenantId, channel: c.channel === 'email' ? 'email' : c.channel === 'sms' ? 'sms' : 'whatsapp', template: `campaign:${c.id}`, dedupeKey: `campaign:${c.id}:${r.tenantCustomerId}` });
    }
    await tx`update campaign_recipients set status = 'simulated' where campaign_id = ${id} and tenant_customer_id = ${r.tenantCustomerId}`;
  }
  await tx`update campaigns set status = 'sent', scheduled_at = coalesce(scheduled_at, now()), updated_at = now() where id = ${id}`;
  await audit(tx, { actorUserId: ctx?.user.userId ?? null, actorKind: ctx ? ctx.actorKind : 'system', tenantId: c.tenantId, action: 'campaign.simulated_send', targetType: 'campaign', targetId: id, metadata: stats as unknown as Record<string, unknown> });
  return { simulated: true, ...stats };
}

export async function optOut(tx: Tx, tenantId: string, tenantCustomerId: string, channel: 'email' | 'sms' | 'whatsapp' | 'push', campaignId?: string | null) {
  await tx`insert into customer_consents (tenant_id, tenant_customer_id, channel, purpose, status, source)
           values (${tenantId}, ${tenantCustomerId}, ${channel}, 'marketing', 'revoked', ${campaignId ? `campaign:${campaignId}` : 'opt_out'})`;
  if (campaignId) await tx`insert into campaign_events (tenant_id, campaign_id, kind, ref_type, ref_id, dedupe_key) values (${tenantId}, ${campaignId}, 'opt_out', 'tenant_customer', ${tenantCustomerId}, ${`optout:${campaignId}:${tenantCustomerId}`}) on conflict do nothing`;
}

/**
 * Results. Attributed = completed bookings (net of refunds) of treatment
 * recipients within the attribution window after sending, plus coupon
 * redemptions; each booking counted once. Incremental = treatment vs holdout
 * conversion difference — only when both arms are large enough. A
 * before/after comparison alone does not establish causality.
 */
export async function campaignResults(tx: Tx, id: string) {
  const [c] = await tx<CampaignRow[]>`select * from campaigns where id = ${id}`;
  if (!c) throw notFound('campaign');
  if (!c.scheduledAt || !['sent', 'completed'].includes(c.status)) return { status: c.status, sent: false };
  const winEnd = new Date(+c.scheduledAt + c.attributionWindowDays * 86400000);
  const arms = await tx<{ arm: string; recipients: number; converters: number; bookings: number; netRevenueMinor: number }[]>`
    with r as (select tenant_customer_id, arm from campaign_recipients where campaign_id = ${id}
               and ((arm = 'holdout' and status = 'pending') or (arm = 'treatment' and status in ('simulated','sent')))),
    b as (select bk.id, bk.tenant_customer_id, bk.total_minor - bk.refunded_minor as net from bookings bk
          where bk.created_at >= ${c.scheduledAt} and bk.created_at < ${winEnd} and bk.status = 'completed')
    select r.arm, count(distinct r.tenant_customer_id)::int as recipients, count(distinct b.tenant_customer_id)::int as converters,
           count(distinct b.id)::int as bookings, coalesce(sum(b.net), 0)::bigint as net_revenue_minor
    from r left join b on b.tenant_customer_id = r.tenant_customer_id group by r.arm`;
  // dedup-record attributions as events (idempotent)
  const att = await tx<{ id: string; net: number }[]>`
    select bk.id, bk.total_minor - bk.refunded_minor as net from bookings bk
    join campaign_recipients r on r.tenant_customer_id = bk.tenant_customer_id and r.campaign_id = ${id} and r.arm = 'treatment' and r.status in ('simulated','sent')
    where bk.created_at >= ${c.scheduledAt} and bk.created_at < ${winEnd} and bk.status = 'completed'`;
  for (const a of att) await tx`insert into campaign_events (tenant_id, campaign_id, kind, ref_type, ref_id, value_minor, dedupe_key) values (${c.tenantId}, ${id}, 'booking_attributed', 'booking', ${a.id}, ${a.net}, ${`bk:${id}:${a.id}`}) on conflict do nothing`;
  const coupon = c.couponCode ? await tx<{ n: number }[]>`select count(*)::int as n from bookings where coupon_code = ${c.couponCode} and created_at >= ${c.scheduledAt} and created_at < ${winEnd} and status = 'completed'` : [{ n: 0 }];
  const t = arms.find((a) => a.arm === 'treatment');
  const h = arms.find((a) => a.arm === 'holdout');
  const enough = !!t && !!h && t.recipients >= 100 && h.recipients >= 100;
  const rate = (a?: { recipients: number; converters: number }) => (a && a.recipients ? a.converters / a.recipients : null);
  const avg = t && t.bookings ? Number(t.netRevenueMinor) / t.bookings : 0;
  return {
    status: c.status,
    sent: true,
    simulated: true,
    window: { from: c.scheduledAt, to: winEnd, days: c.attributionWindowDays },
    treatment: t ?? null,
    holdout: h ?? null,
    attributedNetRevenueMinor: t ? Number(t.netRevenueMinor) : 0,
    couponCompletedBookings: coupon[0].n,
    incremental: enough
      ? { available: true, conversionLift: (rate(t)! - rate(h)!), estimatedNetRevenueMinor: Math.round((rate(t)! - rate(h)!) * t!.recipients * avg) }
      : { available: false, reason: 'insufficient_sample' },
    note: 'campaign.note_attribution',
  };
}

/** Worker tick: dispatch scheduled campaigns that are due (simulated outside production). */
export async function dispatchDueCampaigns(tx: Tx, production: boolean) {
  const due = await tx<{ id: string }[]>`select id from campaigns where status = 'scheduled' and scheduled_at <= now() order by scheduled_at limit 20`;
  const out: { id: string; ok: boolean; error?: string }[] = [];
  for (const d of due) {
    try {
      await tx.savepoint((sp) => sendCampaign(sp as unknown as Tx, null, d.id, { production }));
      out.push({ id: d.id, ok: true });
    } catch (e) {
      await tx`update campaigns set status = 'failed', updated_at = now() where id = ${d.id}`;
      out.push({ id: d.id, ok: false, error: String((e as Error).message) });
    }
  }
  return out;
}
