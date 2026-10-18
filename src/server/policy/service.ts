import { z } from 'zod';
import { withSystem, withUser, type Tx } from '../db';
import { AppError, forbidden, notFound } from '../errors';
import { audit } from '../audit';
import { requireRecentStepUp } from '../auth/service';
import { MIN } from '../booking/intervals';
import { notifyTenantRoles, notifyUser } from '../services/notifications';
import type { PlatformContext, TenantContext } from '../tenancy/context';

/**
 * Attendance & payment-eligibility policy (spec §20).
 *  - An incident is a business's report about a REAL booking; it is reviewed,
 *    never auto-applied. No public blacklist exists anywhere.
 *  - Decisions (default / require_deposit / require_full_payment /
 *    manual_approval; suspend_account is platform-only) are made by authorized
 *    humans, carry reasons + customer explanation, expire, and can be appealed.
 *  - Tenant-scope decisions affect only that business. Platform-scope decisions
 *    are created only by LUMA policy reviewers. Rules only SUGGEST reviews.
 *  - Other businesses never see incidents; they only receive computed terms.
 */
const tAct = (c: TenantContext) => ({ actorUserId: c.user.userId, actorKind: c.actorKind, tenantId: c.tenant.id, requestId: c.requestId, ip: c.ip });
const pAct = (p: PlatformContext) => ({ actorUserId: p.user.userId, actorKind: 'platform' as const, requestId: p.requestId, ip: p.ip });

export const INCIDENT_TYPES = ['no_show', 'late_cancellation', 'payment_dispute', 'conduct'] as const;

export const incidentInput = z.object({
  bookingId: z.string().uuid(),
  type: z.enum(INCIDENT_TYPES),
  description: z.string().trim().min(10).max(2000),
  evidence: z
    .array(z.object({ kind: z.enum(['booking_event', 'asset', 'note']), ref: z.string().trim().min(1).max(300) }))
    .max(10)
    .default([]),
  requestPlatformReview: z.boolean().default(false),
});

export async function submitIncident(tx: Tx, ctx: TenantContext, input: z.infer<typeof incidentInput>) {
  if (!ctx.caps.has('incidents.submit')) throw forbidden();
  const [b] = await tx<{ id: string; status: string; startsAt: Date; tenantCustomerId: string; customerUserId: string | null; termsSnapshot: { policy?: { noShowGraceMin?: number } }; cancelSource: string | null }[]>`
    select id, status, starts_at, tenant_customer_id, customer_user_id, terms_snapshot, cancel_source from bookings where id = ${input.bookingId}`;
  if (!b) throw notFound('booking'); // RLS: another tenant's booking is invisible
  const grace = b.termsSnapshot.policy?.noShowGraceMin ?? 15;
  if (input.type === 'no_show' && !(b.status === 'no_show' || (Date.now() >= +b.startsAt + grace * MIN && ['confirmed'].includes(b.status)))) {
    throw new AppError('validation', 'policy.err_no_show_not_eligible');
  }
  if (input.type === 'late_cancellation' && !(b.status === 'cancelled' && b.cancelSource === 'customer')) {
    throw new AppError('validation', 'policy.err_late_cancel_not_eligible');
  }
  // specialists may only report on bookings assigned to them
  if (!ctx.caps.has('bookings.manage') && ctx.caps.has('bookings.view_assigned')) {
    const [own] = await tx`select 1 from booking_items where booking_id = ${b.id} and staff_id = ${ctx.staffProfileId ?? null}::uuid limit 1`;
    if (!own) throw notFound('booking');
  }
  for (const e of input.evidence) {
    if (e.kind === 'asset') {
      if (!z.string().uuid().safeParse(e.ref).success) throw new AppError('validation', 'policy.err_evidence_invalid');
      const [a] = await tx`select 1 from assets where id = ${e.ref} and purpose = 'evidence' and status = 'ready'`;
      if (!a) throw new AppError('validation', 'policy.err_evidence_invalid');
    }
    if (e.kind === 'booking_event') {
      const [ev] = await tx`select 1 from booking_events where id = ${Number(e.ref) || 0} and booking_id = ${b.id}`;
      if (!ev) throw new AppError('validation', 'policy.err_evidence_invalid');
    }
  }
  const [inc] = await tx<{ id: string }[]>`
    insert into customer_incidents (tenant_id, booking_id, tenant_customer_id, customer_user_id, type, description, occurred_at, submitted_by, platform_review_requested)
    values (${ctx.tenant.id}, ${b.id}, ${b.tenantCustomerId}, ${b.customerUserId}, ${input.type}, ${input.description}, ${b.startsAt}, ${ctx.user.userId}, ${input.requestPlatformReview})
    returning id`;
  for (const e of input.evidence) {
    await tx`insert into incident_evidence (tenant_id, incident_id, kind, ref, added_by) values (${ctx.tenant.id}, ${inc.id}, ${e.kind}, ${e.ref}, ${ctx.user.userId})`;
  }
  await audit(tx, { ...tAct(ctx), action: 'incident.submitted', targetType: 'incident', targetId: inc.id, metadata: { type: input.type, bookingId: b.id } });
  return inc;
}

