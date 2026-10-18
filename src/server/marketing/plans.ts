import type { Tx } from '../db';
import { AppError, forbidden, notFound } from '../errors';
import { audit } from '../audit';
import type { TenantContext } from '../tenancy/context';
import { runAi, recordValidation } from '../ai/run';
import { addDays } from '@/lib/tz';
import { checkClaims } from './validate';
import type { Loc, RecommendationContent } from './recommendations';
import type { Snapshot } from './snapshot';
import type { AiFailureCode } from '../ai/types';

/**
 * Marketing plans. Content lives in immutable plan_versions; edits and
 * regenerations append a version. An approved plan's current version is never
 * changed silently: a regenerated version is added as a *proposal* and only
 * becomes current when someone with campaign.approve adopts it.
 */
export type PlanStatus = 'draft' | 'proposed' | 'under_review' | 'approved' | 'in_progress' | 'completed' | 'deferred' | 'rejected';

export interface PlanActivity {
  id: string;
  title: Loc;
  date: string;
  channel: string | null;
  ownerRole: 'owner' | 'manager' | 'receptionist';
  status: 'planned' | 'done' | 'skipped';
  recommendationId?: string | null;
  trendAssessmentId?: string | null;
}

export interface PlanContent {
  goal: Loc;
  parentGoal: Loc | null;
  baseline: { metrics: Record<string, number>; note: Loc };
  initiatives: { id: string; title: Loc; recommendationId: string | null; activities: PlanActivity[] }[];
  budget: { amountMinor: number | null; note: Loc };
  metrics: { key: string; label: Loc; baseline: number | null }[];
  limitations: Loc[];
  insufficientData: boolean;
  isExample: boolean;
  dataAsOf: string;
  snapshotHash: string;
  provenance: { source_type: 'rules' | 'ai' | 'example' | 'manual'; provider: string | null; model: string | null; prompt_version: string | null };
}

const TRANSITIONS: Record<PlanStatus, PlanStatus[]> = {
  draft: ['proposed', 'rejected'],
  proposed: ['under_review', 'approved', 'deferred', 'rejected'],
  under_review: ['approved', 'deferred', 'rejected', 'proposed'],
  approved: ['in_progress', 'deferred'],
  in_progress: ['completed', 'deferred'],
  deferred: ['proposed'],
  completed: [],
  rejected: [],
};

