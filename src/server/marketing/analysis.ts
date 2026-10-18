import type { Tx } from '../db';
import { withSystem, withTenant } from '../db';
import { enqueueJob, registerJob } from '../jobs';
import { addDays, utcToWall, weekdayOf } from '@/lib/tz';
import { getProvider } from '../ai/provider';
import { generateAndSaveRecommendations } from './pipeline';
import { assemblePlan, createPlanRecord, refinePlanWithAi } from './plans';
import type { Loc } from './recommendations';

/**
 * Weekly/monthly analysis. Periods are computed in the business timezone;
 * jobs are idempotent by tenant/horizon/period (job key). A failed analysis
 * never touches previous plans. Without AI the plan is assembled by rules and
 * labeled as an Example (rules-based) — never presented as AI output.
 */
export type Horizon = 'weekly' | 'monthly';

export function planPeriodFor(horizon: Horizon, tz: string, now = new Date()) {
  const today = utcToWall(now, tz).date;
  if (horizon === 'weekly') {
    // next Sunday (Saudi work week starts Sunday)
    const wd = weekdayOf(today);
    const from = addDays(today, wd === 0 ? 7 : 7 - wd);
    return { from, to: addDays(from, 6), days: 7, key: from };
  }
  const [y, m] = today.split('-').map(Number);
  const nm = m === 12 ? [y + 1, 1] : [y, m + 1];
  const from = `${nm[0]}-${String(nm[1]).padStart(2, '0')}-01`;
  const next = nm[1] === 12 ? `${nm[0] + 1}-01-01` : `${nm[0]}-${String(nm[1] + 1).padStart(2, '0')}-01`;
  const days = Math.round((Date.parse(next) - Date.parse(from)) / 86400000);
  return { from, to: addDays(from, days - 1), days, key: from.slice(0, 7) };
}

export const jobKey = (tenantId: string, horizon: Horizon, periodKey: string) => `marketing.${horizon}:${tenantId}:${periodKey}`;

export async function runAnalysis(tx: Tx, o: { tenantId: string; userId: string | null; horizon: Horizon; jobId?: string | null; parentPlanId?: string | null; now?: Date }) {
  const [t] = await tx<{ timezone: string; name: string }[]>`select timezone, name from tenants where id = ${o.tenantId}`;
  const period = planPeriodFor(o.horizon, t.timezone, o.now);
  const today = utcToWall(o.now ?? new Date(), t.timezone).date;
  const dataDays = o.horizon === 'weekly' ? 28 : 90;
  const aiAvailable = !!getProvider();
  const pipe = await generateAndSaveRecommendations(tx, {
    tenantId: o.tenantId,
    userId: o.userId,
    jobId: o.jobId,
    horizon: o.horizon,
    fromDate: addDays(today, -dataDays),
    days: dataDays,
    planPeriod: { from: period.from, to: period.to },
    useAi: aiAvailable,
  });
  let parentGoal: Loc | null = null;
  let parentId = o.parentPlanId ?? null;
  if (o.horizon === 'weekly') {
    const [parent] = parentId
      ? await tx<{ id: string; content: { goal: Loc } }[]>`select p.id, v.content from marketing_plans p join plan_versions v on v.plan_id = p.id and v.number = p.current_version where p.id = ${parentId}`
      : await tx<{ id: string; content: { goal: Loc } }[]>`
          select p.id, v.content from marketing_plans p join plan_versions v on v.plan_id = p.id and v.number = p.current_version
          where p.horizon = 'monthly' and p.status in ('approved','in_progress') and p.period_start <= ${period.from} and p.period_end >= ${period.from}
          order by p.created_at desc limit 1`;
    if (parent) {
      parentGoal = parent.content.goal;
      parentId = parent.id;
    } else parentId = null;
  }
  const recRows = pipe.savedIds.length
    ? await tx<{ id: string; content: Parameters<typeof assemblePlan>[1][number] }[]>`select id, content from recommendations where id = any(${pipe.savedIds}::uuid[]) order by created_at`
    : [];
  let content = assemblePlan(pipe.snapshot, recRows.map((r) => ({ ...r.content, id: r.id })), o.horizon, {
    planPeriod: period,
    parentGoal,
    isExample: !aiAvailable,
    insufficientData: pipe.generation.insufficientData,
    limitations: pipe.generation.limitations,
  });
  let aiRunId: string | null = null;
  let aiFailure = pipe.ai.failure;
  if (aiAvailable && !pipe.generation.insufficientData) {
    const r = await refinePlanWithAi(tx, o.tenantId, o.userId, pipe.snapshot, content, o.horizon, period);
    content = r.plan;
    aiRunId = r.runId;
    aiFailure = aiFailure ?? r.failure;
    if (r.failure) content = { ...content, isExample: true, provenance: { ...content.provenance, source_type: 'example' } };
  }
  const label = o.horizon === 'weekly' ? `أسبوع ${period.from}` : `شهر ${period.key}`;
  const planId = await createPlanRecord(tx, o.tenantId, o.userId, {
    horizon: o.horizon,
    periodStart: period.from,
    periodEnd: period.to,
    parentPlanId: parentId,
    title: content.isExample ? `${label} — مثال توضيحي` : label,
    content,
    source: content.isExample ? 'example' : 'ai',
    aiRunId,
  });
  return { planId, recommendations: pipe.savedIds.length, insufficientData: pipe.generation.insufficientData, ai: { available: aiAvailable, failure: aiFailure, flagged: pipe.ai.flagged } };
}

registerJob('marketing.analysis', async (job, tx) => {
  const horizon = job.payload.horizon as Horizon;
  const r = await runAnalysis(tx, { tenantId: job.tenantId!, userId: job.createdBy, horizon, jobId: job.id, parentPlanId: (job.payload.parentPlanId as string) ?? null });
  return r as unknown as Record<string, unknown>;
});

