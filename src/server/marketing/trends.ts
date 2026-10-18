import { createHash } from 'node:crypto';
import type { Tx } from '../db';
import { AppError, forbidden, notFound } from '../errors';
import { audit } from '../audit';
import { env } from '../env';
import type { TenantContext } from '../tenancy/context';
import { safeFetch, validateUrl } from './ssrf';
import { runAi, recordValidation } from '../ai/run';
import { addPlanVersion, getPlan, type PlanContent } from './plans';
import { getProvider } from '../ai/provider';

/**
 * Trend radar. Model memory is never a news source: only fetched, dated,
 * sourced observations are shown. Metrics are copied only when the source
 * itself provides them; we never invent views or growth.
 *
 * Verification (computed on read):
 *   live        source connected, fetched ≤ 7 days ago, item published ≤ 30 days ago
 *   stale       published > 30 days ago, or the source has not been fetched for > 7 days
 *   undated     no published date → can never be "live"
 *   unavailable source disconnected / erroring
 * Evidence strength:
 *   single_example | recurring (≥3 observations from ≥2 sources in 30 days) |
 *   quantified (source-provided metrics only)
 */
export interface ParsedItem {
  title: string;
  url: string;
  summary: string | null;
  publishedAt: Date | null;
}

const strip = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const tag = (block: string, name: string) => {
  const m = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i').exec(block);
  return m ? strip(m[1]) : null;
};
const date = (s: string | null) => {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(+d) ? null : d;
};

export function parseFeed(body: string, baseUrl: string): ParsedItem[] {
  const items: ParsedItem[] = [];
  const isFeed = /<rss|<feed|<rdf:RDF/i.test(body.slice(0, 2000));
  if (isFeed) {
    const blocks = body.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? body.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
    for (const b of blocks.slice(0, 50)) {
      const title = tag(b, 'title');
      let link = tag(b, 'link');
      if (!link) link = /<link[^>]*href="([^"]+)"/i.exec(b)?.[1] ?? null;
      if (!title || !link) continue;
      let url: string;
      try {
        url = new URL(link, baseUrl).toString();
      } catch {
        continue;
      }
      if (!url.startsWith('https://')) continue;
      items.push({ title: title.slice(0, 300), url, summary: (tag(b, 'description') ?? tag(b, 'summary') ?? tag(b, 'content'))?.slice(0, 600) ?? null, publishedAt: date(tag(b, 'pubDate') ?? tag(b, 'published') ?? tag(b, 'updated') ?? tag(b, 'dc:date')) });
    }
    return items;
  }
  const meta = (prop: string) => new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']*)["']`, 'i').exec(body)?.[1] ?? new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${prop}["']`, 'i').exec(body)?.[1] ?? null;
  const title = meta('og:title') ?? tag(body, 'title');
  if (title) items.push({ title: strip(title).slice(0, 300), url: baseUrl, summary: (meta('og:description') ?? meta('description'))?.slice(0, 600) ?? null, publishedAt: date(meta('article:published_time') ?? meta('og:updated_time')) });
  return items;
}

const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'this', 'that', 'your', 'you', 'are', 'how', 'what', 'new', 'في', 'من', 'على', 'إلى', 'عن', 'مع', 'هذا', 'هذه', 'كيف', 'أفضل', 'جديد', 'ال']);
export function normalizeText(s: string) {
  return s.toLowerCase().replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
}
export function tokens(s: string): string[] {
  return normalizeText(s).split(/[^\p{L}\p{N}]+/u).map((w) => w.replace(/^ال(?=\p{L}{3})/u, '')).filter((w) => w.length >= 3 && !STOP.has(w));
}
export function clusterKey(title: string): string {
  return [...new Set(tokens(title))].sort().slice(0, 3).join('-') || 'misc';
}
export const contentHash = (title: string, url: string) => createHash('sha256').update(`${normalizeText(title).trim()}|${url.replace(/[?#].*$/, '')}`).digest('hex');

export async function addSource(tx: Tx, ctx: TenantContext, input: { kind: 'rss' | 'user_link'; name: string; url: string }) {
  if (!ctx.caps.has('marketing.manage')) throw forbidden();
  validateUrl(input.url);
  const [s] = await tx<{ id: string }[]>`insert into trend_sources (tenant_id, kind, name, url, status, created_by)
    values (${ctx.tenant.id}, ${input.kind}, ${input.name.slice(0, 120)}, ${input.url}, 'disconnected', ${ctx.user.userId}) returning id`;
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: 'trends.source_added', targetType: 'trend_source', targetId: s.id });
  return s;
}