export async function listIncidents(tx: Tx, opts: { status?: string; limit?: number } = {}) {
  return tx`
    select i.id, i.type, i.status, i.occurred_at, i.created_at, i.platform_review_requested, i.description, i.booking_id,
      b.number as booking_number, c.display_name as customer_name, u.display_name as submitted_by_name,
      (select count(*)::int from incident_evidence e where e.incident_id = i.id) as evidence_count
    from customer_incidents i
    join bookings b on b.id = i.booking_id
    join tenant_customers c on c.id = i.tenant_customer_id
    left join users u on u.id = i.submitted_by
    where (${opts.status ?? null}::text is null or i.status = ${opts.status ?? null})
    order by i.created_at desc limit ${Math.min(opts.limit ?? 50, 200)}`;
}

export async function getIncident(tx: Tx, id: string) {
  const [i] = await tx`select i.*, b.number as booking_number, c.display_name as customer_name from customer_incidents i
                      join bookings b on b.id = i.booking_id join tenant_customers c on c.id = i.tenant_customer_id where i.id = ${id}`;
  if (!i) throw notFound('incident');
  const evidence = await tx`select kind, ref, created_at, retain_until from incident_evidence where incident_id = ${id} order by created_at`;
  const reviews = await tx`select r.from_status, r.to_status, r.note, r.reviewer_scope, r.created_at, u.display_name as reviewer
                           from incident_reviews r left join users u on u.id = r.reviewer_user_id where r.incident_id = ${id} order by r.created_at`;
  return { incident: i, evidence, reviews };
}

const REVIEW_FLOW: Record<string, string[]> = {
  submitted: ['under_review', 'confirmed', 'rejected'],
  under_review: ['confirmed', 'rejected'],
  confirmed: ['corrected'],
  rejected: ['corrected'],
  corrected: [],
};

async function moveIncident(tx: Tx, id: string, to: string, note: string, reviewer: string, scope: 'tenant' | 'platform') {
  const [i] = await tx<{ status: string; tenantId: string }[]>`select status, tenant_id from customer_incidents where id = ${id} for update`;
  if (!i) throw notFound('incident');
  if (!(REVIEW_FLOW[i.status] ?? []).includes(to)) throw new AppError('invalid_transition', 'errors.invalid_transition', { from: i.status, to });
  if (note.trim().length < 5) throw new AppError('validation', 'errors.reason_required');
  await tx`update customer_incidents set status = ${to}, updated_at = now() where id = ${id}`;
  await tx`insert into incident_reviews (tenant_id, incident_id, reviewer_user_id, reviewer_scope, from_status, to_status, note)
           values (${i.tenantId}, ${id}, ${reviewer}, ${scope}, ${i.status}, ${to}, ${note})`;
  return { from: i.status, tenantId: i.tenantId };
}