/** Enqueue an analysis (idempotent per tenant/horizon/period). */
export async function requestAnalysis(tx: Tx, tenantId: string, userId: string | null, horizon: Horizon, opts: { force?: boolean; parentPlanId?: string | null } = {}) {
  const [t] = await tx<{ timezone: string }[]>`select timezone from tenants where id = ${tenantId}`;
  const p = planPeriodFor(horizon, t.timezone);
  const key = opts.force ? `${jobKey(tenantId, horizon, p.key)}:manual:${Date.now()}` : jobKey(tenantId, horizon, p.key);
  return enqueueJob(tx, { kind: 'marketing.analysis', tenantId, key, payload: { horizon, parentPlanId: opts.parentPlanId ?? null }, createdBy: userId, maxAttempts: 2 });
}

/** Scheduler tick (worker): enqueue due weekly/monthly analyses for tenants that enabled them. */
export async function scheduleDueAnalyses(now = new Date()) {
  const rows = await withSystem('marketing scheduler: list opted-in tenants', (tx) => tx<{ tenantId: string; weeklyEnabled: boolean; monthlyEnabled: boolean; weeklyRunWeekday: number; timezone: string }[]>`
    select m.tenant_id, m.weekly_enabled, m.monthly_enabled, m.weekly_run_weekday, t.timezone
    from marketing_preferences m join tenants t on t.id = m.tenant_id where (m.weekly_enabled or m.monthly_enabled) and t.status = 'active'`);
  let n = 0;
  for (const r of rows) {
    const today = utcToWall(now, r.timezone).date;
    await withTenant({ tenantId: r.tenantId }, async (tx) => {
      if (r.weeklyEnabled && weekdayOf(today) === r.weeklyRunWeekday) n += (await requestAnalysis(tx, r.tenantId, null, 'weekly')).created ? 1 : 0;
      if (r.monthlyEnabled && Number(today.slice(8, 10)) >= 20) n += (await requestAnalysis(tx, r.tenantId, null, 'monthly')).created ? 1 : 0;
    });
  }
  return n;
}

/** Run a queued job right now inside the request (review environments without a worker). */
export async function runJobInline(tenantId: string, jobId: string, userId: string | null) {
  const claimed = await withTenant({ tenantId, userId }, (tx) => tx<{ id: string; payload: { horizon: Horizon; parentPlanId: string | null } }[]>`
    update job_runs set status = 'running', locked_at = now(), locked_by = 'inline', attempts = attempts + 1
    where id = ${jobId} and status = 'queued' returning id, payload`);
  if (!claimed[0]) return null;
  try {
    const result = await withTenant({ tenantId, userId }, (tx) => runAnalysis(tx, { tenantId, userId, horizon: claimed[0].payload.horizon, jobId, parentPlanId: claimed[0].payload.parentPlanId }));
    await withTenant({ tenantId, userId }, (tx) => tx`update job_runs set status = 'succeeded', finished_at = now(), result = ${tx.json(result as never)}, updated_at = now() where id = ${jobId}`);
    return result;
  } catch (e) {
    await withTenant({ tenantId, userId }, (tx) => tx`update job_runs set status = 'failed', finished_at = now(), error = ${String((e as Error).message).slice(0, 500)}, updated_at = now() where id = ${jobId}`);
    throw e;
  }
}

/**
 * Regenerate an existing plan: appends a NEW version (never mutates prior
 * versions). For approved/in-progress plans the version stays a proposal
 * until adopted by someone with campaign.approve.
 */
export async function regeneratePlan(tx: Tx, ctx: import('../tenancy/context').TenantContext, planId: string) {
  const { getPlan, addPlanVersion } = await import('./plans');
  const { plan, current } = await getPlan(tx, planId);
  const horizon = plan.horizon as Horizon;
  const [t] = await tx<{ timezone: string }[]>`select timezone from tenants where id = ${ctx.tenant.id}`;
  const today = utcToWall(new Date(), t.timezone).date;
  const dataDays = horizon === 'weekly' ? 28 : 90;
  const days = Math.round((Date.parse(plan.periodEnd) - Date.parse(plan.periodStart)) / 86400000) + 1;
  const period = { from: plan.periodStart, to: plan.periodEnd, days };
  const aiAvailable = !!getProvider();
  const pipe = await generateAndSaveRecommendations(tx, { tenantId: ctx.tenant.id, userId: ctx.user.userId, horizon, fromDate: addDays(today, -dataDays), days: dataDays, planPeriod: period, useAi: aiAvailable });
  const recRows = pipe.savedIds.length ? await tx<{ id: string; content: Parameters<typeof assemblePlan>[1][number] }[]>`select id, content from recommendations where id = any(${pipe.savedIds}::uuid[])` : [];
  let content = assemblePlan(pipe.snapshot, recRows.map((r) => ({ ...r.content, id: r.id })), horizon, { planPeriod: period, parentGoal: current.content.parentGoal, isExample: !aiAvailable, insufficientData: pipe.generation.insufficientData, limitations: pipe.generation.limitations });
  let runId: string | null = null;
  if (aiAvailable && !pipe.generation.insufficientData) {
    const r = await refinePlanWithAi(tx, ctx.tenant.id, ctx.user.userId, pipe.snapshot, content, horizon, period);
    content = r.failure ? { ...r.plan, isExample: true, provenance: { ...r.plan.provenance, source_type: 'example' } } : r.plan;
    runId = r.runId;
  }
  return addPlanVersion(tx, ctx, planId, content, 'regenerated', runId);
}