const actOf = (ctx: TenantContext) => ({ actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, requestId: ctx.requestId });
let seq = 0;
const nid = (p: string) => `${p}-${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Deterministic plan assembly from (rule or AI) recommendations — works without AI. */
export function assemblePlan(s: Snapshot, recs: (RecommendationContent & { id?: string })[], horizon: 'weekly' | 'monthly', opts: { planPeriod: { from: string; to: string; days: number }; parentGoal?: Loc | null; isExample?: boolean; insufficientData: boolean; limitations: Loc[] }): PlanContent {
  const occ = s.index['occupancy.total'];
  const goal: Loc = opts.insufficientData
    ? { ar: 'تجربة أولى: بناء خط أساس للبيانات وجذب أول الحجوزات المتكررة', en: 'First experiment: build a data baseline and earn first repeat bookings' }
    : occ !== undefined && occ < 0.6
      ? { ar: 'رفع الإشغال في الأوقات الهادئة دون خصومات دائمة', en: 'Raise occupancy in quiet times without permanent discounts' }
      : { ar: 'تعزيز العودة والولاء مع الحفاظ على الهامش', en: 'Strengthen returns and loyalty while protecting margin' };
  const days = opts.planPeriod.days;
  const initiatives = recs.slice(0, horizon === 'weekly' ? 3 : 5).map((r, i) => ({
    id: nid('ini'),
    title: r.title,
    recommendationId: r.id ?? null,
    activities: [
      {
        id: nid('act'),
        title: r.suggested_action,
        date: addDays(opts.planPeriod.from, Math.min(days - 1, i * Math.max(1, Math.floor(days / Math.max(1, recs.length))))),
        channel: r.channel,
        ownerRole: 'owner' as const,
        status: 'planned' as const,
        recommendationId: r.id ?? null,
      },
    ],
  }));
  const baseline: Record<string, number> = {};
  for (const k of ['occupancy.total', 'history.completed_visits_90d', 'customers.active_90d', 'customers.with_marketing_consent']) if (k in s.index) baseline[k] = s.index[k];
  return {
    goal,
    parentGoal: opts.parentGoal ?? null,
    baseline: { metrics: baseline, note: { ar: `محسوب من بيانات حتى ${s.dataAsOf.slice(0, 10)}`, en: `Computed from data as of ${s.dataAsOf.slice(0, 10)}` } },
    initiatives,
    budget: s.preferences.monthlyBudgetMinor != null ? { amountMinor: horizon === 'weekly' ? Math.floor(s.preferences.monthlyBudgetMinor / 4) : s.preferences.monthlyBudgetMinor, note: { ar: 'من ميزانيتكِ المحددة', en: 'From your stated budget' } } : { amountMinor: null, note: { ar: 'الميزانية غير محددة', en: 'Budget not set' } },
    metrics: Object.entries(baseline).map(([key, v]) => ({ key, label: { ar: key, en: key }, baseline: v })),
    limitations: opts.limitations,
    insufficientData: opts.insufficientData,
    isExample: !!opts.isExample,
    dataAsOf: s.dataAsOf,
    snapshotHash: s.hash,
    provenance: { source_type: opts.isExample ? 'example' : 'rules', provider: null, model: null, prompt_version: null },
  };
}

const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['goal_ar', 'goal_en', 'initiatives'],
  properties: {
    goal_ar: { type: 'string' },
    goal_en: { type: 'string' },
    initiatives: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['index', 'title_ar', 'title_en', 'activity_ar', 'activity_en', 'date'],
        properties: { index: { type: 'integer' }, title_ar: { type: 'string' }, title_en: { type: 'string' }, activity_ar: { type: 'string' }, activity_en: { type: 'string' }, date: { type: 'string' } },
      },
    },
  },
};

/** Optional AI wording/scheduling refinement; dates must stay in the period, numbers must be supported. */
export async function refinePlanWithAi(tx: Tx, tenantId: string, userId: string | null, s: Snapshot, plan: PlanContent, horizon: 'weekly' | 'monthly', planPeriod: { from: string; to: string }): Promise<{ plan: PlanContent; failure: AiFailureCode | null; runId: string | null }> {
  const res = await runAi(tx, {
    tenantId,
    userId,
    purpose: `marketing_plan_${horizon}`,
    promptId: 'marketing.plan@1',
    task: `Locale: ${s.business.locale}. Plan period ${planPeriod.from}..${planPeriod.to}. Rewrite the goal and initiative activities; keep one activity per initiative; dates must be inside the period (YYYY-MM-DD).${plan.parentGoal ? ` This weekly plan serves the monthly goal: ${plan.parentGoal.en}` : ''}`,
    data: { plan: { goal: plan.goal, initiatives: plan.initiatives.map((x, i) => ({ index: i, title: x.title, activity: x.activities[0]?.title })) }, snapshotIndex: s.index },
    schemaName: 'loom_plan',
    schema: PLAN_SCHEMA,
  });
  if (!res.ok) return { plan, failure: res.code, runId: res.runId };
  const out = res.output as { goal_ar: string; goal_en: string; initiatives: { index: number; title_ar: string; title_en: string; activity_ar: string; activity_en: string; date: string }[] };
  const flagged: string[] = [];
  const next: PlanContent = { ...plan, initiatives: plan.initiatives.map((x) => ({ ...x, activities: x.activities.map((a) => ({ ...a })) })) };
  const goal = { ar: out.goal_ar, en: out.goal_en };
  if (checkClaims(s, { title: goal, opportunity: { ar: '', en: '' }, measured_metrics: {} }).ok) next.goal = goal;
  else flagged.push('goal');
  for (const it of out.initiatives ?? []) {
    const target = next.initiatives[it.index];
    if (!target) continue;
    const title = { ar: it.title_ar, en: it.title_en };
    if (!checkClaims(s, { title, opportunity: { ar: it.activity_ar, en: it.activity_en }, measured_metrics: {} }).ok) {
      flagged.push(`initiative_${it.index}`);
      continue;
    }
    target.title = title;
    if (target.activities[0]) {
      target.activities[0].title = { ar: it.activity_ar, en: it.activity_en };
      if (/^\d{4}-\d{2}-\d{2}$/.test(it.date) && it.date >= planPeriod.from && it.date <= planPeriod.to) target.activities[0].date = it.date;
      else flagged.push(`date_${it.index}`);
    }
  }
  next.provenance = { source_type: 'ai', provider: res.provider, model: res.model, prompt_version: res.promptVersion };
  await recordValidation(tx, res.runId, { flagged });
  return { plan: next, failure: null, runId: res.runId };
}

export async function createPlanRecord(
  tx: Tx,
  tenantId: string,
  userId: string | null,
  p: { horizon: 'weekly' | 'monthly'; periodStart: string; periodEnd: string; parentPlanId?: string | null; title: string; content: PlanContent; source: 'ai' | 'manual' | 'example'; aiRunId?: string | null },
) {
  if (p.horizon === 'weekly' && p.parentPlanId) {
    const [parent] = await tx`select id from marketing_plans where id = ${p.parentPlanId} and horizon = 'monthly'`;
    if (!parent) throw new AppError('validation', 'errors.invalid_reference');
  }
  const [plan] = await tx<{ id: string }[]>`
    insert into marketing_plans (tenant_id, horizon, period_start, period_end, parent_plan_id, title, status, current_version, source, is_example, created_by)
    values (${tenantId}, ${p.horizon}, ${p.periodStart}, ${p.periodEnd}, ${p.parentPlanId ?? null}, ${p.title}, 'proposed', 1, ${p.source}, ${p.content.isExample}, ${userId})
    returning id`;
  await tx`insert into plan_versions (tenant_id, plan_id, number, content, change_note, ai_run_id, created_by)
           values (${tenantId}, ${plan.id}, 1, ${tx.json(p.content as never)}, 'initial', ${p.aiRunId ?? null}, ${userId})`;
  return plan.id;
}

export async function getPlan(tx: Tx, id: string) {
  const [plan] = await tx<{ id: string; horizon: string; periodStart: string; periodEnd: string; parentPlanId: string | null; title: string; status: PlanStatus; currentVersion: number; source: string; isExample: boolean; approvedAt: Date | null; createdAt: Date }[]>`
    select id, horizon, to_char(period_start,'YYYY-MM-DD') as period_start, to_char(period_end,'YYYY-MM-DD') as period_end, parent_plan_id, title, status,
           current_version, source, is_example, approved_at, created_at from marketing_plans where id = ${id}`;
  if (!plan) throw notFound('plan');
  const versions = await tx<{ number: number; content: PlanContent; changeNote: string | null; createdAt: Date; aiRunId: string | null }[]>`
    select number, content, change_note, created_at, ai_run_id from plan_versions where plan_id = ${id} order by number desc`;
  const comments = await tx`select c.id, c.body, c.created_at, u.display_name as author from plan_comments c join users u on u.id = c.author_id where c.plan_id = ${id} order by c.created_at`;
  const current = versions.find((v) => v.number === plan.currentVersion) ?? versions[versions.length - 1];
  const pending = versions.filter((v) => v.number > plan.currentVersion);
  return { plan, current, versions, pendingVersions: pending, comments };
}

export async function listPlans(tx: Tx) {
  return tx`select p.id, p.horizon, to_char(p.period_start,'YYYY-MM-DD') as period_start, to_char(p.period_end,'YYYY-MM-DD') as period_end, p.title, p.status,
              p.current_version, p.source, p.is_example, p.parent_plan_id, p.created_at,
              (select max(number) from plan_versions v where v.plan_id = p.id) as latest_version
            from marketing_plans p order by p.period_start desc, p.created_at desc limit 100`;
}

/** Edit = new immutable version. For an approved plan the edit is a proposal until adopted. */
export async function addPlanVersion(tx: Tx, ctx: TenantContext, planId: string, content: PlanContent, note: string, aiRunId: string | null = null) {
  if (!ctx.caps.has('marketing.manage')) throw forbidden();
  const [p] = await tx<{ status: PlanStatus; currentVersion: number }[]>`select status, current_version from marketing_plans where id = ${planId} for update`;
  if (!p) throw notFound('plan');
  if (p.status === 'completed' || p.status === 'rejected') throw new AppError('invalid_transition', 'errors.invalid_transition');
  const [{ max }] = await tx<{ max: number }[]>`select max(number)::int as max from plan_versions where plan_id = ${planId}`;
  const n = max + 1;
  await tx`insert into plan_versions (tenant_id, plan_id, number, content, change_note, ai_run_id, created_by)
           values (${ctx.tenant.id}, ${planId}, ${n}, ${tx.json(content as never)}, ${note.slice(0, 300)}, ${aiRunId}, ${ctx.user.userId})`;
  const locked = p.status === 'approved' || p.status === 'in_progress';
  if (!locked) await tx`update marketing_plans set current_version = ${n}, updated_at = now() where id = ${planId}`;
  await audit(tx, { ...actOf(ctx), action: 'marketing.plan_version_added', targetType: 'plan', targetId: planId, metadata: { version: n, pendingAdoption: locked } });
  return { version: n, pendingAdoption: locked };
}

export async function adoptVersion(tx: Tx, ctx: TenantContext, planId: string, version: number) {
  if (!ctx.caps.has('campaign.approve')) throw forbidden();
  const [v] = await tx`select 1 from plan_versions where plan_id = ${planId} and number = ${version}`;
  if (!v) throw notFound('plan_version');
  await tx`update marketing_plans set current_version = ${version}, approved_by = ${ctx.user.userId}, approved_at = now(), updated_at = now() where id = ${planId}`;
  await audit(tx, { ...actOf(ctx), action: 'marketing.plan_version_adopted', targetType: 'plan', targetId: planId, metadata: { version } });
}

export async function transitionPlan(tx: Tx, ctx: TenantContext, planId: string, to: PlanStatus) {
  const [p] = await tx<{ status: PlanStatus }[]>`select status from marketing_plans where id = ${planId} for update`;
  if (!p) throw notFound('plan');
  if (!TRANSITIONS[p.status].includes(to)) throw new AppError('invalid_transition', 'errors.invalid_transition', { from: p.status, to });
  const needApprove = to === 'approved';
  if (needApprove ? !ctx.caps.has('campaign.approve') : !ctx.caps.has('marketing.manage')) throw forbidden();
  await tx`update marketing_plans set status = ${to}, updated_at = now(),
           approved_by = case when ${needApprove} then ${ctx.user.userId}::uuid else approved_by end,
           approved_at = case when ${needApprove} then now() else approved_at end where id = ${planId}`;
  await audit(tx, { ...actOf(ctx), action: `marketing.plan_${to}`, targetType: 'plan', targetId: planId, metadata: { from: p.status } });
}

export async function addComment(tx: Tx, ctx: TenantContext, planId: string, body: string) {
  if (!ctx.caps.has('marketing.view')) throw forbidden();
  const [p] = await tx`select 1 from marketing_plans where id = ${planId}`;
  if (!p) throw notFound('plan');
  await tx`insert into plan_comments (tenant_id, plan_id, author_id, body) values (${ctx.tenant.id}, ${planId}, ${ctx.user.userId}, ${body})`;
}

export function planToCsv(content: PlanContent, locale: 'ar' | 'en'): string {
  const esc = (s: string) => `"${String(s).replace(/"/g, '""').replace(/^[=+\-@]/, "'$&")}"`;
  const rows = [['initiative', 'activity', 'date', 'channel', 'owner', 'status'].join(',')];
  for (const ini of content.initiatives) for (const a of ini.activities) rows.push([esc(ini.title[locale]), esc(a.title[locale]), a.date, a.channel ?? '', a.ownerRole, a.status].join(','));
  return rows.join('\n');
}