export async function reviewIncident(tx: Tx, ctx: TenantContext, id: string, to: 'under_review' | 'confirmed' | 'rejected' | 'corrected', note: string) {
  if (!ctx.caps.has('incidents.review')) throw forbidden();
  const r = await moveIncident(tx, id, to, note, ctx.user.userId, 'tenant');
  await audit(tx, { ...tAct(ctx), action: `incident.${to}`, targetType: 'incident', targetId: id, reason: note, metadata: { from: r.from } });
}

export async function requestPlatformReview(tx: Tx, ctx: TenantContext, id: string) {
  if (!ctx.caps.has('incidents.submit') && !ctx.caps.has('incidents.review')) throw forbidden();
  const r = await tx`update customer_incidents set platform_review_requested = true, updated_at = now() where id = ${id} and status in ('submitted','under_review','confirmed') returning id`;
  if (!r.length) throw notFound('incident');
  await audit(tx, { ...tAct(ctx), action: 'incident.platform_review_requested', targetType: 'incident', targetId: id });
}

// ─────────────────────────────────────────────────────────────
// Decisions
// ─────────────────────────────────────────────────────────────
export const decisionInput = z
  .object({
    customerUserId: z.string().uuid().optional(),
    tenantCustomerId: z.string().uuid().optional(),
    action: z.enum(['default', 'require_deposit', 'require_full_payment', 'manual_approval']),
    reasonCode: z.string().regex(/^[a-z_]{3,40}$/),
    reasonInternal: z.string().trim().min(10).max(1000),
    customerExplanation: z.string().trim().min(10).max(500),
    evidenceIncidentIds: z.array(z.string().uuid()).max(20).default([]),
    expiresAt: z.string().datetime({ offset: true }),
    reviewAt: z.string().datetime({ offset: true }),
  })
  .refine((d) => d.customerUserId || d.tenantCustomerId, { message: 'errors.required', path: ['tenantCustomerId'] })
  .refine((d) => new Date(d.expiresAt) > new Date() && new Date(d.reviewAt) <= new Date(d.expiresAt), { message: 'policy.err_dates', path: ['expiresAt'] });

async function insertDecision(
  tx: Tx,
  d: { customerUserId: string; scope: 'tenant' | 'platform'; tenantId: string | null; action: string; reasonCode: string; reasonInternal: string; customerExplanation: string; evidence: string[]; reviewer: string; reviewerRole: string; expiresAt: string | null; reviewAt: string | null },
) {
  const prev = await tx<{ id: string }[]>`
    select id from policy_decisions where customer_user_id = ${d.customerUserId} and scope = ${d.scope}
      and tenant_id is not distinct from ${d.tenantId}::uuid and status = 'active' order by effective_at desc limit 1 for update`;
  if (prev[0]) await tx`update policy_decisions set status = 'superseded' where id = ${prev[0].id}`;
  const [row] = await tx<{ id: string }[]>`
    insert into policy_decisions (customer_user_id, scope, tenant_id, action, reason_code, reason_internal, customer_explanation, evidence_refs,
                                  reviewer_user_id, reviewer_role, expires_at, review_at, supersedes_id)
    values (${d.customerUserId}, ${d.scope}, ${d.tenantId}, ${d.action}, ${d.reasonCode}, ${d.reasonInternal}, ${d.customerExplanation}, ${d.evidence},
            ${d.reviewer}, ${d.reviewerRole}, ${d.expiresAt}, ${d.reviewAt}, ${prev[0]?.id ?? null})
    returning id`;
  await notifyUser(tx, d.customerUserId, d.tenantId, { type: 'policy.decision', title: 'policy.notice_decision', targetPath: '/account/appeals', dedupeKey: `decision:${row.id}` });
  return { id: row.id, supersededId: prev[0]?.id ?? null };
}