export async function fetchSource(tx: Tx, ctx: TenantContext, sourceId: string, fetcher: typeof safeFetch = safeFetch) {
  if (!ctx.caps.has('marketing.manage')) throw forbidden();
  const [src] = await tx<{ id: string; url: string; tenantId: string | null }[]>`select id, url, tenant_id from trend_sources where id = ${sourceId}`;
  if (!src || src.tenantId !== ctx.tenant.id) throw notFound('trend_source');
  if (!env().TRENDS_FETCH_ENABLED) {
    await tx`update trend_sources set status = 'disconnected', last_error = 'fetching_disabled' where id = ${sourceId}`;
    return { status: 'disconnected' as const, reason: 'fetching_disabled', added: 0 };
  }
  try {
    const res = await fetcher(src.url);
    const items = parseFeed(res.body, res.url);
    let added = 0;
    for (const it of items) {
      const r = await tx`insert into trend_observations (tenant_id, source_id, url, title, summary, published_at, topic, cluster_key, evidence_strength, content_hash)
        values (${ctx.tenant.id}, ${src.id}, ${it.url}, ${it.title}, ${it.summary}, ${it.publishedAt}, ${tokens(it.title).slice(0, 5).join(' ')}, ${clusterKey(it.title)}, 'single_example', ${contentHash(it.title, it.url)})
        on conflict do nothing returning id`;
      added += r.length;
    }
    await tx`update trend_sources set status = 'connected', last_fetched_at = now(), last_error = null where id = ${sourceId}`;
    return { status: 'connected' as const, added, duplicates: items.length - added };
  } catch (e) {
    const code = e instanceof AppError ? e.message : 'errors.fetch_failed';
    await tx`update trend_sources set status = 'error', last_error = ${code} where id = ${sourceId}`;
    return { status: 'error' as const, reason: code, added: 0 };
  }
}

export type Verification = 'live' | 'stale' | 'undated' | 'unavailable';
export function verificationOf(o: { publishedAt: Date | null }, src: { status: string; lastFetchedAt: Date | null } | null, now = new Date()): Verification {
  if (!src || src.status !== 'connected') return 'unavailable';
  if (!src.lastFetchedAt || +now - +src.lastFetchedAt > 7 * 86400000) return 'stale';
  if (!o.publishedAt) return 'undated';
  if (+now - +o.publishedAt > 30 * 86400000 || +o.publishedAt > +now + 86400000) return 'stale';
  return 'live';
}

export async function listTrends(tx: Tx, now = new Date()) {
  const sources = await tx<{ id: string; kind: string; name: string; url: string; status: string; lastFetchedAt: Date | null; lastError: string | null }[]>`
    select id, kind, name, url, status, last_fetched_at, last_error from trend_sources where tenant_id is not null order by created_at desc`;
  const obs = await tx<{ id: string; sourceId: string | null; url: string; title: string; summary: string | null; publishedAt: Date | null; observedAt: Date; clusterKey: string; metrics: Record<string, number> }[]>`
    select id, source_id, url, title, summary, published_at, observed_at, cluster_key, metrics from trend_observations order by coalesce(published_at, observed_at) desc limit 200`;
  type Obs = (typeof obs)[number];
  const clusters = new Map<string, Obs[]>();
  for (const o of obs) clusters.set(o.clusterKey, [...(clusters.get(o.clusterKey) ?? []), o]);
  const assessments = await tx`select id, cluster_key, fit, rationale, application_idea, est_effort, est_cost, to_char(valid_until, 'YYYY-MM-DD') as valid_until, status, plan_id, created_at from trend_assessments order by created_at desc limit 100`;
  return {
    sourcesConnected: sources.some((s) => s.status === 'connected'),
    sources,
    clusters: [...clusters.entries()].map(([key, list]) => {
      const recent = list.filter((o) => o.publishedAt && +now - +o.publishedAt <= 30 * 86400000);
      const distinctSources = new Set(recent.map((o) => o.sourceId)).size;
      const quantified = list.some((o) => o.metrics && Object.keys(o.metrics).length > 0);
      return {
        key,
        evidenceStrength: quantified ? 'quantified' : recent.length >= 3 && distinctSources >= 2 ? 'recurring' : 'single_example',
        observations: list.map((o) => ({ ...o, verification: verificationOf(o, sources.find((s) => s.id === o.sourceId) ?? null, now), freshnessDays: o.publishedAt ? Math.floor((+now - +o.publishedAt) / 86400000) : null })),
        assessment: assessments.find((a) => a.clusterKey === key) ?? null,
      };
    }),
  };
}

const ASSESS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['fit', 'rationale_ar', 'rationale_en', 'idea_ar', 'idea_en', 'effort', 'cost'],
  properties: {
    fit: { type: 'string', enum: ['good', 'partial', 'poor'] },
    rationale_ar: { type: 'string' }, rationale_en: { type: 'string' }, idea_ar: { type: 'string' }, idea_en: { type: 'string' },
    effort: { type: 'string', enum: ['low', 'medium', 'high'] }, cost: { type: 'string', enum: ['none', 'low', 'medium', 'high', 'unknown'] },
  },
};