/** Tenant-scope decision: affects ONLY this business. Step-up required. */
export async function createTenantDecision(tx: Tx, ctx: TenantContext, input: z.infer<typeof decisionInput>) {
  if (!ctx.caps.has('incidents.review')) throw forbidden();
  requireRecentStepUp(ctx.user);
  let userId = input.customerUserId ?? null;
  if (input.tenantCustomerId) {
    const [c] = await tx<{ userId: string | null }[]>`select user_id from tenant_customers where id = ${input.tenantCustomerId}`;
    if (!c) throw notFound('customer');
    userId = c.userId;
  } else if (userId) {
    // the customer must have a relationship with THIS tenant (no enumeration of LUMA accounts)
    const [c] = await tx`select 1 from tenant_customers where user_id = ${userId}`;
    if (!c) throw notFound('customer');
  }
  if (!userId) throw new AppError('validation', 'policy.err_customer_without_account');
  for (const iid of input.evidenceIncidentIds) {
    const [i] = await tx`select 1 from customer_incidents where id = ${iid} and customer_user_id = ${userId} and status = 'confirmed'`;
    if (!i) throw new AppError('validation', 'policy.err_evidence_invalid');
  }
  const r = await insertDecision(tx, {
    customerUserId: userId,
    scope: 'tenant',
    tenantId: ctx.tenant.id,
    action: input.action,
    reasonCode: input.reasonCode,
    reasonInternal: input.reasonInternal,
    customerExplanation: input.customerExplanation,
    evidence: input.evidenceIncidentIds,
    reviewer: ctx.user.userId,
    reviewerRole: ctx.role ?? 'support',
    expiresAt: input.expiresAt,
    reviewAt: input.reviewAt,
  });
  await audit(tx, { ...tAct(ctx), action: 'policy.tenant_decision', targetType: 'policy_decision', targetId: r.id, reason: input.reasonInternal, metadata: { action: input.action } });
  return r;
}

export async function listTenantDecisions(tx: Tx, ctx: TenantContext) {
  return tx`
    select d.id, d.action, d.reason_code, d.reason_internal, d.customer_explanation, d.status, d.effective_at, d.expires_at, d.review_at,
      c.display_name as customer_name, c.id as tenant_customer_id,
      (select status from appeals a where a.decision_id = d.id order by created_at desc limit 1) as appeal_status
    from policy_decisions d
    join tenant_customers c on c.user_id = d.customer_user_id and c.tenant_id = ${ctx.tenant.id}
    where d.scope = 'tenant' and d.tenant_id = ${ctx.tenant.id}
    order by d.created_at desc limit 200`;
}

// ── platform scope ──
export const platformDecisionInput = z.object({
  customerUserId: z.string().uuid(),
  action: z.enum(['default', 'require_deposit', 'require_full_payment', 'manual_approval', 'suspend_account']),
  reasonCode: z.string().regex(/^[a-z_]{3,40}$/),
  reasonInternal: z.string().trim().min(10).max(1000),
  customerExplanation: z.string().trim().min(10).max(500),
  evidenceIncidentIds: z.array(z.string().uuid()).min(1).max(50),
  expiresAt: z.string().datetime({ offset: true }),
  reviewAt: z.string().datetime({ offset: true }),
});

export async function createPlatformDecision(p: PlatformContext, input: z.infer<typeof platformDecisionInput>) {
  if (!p.caps.has('platform.policy.review')) throw forbidden();
  if (input.action === 'suspend_account' && !p.caps.has('platform.policy.suspend')) throw forbidden();
  requireRecentStepUp(p.user);
  if (new Date(input.expiresAt) <= new Date() || new Date(input.reviewAt) > new Date(input.expiresAt)) throw new AppError('validation', 'policy.err_dates');
  return withSystem('platform policy decision', async (tx) => {
    const ev = await tx<{ id: string }[]>`select id from customer_incidents where id = any(${input.evidenceIncidentIds}::uuid[]) and customer_user_id = ${input.customerUserId} and status = 'confirmed'`;
    if (ev.length !== input.evidenceIncidentIds.length) throw new AppError('validation', 'policy.err_evidence_invalid');
    const r = await insertDecision(tx, {
      customerUserId: input.customerUserId,
      scope: 'platform',
      tenantId: null,
      action: input.action,
      reasonCode: input.reasonCode,
      reasonInternal: input.reasonInternal,
      customerExplanation: input.customerExplanation,
      evidence: input.evidenceIncidentIds,
      reviewer: p.user.userId,
      reviewerRole: p.role,
      expiresAt: input.expiresAt,
      reviewAt: input.reviewAt,
    });
    await audit(tx, { ...pAct(p), action: 'policy.platform_decision', targetType: 'policy_decision', targetId: r.id, reason: input.reasonInternal, metadata: { action: input.action, evidence: input.evidenceIncidentIds.length } });
    return r;
  });
}

export async function platformReviewQueue(p: PlatformContext) {
  if (!p.caps.has('platform.policy.review')) throw forbidden();
  return withSystem('policy review queue', (tx) => tx`
    select i.id, i.type, i.status, i.occurred_at, i.created_at, i.description, i.customer_user_id, t.name as tenant_name,
      (select count(*)::int from customer_incidents x where x.customer_user_id = i.customer_user_id and x.status = 'confirmed') as confirmed_total,
      (select count(distinct x.tenant_id)::int from customer_incidents x where x.customer_user_id = i.customer_user_id and x.status = 'confirmed') as distinct_tenants
    from customer_incidents i join tenants t on t.id = i.tenant_id
    where i.platform_review_requested and i.status in ('submitted','under_review','confirmed')
    order by i.created_at limit 200`);
}

export async function platformReviewIncident(p: PlatformContext, id: string, to: 'under_review' | 'confirmed' | 'rejected' | 'corrected', note: string) {
  if (!p.caps.has('platform.policy.review')) throw forbidden();
  return withSystem('platform incident review', async (tx) => {
    const r = await moveIncident(tx, id, to, note, p.user.userId, 'platform');
    await audit(tx, { ...pAct(p), tenantId: r.tenantId, action: `incident.platform_${to}`, targetType: 'incident', targetId: id, reason: note });
  });
}

// ── rules: configurable, only SUGGEST ──
export const ruleInput = z.object({
  name: z.string().trim().min(3).max(120),
  incidentType: z.enum(INCIDENT_TYPES),
  minConfirmedIncidents: z.number().int().min(1).max(100),
  windowDays: z.number().int().min(1).max(730),
  minDistinctTenants: z.number().int().min(1).max(50).default(1),
  suggestedAction: z.enum(['require_deposit', 'require_full_payment', 'manual_approval']),
  isExperimental: z.boolean().default(true),
  enabled: z.boolean().default(false),
});

export async function listRules(p: PlatformContext) {
  if (!p.caps.has('platform.policy.review')) throw forbidden();
  return withSystem('rules', (tx) => tx`select * from policy_rules where scope = 'platform' order by created_at`);
}

export async function upsertRule(p: PlatformContext, input: z.infer<typeof ruleInput>, id?: string) {
  if (!p.caps.has('platform.policy.review')) throw forbidden();
  return withSystem('rule upsert', async (tx) => {
    let rid = id;
    if (rid) {
      const r = await tx`update policy_rules set name = ${input.name}, incident_type = ${input.incidentType}, min_confirmed_incidents = ${input.minConfirmedIncidents},
        window_days = ${input.windowDays}, min_distinct_tenants = ${input.minDistinctTenants}, suggested_action = ${input.suggestedAction},
        is_experimental = ${input.isExperimental}, enabled = ${input.enabled} where id = ${rid} and scope = 'platform' returning id`;
      if (!r.length) throw notFound('rule');
    } else {
      const [r] = await tx<{ id: string }[]>`insert into policy_rules (tenant_id, scope, name, incident_type, min_confirmed_incidents, window_days, min_distinct_tenants, suggested_action, is_experimental, enabled, created_by)
        values (null, 'platform', ${input.name}, ${input.incidentType}, ${input.minConfirmedIncidents}, ${input.windowDays}, ${input.minDistinctTenants}, ${input.suggestedAction}, ${input.isExperimental}, ${input.enabled}, ${p.user.userId}) returning id`;
      rid = r.id;
    }
    await audit(tx, { ...pAct(p), action: 'policy.rule_saved', targetType: 'policy_rule', targetId: rid, metadata: input });
    return { id: rid };
  });
}