/** Fit assessment: deterministic keyword overlap with the business's own services; AI may refine wording (never evidence). */
export async function assessCluster(tx: Tx, ctx: TenantContext, key: string) {
  if (!ctx.caps.has('marketing.manage')) throw forbidden();
  const obs = await tx<{ id: string; title: string; summary: string | null }[]>`select id, title, summary from trend_observations where cluster_key = ${key} limit 20`;
  if (!obs.length) throw notFound('trend');
  const services = await tx<{ name: string; nameEn: string | null }[]>`select name, name_en from services where status = 'active'`;
  const [prof] = await tx<{ targetAudience: string | null }[]>`select target_audience from tenant_profiles limit 1`;
  const vocab = new Set(services.flatMap((s) => [...tokens(s.name), ...tokens(s.nameEn ?? '')]));
  const words = new Set(obs.flatMap((o) => tokens(`${o.title} ${o.summary ?? ''}`)));
  const overlap = [...words].filter((w) => vocab.has(w));
  let fit: 'good' | 'partial' | 'poor' = overlap.length >= 2 ? 'good' : overlap.length === 1 ? 'partial' : 'poor';
  let rationale = fit === 'poor'
    ? 'لا يرتبط بخدماتكِ الحالية بشكل مباشر — لا يناسب كل اتجاه كل نشاط. / Not directly related to your current services — not every trend fits every business.'
    : `يرتبط بخدماتكِ عبر: ${overlap.join('، ')} / Related to your services via: ${overlap.join(', ')}`;
  let idea: string | null = fit === 'poor' ? null : 'محتوى يعرض أعمالكِ الحقيقية المرتبطة بهذا الاتجاه. / Content showing your real work related to this trend.';
  let effort = 'low';
  let cost = 'unknown';
  let runId: string | null = null;
  if (getProvider()) {
    const res = await runAi(tx, {
      tenantId: ctx.tenant.id,
      userId: ctx.user.userId,
      purpose: 'trend_assessment',
      promptId: 'trends.assess@1',
      task: `Assess fit for this business. Services: ${services.map((s) => s.name).join(', ')}. Audience: ${prof?.targetAudience ?? 'unknown'}. Keyword overlap found: ${overlap.join(', ') || 'none'}.`,
      untrusted: obs.slice(0, 8).map((o, i) => ({ label: `observation_${i}`, content: `${o.title}\n${o.summary ?? ''}` })),
      schemaName: 'trend_fit',
      schema: ASSESS_SCHEMA,
    });
    runId = res.runId;
    if (res.ok) {
      const o = res.output as { fit: typeof fit; rationale_ar: string; rationale_en: string; idea_ar: string; idea_en: string; effort: string; cost: string };
      // the model may lower the fit but never raise it above the evidence-based keyword fit
      const order = { poor: 0, partial: 1, good: 2 } as const;
      const capped = order[o.fit] > order[fit];
      fit = capped ? fit : o.fit;
      rationale = `${o.rationale_ar} / ${o.rationale_en}`;
      idea = fit === 'poor' ? null : `${o.idea_ar} / ${o.idea_en}`;
      effort = o.effort;
      cost = o.cost;
      await recordValidation(tx, res.runId, { fitCapped: capped });
    }
  }
  const validUntil = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  const [a] = await tx<{ id: string }[]>`
    insert into trend_assessments (tenant_id, cluster_key, observation_ids, fit, rationale, application_idea, est_effort, est_cost, valid_until, ai_run_id)
    values (${ctx.tenant.id}, ${key}, ${obs.map((o) => o.id)}, ${fit}, ${rationale}, ${idea}, ${effort}, ${cost}, ${validUntil}, ${runId}) returning id`;
  return { id: a.id, fit, rationale, idea };
}

export async function addAssessmentToPlan(tx: Tx, ctx: TenantContext, assessmentId: string, planId: string) {
  const [a] = await tx<{ id: string; clusterKey: string; applicationIdea: string | null; fit: string; validUntil: string }[]>`
    select id, cluster_key, application_idea, fit, to_char(valid_until,'YYYY-MM-DD') as valid_until from trend_assessments where id = ${assessmentId}`;
  if (!a) throw notFound('trend_assessment');
  if (a.fit === 'poor') throw new AppError('validation', 'errors.trend_poor_fit');
  const { plan, current } = await getPlan(tx, planId);
  if (plan.horizon !== 'weekly') throw new AppError('validation', 'errors.trend_weekly_only');
  const content: PlanContent = structuredClone(current.content);
  const [ar, en] = (a.applicationIdea ?? '').split(' / ');
  content.initiatives.push({
    id: `ini-trend-${a.id.slice(0, 8)}`,
    title: { ar: `اتجاه: ${a.clusterKey}`, en: `Trend: ${a.clusterKey}` },
    recommendationId: null,
    activities: [{ id: `act-trend-${a.id.slice(0, 8)}`, title: { ar: ar ?? '', en: en ?? ar ?? '' }, date: plan.periodStart, channel: 'instagram_post', ownerRole: 'owner', status: 'planned', trendAssessmentId: a.id }],
  });
  const r = await addPlanVersion(tx, ctx, planId, content, `trend ${a.clusterKey} added`);
  await tx`update trend_assessments set status = 'added_to_plan', plan_id = ${planId} where id = ${a.id}`;
  return r;
}