/**
 * Evaluate enabled rules for one customer. Returns SUGGESTIONS for a human
 * reviewer; it never creates or changes a decision.
 */
export async function suggestForCustomer(tx: Tx, customerUserId: string) {
  const rules = await tx<{ id: string; name: string; incidentType: string; minConfirmedIncidents: number; windowDays: number; minDistinctTenants: number; suggestedAction: string; isExperimental: boolean }[]>`
    select * from policy_rules where scope = 'platform' and enabled`;
  const out: { ruleId: string; name: string; suggestedAction: string; experimental: boolean; confirmed: number; tenants: number }[] = [];
  for (const r of rules) {
    const [c] = await tx<{ n: number; t: number }[]>`
      select count(*)::int as n, count(distinct tenant_id)::int as t from customer_incidents
      where customer_user_id = ${customerUserId} and type = ${r.incidentType} and status = 'confirmed'
        and occurred_at > now() - make_interval(days => ${r.windowDays})`;
    if (c.n >= r.minConfirmedIncidents && c.t >= r.minDistinctTenants) {
      out.push({ ruleId: r.id, name: r.name, suggestedAction: r.suggestedAction, experimental: r.isExperimental, confirmed: c.n, tenants: c.t });
    }
  }
  return out;
}

export async function platformSuggestions(p: PlatformContext, customerUserId: string) {
  if (!p.caps.has('platform.policy.review')) throw forbidden();
  return withSystem('rule suggestions', (tx) => suggestForCustomer(tx, customerUserId));
}

/** Job: expire decisions past expires_at; flag those due for review. */
export async function expireDecisions(tx: Tx) {
  const expired = await tx<{ id: string; customerUserId: string; tenantId: string | null }[]>`
    update policy_decisions set status = 'expired' where status = 'active' and expires_at is not null and expires_at <= now()
    returning id, customer_user_id, tenant_id`;
  for (const d of expired) {
    await audit(tx, { actorKind: 'system', tenantId: d.tenantId, action: 'policy.decision_expired', targetType: 'policy_decision', targetId: d.id });
    await notifyUser(tx, d.customerUserId, d.tenantId, { type: 'policy.decision_expired', title: 'policy.notice_decision_expired', targetPath: '/account/appeals', dedupeKey: `decision-exp:${d.id}` });
  }
  const due = await tx<{ id: string; tenantId: string | null }[]>`
    select id, tenant_id from policy_decisions where status = 'active' and review_at is not null and review_at <= now()`;
  for (const d of due) {
    if (d.tenantId) {
      await notifyTenantRoles(tx, d.tenantId, ['owner', 'manager'], { type: 'policy.review_due', title: 'policy.notice_review_due', targetPath: `/app/_/incidents?tab=decisions`, dedupeKey: `review-due:${d.id}` });
    }
  }
  return { expired: expired.length, reviewDue: due.length };
}

// ─────────────────────────────────────────────────────────────
// Customer view & appeals
// ─────────────────────────────────────────────────────────────
/** What the customer sees: explanations, scope, expiry; incidents about her without internal notes. */
export async function customerPolicyView(userId: string) {
  const decisions = await withSystem('customer own decisions', (tx) => tx`
    select d.id, d.scope, d.action, d.customer_explanation, d.effective_at, d.expires_at, d.status, t.name as tenant_name,
      (select json_build_object('id', a.id, 'status', a.status, 'resolutionNote', a.resolution_note, 'createdAt', a.created_at)
         from appeals a where a.decision_id = d.id order by a.created_at desc limit 1) as appeal
    from policy_decisions d left join tenants t on t.id = d.tenant_id
    where d.customer_user_id = ${userId} and d.status in ('active','revoked','expired') and d.action <> 'default'
    order by d.created_at desc limit 50`);
  const incidents = await withUser(userId, (tx) => tx`
    select i.id, i.type, i.occurred_at, i.status, t.name as tenant_name,
      (select json_build_object('id', a.id, 'status', a.status, 'resolutionNote', a.resolution_note) from appeals a where a.incident_id = i.id and a.customer_user_id = ${userId} order by a.created_at desc limit 1) as appeal
    from customer_incidents i join tenants t on t.id = i.tenant_id
    where i.customer_user_id = ${userId} order by i.occurred_at desc limit 50`);
  return { decisions, incidents };
}

export const appealInput = z
  .object({
    decisionId: z.string().uuid().optional(),
    incidentId: z.string().uuid().optional(),
    statement: z.string().trim().min(10).max(2000),
  })
  .refine((a) => !!a.decisionId !== !!a.incidentId, { message: 'errors.validation', path: ['decisionId'] });

export async function submitAppeal(userId: string, input: z.infer<typeof appealInput>) {
  return withSystem('customer appeal', async (tx) => {
    let tenantId: string | null = null;
    if (input.decisionId) {
      const [d] = await tx<{ tenantId: string | null; status: string }[]>`select tenant_id, status from policy_decisions where id = ${input.decisionId} and customer_user_id = ${userId}`;
      if (!d) throw notFound('decision');
      if (d.status !== 'active') throw new AppError('invalid_transition', 'policy.err_decision_not_active');
      tenantId = d.tenantId;
    } else {
      const [i] = await tx<{ tenantId: string }[]>`select tenant_id from customer_incidents where id = ${input.incidentId!} and customer_user_id = ${userId}`;
      if (!i) throw notFound('incident');
      tenantId = i.tenantId;
      const [open] = await tx`select 1 from appeals where incident_id = ${input.incidentId!} and status in ('submitted','under_review')`;
      if (open) throw new AppError('conflict', 'policy.err_appeal_open');
    }
    const [a] = await tx<{ id: string }[]>`insert into appeals (customer_user_id, decision_id, incident_id, tenant_id, statement)
      values (${userId}, ${input.decisionId ?? null}, ${input.incidentId ?? null}, ${tenantId}, ${input.statement}) returning id`;
    await audit(tx, { actorUserId: userId, actorKind: 'customer', tenantId, action: 'appeal.submitted', targetType: 'appeal', targetId: a.id });
    if (tenantId) await notifyTenantRoles(tx, tenantId, ['owner', 'manager'], { type: 'appeal.submitted', title: 'policy.notice_appeal', targetPath: `/app/_/incidents?tab=appeals`, dedupeKey: `appeal:${a.id}` });
    return a;
  });
}

interface AppealRow {
  id: string;
  customerUserId: string;
  decisionId: string | null;
  incidentId: string | null;
  tenantId: string | null;
  status: string;
  decisionScope: string | null;
  evidenceRefs: string[] | null;
}

async function loadAppeal(tx: Tx, id: string): Promise<AppealRow> {
  const [a] = await tx<AppealRow[]>`
    select a.id, a.customer_user_id, a.decision_id, a.incident_id, a.tenant_id, a.status, d.scope as decision_scope, d.evidence_refs
    from appeals a left join policy_decisions d on d.id = a.decision_id where a.id = ${id} for update of a`;
  if (!a) throw notFound('appeal');
  return a;
}

async function resolve(tx: Tx, a: AppealRow, outcome: 'upheld' | 'overturned', note: string, reviewer: string, scope: 'tenant' | 'platform') {
  if (!['submitted', 'under_review'].includes(a.status)) throw new AppError('invalid_transition', 'errors.invalid_transition');
  if (note.trim().length < 5) throw new AppError('validation', 'errors.reason_required');
  await tx`update appeals set status = ${outcome}, resolution_note = ${note}, resolved_by = ${reviewer}, resolved_at = now() where id = ${a.id}`;
  if (outcome === 'overturned') {
    if (a.decisionId) await tx`update policy_decisions set status = 'revoked' where id = ${a.decisionId} and status = 'active'`;
    const incidentIds = [...(a.evidenceRefs ?? []), ...(a.incidentId ? [a.incidentId] : [])];
    for (const iid of incidentIds) {
      const [i] = await tx<{ status: string; tenantId: string }[]>`select status, tenant_id from customer_incidents where id = ${iid} for update`;
      if (i && (i.status === 'confirmed' || i.status === 'rejected' || i.status === 'submitted' || i.status === 'under_review')) {
        await tx`update customer_incidents set status = 'corrected', updated_at = now() where id = ${iid}`;
        await tx`insert into incident_reviews (tenant_id, incident_id, reviewer_user_id, reviewer_scope, from_status, to_status, note)
                 values (${i.tenantId}, ${iid}, ${reviewer}, ${scope}, ${i.status}, 'corrected', ${`appeal overturned: ${note}`})`;
      }
    }
  }
  await notifyUser(tx, a.customerUserId, a.tenantId, { type: `appeal.${outcome}`, title: `policy.notice_appeal_${outcome}`, targetPath: '/account/appeals', dedupeKey: `appeal-res:${a.id}` });
}

/** Tenant reviewer resolves appeals about its own tenant-scope decisions / incidents. */
export async function resolveAppealAsTenant(ctx: TenantContext, appealId: string, outcome: 'upheld' | 'overturned', note: string) {
  if (!ctx.caps.has('incidents.review')) throw forbidden();
  return withSystem('tenant appeal resolution (scope checked)', async (tx) => {
    const a = await loadAppeal(tx, appealId);
    if (a.tenantId !== ctx.tenant.id || a.decisionScope === 'platform') throw notFound('appeal');
    await resolve(tx, a, outcome, note, ctx.user.userId, 'tenant');
    await audit(tx, { ...tAct(ctx), action: `appeal.${outcome}`, targetType: 'appeal', targetId: appealId, reason: note });
  });
}

export async function resolveAppealAsPlatform(p: PlatformContext, appealId: string, outcome: 'upheld' | 'overturned', note: string) {
  if (!p.caps.has('platform.policy.review')) throw forbidden();
  return withSystem('platform appeal resolution', async (tx) => {
    const a = await loadAppeal(tx, appealId);
    if (a.decisionScope !== 'platform') throw notFound('appeal');
    await resolve(tx, a, outcome, note, p.user.userId, 'platform');
    await audit(tx, { ...pAct(p), action: `appeal.${outcome}`, targetType: 'appeal', targetId: appealId, reason: note });
  });
}

export async function listTenantAppeals(ctx: TenantContext) {
  return withSystem('tenant appeals list (tenant filter)', (tx) => tx`
    select a.id, a.status, a.statement, a.created_at, a.resolution_note, a.decision_id, a.incident_id,
      d.action as decision_action, i.type as incident_type, c.display_name as customer_name
    from appeals a
    left join policy_decisions d on d.id = a.decision_id
    left join customer_incidents i on i.id = a.incident_id
    left join tenant_customers c on c.tenant_id = ${ctx.tenant.id} and c.user_id = a.customer_user_id
    where a.tenant_id = ${ctx.tenant.id} and (d.id is null or d.scope = 'tenant')
    order by a.created_at desc limit 200`);
}

export async function listPlatformAppeals(p: PlatformContext) {
  if (!p.caps.has('platform.policy.review')) throw forbidden();
  return withSystem('platform appeals', (tx) => tx`
    select a.id, a.status, a.statement, a.created_at, a.resolution_note, a.decision_id, d.action as decision_action, d.reason_internal
    from appeals a join policy_decisions d on d.id = a.decision_id where d.scope = 'platform' order by a.created_at desc limit 200`);
}

export async function listPlatformDecisions(p: PlatformContext) {
  if (!p.caps.has('platform.policy.review')) throw forbidden();
  return withSystem('platform decisions', (tx) => tx`
    select d.id, d.customer_user_id, d.action, d.reason_code, d.status, d.effective_at, d.expires_at, d.review_at, d.is_experimental, u.display_name as reviewer
    from policy_decisions d left join users u on u.id = d.reviewer_user_id where d.scope = 'platform' order by d.created_at desc limit 200`);
}
