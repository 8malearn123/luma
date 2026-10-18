import { z } from 'zod';
import { sql, withSystem, type Tx } from '../db';
import { AppError, forbidden, notFound } from '../errors';
import { audit } from '../audit';
import { requireRecentStepUp } from '../auth/service';
import { env, isProduction } from '../env';
import { messagingStatus } from '../messaging';
import type { PlatformContext } from '../tenancy/context';
import { FEATURE_KEYS } from '../tenancy/plan';
import { documentSchema } from '@/lib/builder/schema';

/**
 * LUMA platform administration. Cross-tenant reads/writes here run in the
 * system scope ONLY after the caller's platform capability has been checked
 * (api.platform / requirePlatform). Every mutation is audited with the actor.
 */
const act = (p: PlatformContext) => ({ actorUserId: p.user.userId, actorKind: 'platform' as const, requestId: p.requestId, ip: p.ip });
const sys = <T>(reason: string, fn: (tx: Tx) => Promise<T>) => withSystem(`platform: ${reason}`, fn);
const need = (p: PlatformContext, cap: Parameters<PlatformContext['caps']['has']>[0]) => {
  if (!p.caps.has(cap)) throw forbidden();
};

// ─────────────────────────────────────────────────────────────
// Tenants
// ─────────────────────────────────────────────────────────────
export const tenantListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['onboarding', 'active', 'suspended', 'archived']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

export async function listTenants(p: PlatformContext, q: z.infer<typeof tenantListQuery>) {
  need(p, 'platform.tenants.view');
  const like = q.q ? `%${q.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%` : null;
  return sys('tenant list', async (tx) => {
    const rows = await tx`
      select t.id, t.slug, t.name, t.business_type, t.city, t.status, t.is_demo, t.created_at, t.published_version_id is not null as published,
        s.status as subscription_status, s.trial_ends_at, s.overage_state, pl.code as plan_code, pl.name_en as plan_name,
        (select u.display_name from tenant_memberships m join users u on u.id = m.user_id where m.tenant_id = t.id and m.role = 'owner' and m.status = 'active') as owner_name
      from tenants t
      left join lateral (select * from subscriptions s where s.tenant_id = t.id order by s.created_at desc limit 1) s on true
      left join plans pl on pl.id = s.plan_id
      where (${q.status ?? null}::text is null or t.status = ${q.status ?? null})
        and (${like}::text is null or t.name ilike ${like} or t.slug::text ilike ${like} or t.city ilike ${like})
      order by t.created_at desc limit ${q.limit + 1} offset ${q.offset}`;
    const [{ total }] = await tx<{ total: number }[]>`select count(*)::int as total from tenants`;
    return { items: rows.slice(0, q.limit), hasMore: rows.length > q.limit, total };
  });
}

export async function tenantDetail(p: PlatformContext, tenantId: string) {
  need(p, 'platform.tenants.view');
  return sys('tenant detail', async (tx) => {
    const [t] = await tx`select id, slug, name, business_type, city, status, timezone, is_demo, created_at, published_version_id from tenants where id = ${tenantId}`;
    if (!t) throw notFound('tenant');
    const subscriptions = await tx`select s.*, pl.code as plan_code from subscriptions s join plans pl on pl.id = s.plan_id where s.tenant_id = ${tenantId} order by s.created_at desc`;
    const events = await tx`select type, from_status, to_status, data, created_at from subscription_events where tenant_id = ${tenantId} order by created_at desc limit 30`;
    const [usage] = await tx`
      select (select count(*)::int from branches where tenant_id = ${tenantId} and status = 'active') as branches,
             (select count(*)::int from staff_profiles where tenant_id = ${tenantId} and status = 'active') as staff,
             (select count(*)::int from services where tenant_id = ${tenantId} and status <> 'archived') as services,
             (select count(*)::int from tenant_memberships where tenant_id = ${tenantId} and status = 'active') as members,
             (select count(*)::int from bookings where tenant_id = ${tenantId}) as bookings`;
    const live = subscriptions.find((s) => ['trialing', 'active', 'past_due', 'paused'].includes(String(s.status)));
    const limits = live ? await tx`select feature_key, enabled, limit_value from plan_features where plan_id = ${live.planId as string} order by feature_key` : [];
    const grants = await tx`select g.id, g.reason, g.access_level, g.starts_at, g.expires_at, g.revoked_at, u.display_name as platform_user
                            from support_access_grants g join users u on u.id = g.platform_user_id where g.tenant_id = ${tenantId} order by g.created_at desc limit 20`;
    return { tenant: t, subscriptions, events, usage, limits, grants };
  });
}

export const statusChangeInput = z.object({ status: z.enum(['active', 'suspended']), reason: z.string().trim().min(10).max(500) });

export async function setTenantStatus(p: PlatformContext, tenantId: string, input: z.infer<typeof statusChangeInput>) {
  need(p, 'platform.tenants.manage');
  requireRecentStepUp(p.user);
  return sys('tenant status', async (tx) => {
    const [t] = await tx<{ status: string }[]>`select status from tenants where id = ${tenantId} for update`;
    if (!t) throw notFound('tenant');
    if (t.status === 'archived') throw new AppError('invalid_transition', 'errors.invalid_transition');
    await tx`update tenants set status = ${input.status} where id = ${tenantId}`;
    await audit(tx, { ...act(p), tenantId, action: `platform.tenant_${input.status}`, targetType: 'tenant', targetId: tenantId, reason: input.reason, metadata: { from: t.status } });
    return { status: input.status };
  });
}

// ─────────────────────────────────────────────────────────────
// Plans & features
// ─────────────────────────────────────────────────────────────
export const planInput = z.object({
  code: z.string().regex(/^[a-z0-9_]{2,30}$/),
  nameAr: z.string().trim().min(1).max(60),
  nameEn: z.string().trim().min(1).max(60),
  priceMonthlyMinor: z.number().int().min(0).max(100_000_000).nullable(),
  priceYearlyMinor: z.number().int().min(0).max(1_000_000_000).nullable(),
  priceIsTest: z.boolean(),
  trialDays: z.number().int().min(0).max(90).default(14),
  graceDays: z.number().int().min(0).max(60).default(7),
  poweredByRequired: z.boolean().default(true),
  status: z.enum(['draft', 'active', 'archived']).default('active'),
  sort: z.number().int().min(0).max(100).default(0),
  features: z.array(z.object({ key: z.enum(FEATURE_KEYS), enabled: z.boolean(), limit: z.number().int().min(0).max(100000).nullable() })).max(FEATURE_KEYS.length),
});

export interface PlanRow {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  priceMonthlyMinor: number | null;
  priceYearlyMinor: number | null;
  priceIsTest: boolean;
  currency: string;
  trialDays: number;
  graceDays: number;
  poweredByRequired: boolean;
  status: string;
  sort: number;
}

export async function listPlans(includeInactive = false) {
  const plans = await sql()<PlanRow[]>`select * from plans where ${includeInactive} or status = 'active' order by sort, created_at`;
  const feats = await sql()<{ planId: string; featureKey: string; enabled: boolean; limitValue: number | null }[]>`select plan_id, feature_key, enabled, limit_value from plan_features`;
  return plans.map((pl) => ({ ...pl, features: feats.filter((f) => f.planId === pl.id) }));
}

export async function upsertPlan(p: PlatformContext, input: z.infer<typeof planInput>, id?: string) {
  need(p, 'platform.plans.manage');
  return sys('plan upsert', async (tx) => {
    let planId = id;
    if (planId) {
      const r = await tx`update plans set code = ${input.code}, name_ar = ${input.nameAr}, name_en = ${input.nameEn},
        price_monthly_minor = ${input.priceMonthlyMinor}, price_yearly_minor = ${input.priceYearlyMinor}, price_is_test = ${input.priceIsTest},
        trial_days = ${input.trialDays}, grace_days = ${input.graceDays}, powered_by_required = ${input.poweredByRequired},
        status = ${input.status}, sort = ${input.sort}, updated_at = now() where id = ${planId} returning id`;
      if (!r.length) throw notFound('plan');
    } else {
      const [r] = await tx<{ id: string }[]>`insert into plans (code, name_ar, name_en, price_monthly_minor, price_yearly_minor, price_is_test, trial_days, grace_days, powered_by_required, status, sort)
        values (${input.code}, ${input.nameAr}, ${input.nameEn}, ${input.priceMonthlyMinor}, ${input.priceYearlyMinor}, ${input.priceIsTest},
                ${input.trialDays}, ${input.graceDays}, ${input.poweredByRequired}, ${input.status}, ${input.sort}) returning id`;
      planId = r.id;
    }
    for (const f of input.features) {
      await tx`insert into plan_features (plan_id, feature_key, enabled, limit_value) values (${planId}, ${f.key}, ${f.enabled}, ${f.limit})
               on conflict (plan_id, feature_key) do update set enabled = excluded.enabled, limit_value = excluded.limit_value`;
    }
    await audit(tx, { ...act(p), action: id ? 'platform.plan_updated' : 'platform.plan_created', targetType: 'plan', targetId: planId, metadata: { code: input.code, priceIsTest: input.priceIsTest } });
    return { id: planId };
  });
}

// ─────────────────────────────────────────────────────────────
// Subscriptions
// ─────────────────────────────────────────────────────────────
export type SubStatus = 'trialing' | 'active' | 'past_due' | 'paused' | 'cancelled' | 'expired';
export const SUB_TRANSITIONS: Record<SubStatus, SubStatus[]> = {
  trialing: ['active', 'expired', 'cancelled'],
  active: ['past_due', 'paused', 'cancelled'],
  past_due: ['active', 'expired', 'cancelled'],
  paused: ['active', 'cancelled'],
  cancelled: [],
  expired: [],
};

export const subscriptionChangeInput = z.object({
  status: z.enum(['trialing', 'active', 'past_due', 'paused', 'cancelled', 'expired']).optional(),
  planId: z.string().uuid().optional(),
  reason: z.string().trim().min(5).max(500),
});

/** Plan-limit overage after a downgrade: data is kept; only creation of new over-limit items is blocked. */
export async function computeOverage(tx: Tx, tenantId: string, planId: string): Promise<string[]> {
  const limits = await tx<{ featureKey: string; limitValue: number | null; enabled: boolean }[]>`select feature_key, limit_value, enabled from plan_features where plan_id = ${planId}`;
  const [u] = await tx<{ branches: number; staff: number; services: number }[]>`
    select (select count(*)::int from branches where tenant_id = ${tenantId} and status = 'active') as branches,
           (select count(*)::int from staff_profiles where tenant_id = ${tenantId} and status = 'active') as staff,
           (select count(*)::int from services where tenant_id = ${tenantId} and status <> 'archived') as services`;
  const over: string[] = [];
  const check = (key: string, n: number) => {
    const l = limits.find((x) => x.featureKey === key);
    if (l && l.enabled && l.limitValue !== null && n > l.limitValue) over.push(key);
  };
  check('branches.max', u.branches);
  check('staff.max', u.staff);
  check('services.max', u.services);
  return over;
}

export async function changeSubscription(p: PlatformContext, tenantId: string, input: z.infer<typeof subscriptionChangeInput>) {
  need(p, 'platform.tenants.manage');
  return sys('subscription change', async (tx) => {
    const [s] = await tx<{ id: string; status: SubStatus; planId: string }[]>`
      select id, status, plan_id from subscriptions where tenant_id = ${tenantId} order by created_at desc limit 1 for update`;
    if (!s) {
      if (!input.planId) throw new AppError('validation', 'platform.err_plan_required');
      const [pl] = await tx<{ trialDays: number }[]>`select trial_days from plans where id = ${input.planId} and status = 'active'`;
      if (!pl) throw notFound('plan');
      const [ns] = await tx<{ id: string }[]>`insert into subscriptions (tenant_id, plan_id, status, trial_ends_at, current_period_start, current_period_end)
        values (${tenantId}, ${input.planId}, 'trialing', now() + make_interval(days => ${pl.trialDays}), now(), now() + make_interval(days => ${pl.trialDays})) returning id`;
      await tx`insert into subscription_events (tenant_id, subscription_id, type, to_status, actor_user_id, data) values (${tenantId}, ${ns.id}, 'trial_started', 'trialing', ${p.user.userId}, ${tx.json({ reason: input.reason } as never)})`;
      await audit(tx, { ...act(p), tenantId, action: 'platform.subscription_created', targetType: 'subscription', targetId: ns.id, reason: input.reason });
      return { id: ns.id, status: 'trialing', overage: [] as string[] };
    }
    let status = s.status;
    if (input.status && input.status !== s.status) {
      if (!SUB_TRANSITIONS[s.status].includes(input.status)) throw new AppError('invalid_transition', 'errors.invalid_transition', { from: s.status, to: input.status });
      status = input.status;
    }
    let overage: string[] = [];
    const planId = input.planId ?? s.planId;
    if (input.planId && input.planId !== s.planId) {
      const [pl] = await tx`select 1 from plans where id = ${input.planId} and status = 'active'`;
      if (!pl) throw notFound('plan');
      overage = await computeOverage(tx, tenantId, input.planId);
    }
    const [{ graceDays }] = await tx<{ graceDays: number }[]>`select grace_days from plans where id = ${planId}`;
    await tx`update subscriptions set status = ${status}, plan_id = ${planId},
      overage_state = ${overage.length ? 'over_limit' : 'none'},
      grace_until = case when ${status} = 'past_due' and ${s.status} <> 'past_due' then now() + make_interval(days => ${graceDays}) when ${status} <> 'past_due' then null else grace_until end,
      cancel_at = case when ${status} = 'cancelled' then now() else cancel_at end,
      current_period_start = case when ${status} = 'active' and ${s.status} = 'trialing' then now() else current_period_start end,
      current_period_end = case when ${status} = 'active' and ${s.status} = 'trialing' then now() + interval '1 month' else current_period_end end
      where id = ${s.id}`;
    await tx`insert into subscription_events (tenant_id, subscription_id, type, from_status, to_status, actor_user_id, data)
             values (${tenantId}, ${s.id}, ${input.planId && input.planId !== s.planId ? 'plan_changed' : 'status_changed'}, ${s.status}, ${status}, ${p.user.userId},
                     ${tx.json({ reason: input.reason, planId, overage } as never)})`;
    await audit(tx, { ...act(p), tenantId, action: 'platform.subscription_changed', targetType: 'subscription', targetId: s.id, reason: input.reason, metadata: { from: s.status, to: status, planId, overage } });
    return { id: s.id, status, overage };
  });
}

// ─────────────────────────────────────────────────────────────
// Platform staff — only platform_owner; never from registration or tenants
// ─────────────────────────────────────────────────────────────
export const staffGrantInput = z.object({
  identifier: z.string().trim().min(5).max(254),
  role: z.enum(['platform_owner', 'support_admin', 'policy_reviewer', 'tech_admin']),
});

export async function listPlatformStaff(p: PlatformContext) {
  need(p, 'platform.users.manage');
  return sql()`select ps.user_id, ps.role, ps.status, ps.created_at, u.display_name, u.email, u.phone
               from platform_staff ps join users u on u.id = ps.user_id order by ps.created_at`;
}

export async function grantPlatformRole(p: PlatformContext, input: z.infer<typeof staffGrantInput>) {
  need(p, 'platform.users.manage');
  requireRecentStepUp(p.user);
  const { parseContact } = await import('../auth/service');
  const c = parseContact(input.identifier);
  return sys('platform role grant', async (tx) => {
    const [u] = c.kind === 'email'
      ? await tx<{ id: string; verified: boolean }[]>`select id, email_verified_at is not null as verified from users where email = ${c.email}`
      : await tx<{ id: string; verified: boolean }[]>`select id, phone_verified_at is not null as verified from users where phone = ${c.phone}`;
    if (!u || !u.verified) throw notFound('user');
    await tx`insert into platform_staff (user_id, role, status, granted_by) values (${u.id}, ${input.role}, 'active', ${p.user.userId})
             on conflict (user_id) do update set role = excluded.role, status = 'active', granted_by = excluded.granted_by`;
    await audit(tx, { ...act(p), action: 'platform.role_granted', targetType: 'user', targetId: u.id, metadata: { role: input.role } });
    return { userId: u.id };
  });
}

export async function revokePlatformRole(p: PlatformContext, userId: string) {
  need(p, 'platform.users.manage');
  requireRecentStepUp(p.user);
  if (userId === p.user.userId) throw new AppError('validation', 'platform.err_self_revoke');
  return sys('platform role revoke', async (tx) => {
    const r = await tx`update platform_staff set status = 'revoked' where user_id = ${userId} and status = 'active' returning user_id`;
    if (!r.length) throw notFound('user');
    await audit(tx, { ...act(p), action: 'platform.role_revoked', targetType: 'user', targetId: userId });
  });
}

// ─────────────────────────────────────────────────────────────
// Support access (time-limited, reasoned, audited; never silent)
// ─────────────────────────────────────────────────────────────
export const supportGrantInput = z.object({
  tenantId: z.string().uuid(),
  reason: z.string().trim().min(10).max(500),
  accessLevel: z.enum(['read', 'write']).default('read'),
  hours: z.number().int().min(1).max(24).default(2),
});

export async function createSupportGrant(p: PlatformContext, input: z.infer<typeof supportGrantInput>) {
  need(p, 'platform.support.access');
  requireRecentStepUp(p.user);
  return sys('support grant', async (tx) => {
    const [t] = await tx<{ slug: string }[]>`select slug from tenants where id = ${input.tenantId}`;
    if (!t) throw notFound('tenant');
    const [g] = await tx<{ id: string; expiresAt: Date }[]>`
      insert into support_access_grants (tenant_id, platform_user_id, reason, access_level, expires_at, created_by)
      values (${input.tenantId}, ${p.user.userId}, ${input.reason}, ${input.accessLevel}, now() + make_interval(hours => ${input.hours}), ${p.user.userId})
      returning id, expires_at`;
    await audit(tx, { ...act(p), actorKind: 'support', tenantId: input.tenantId, action: 'support.grant_created', targetType: 'support_grant', targetId: g.id, reason: input.reason, metadata: { accessLevel: input.accessLevel, hours: input.hours } });
    const { notifyTenantRoles } = await import('../services/notifications');
    await notifyTenantRoles(tx, input.tenantId, ['owner'], { type: 'support.access_started', title: 'platform.notice_support_access', body: input.reason.slice(0, 200), targetPath: `/app/${t.slug}/audit`, dedupeKey: `support:${g.id}` });
    return { ...g, slug: t.slug };
  });
}

export async function listSupportGrants(p: PlatformContext) {
  need(p, 'platform.support.access');
  return sys('support grants list', (tx) => tx`
    select g.id, g.tenant_id, t.name as tenant_name, t.slug, g.reason, g.access_level, g.starts_at, g.expires_at, g.revoked_at,
      u.display_name as platform_user, (g.revoked_at is null and g.expires_at > now()) as active
    from support_access_grants g join tenants t on t.id = g.tenant_id join users u on u.id = g.platform_user_id
    where ${p.role === 'platform_owner'} or g.platform_user_id = ${p.user.userId}
    order by g.created_at desc limit 100`);
}

export async function revokeSupportGrant(p: PlatformContext, id: string) {
  need(p, 'platform.support.access');
  return sys('support grant revoke', async (tx) => {
    const [g] = await tx<{ tenantId: string }[]>`update support_access_grants set revoked_at = now()
      where id = ${id} and revoked_at is null and (${p.role === 'platform_owner'} or platform_user_id = ${p.user.userId}) returning tenant_id`;
    if (!g) throw notFound('grant');
    await audit(tx, { ...act(p), actorKind: 'support', tenantId: g.tenantId, action: 'support.grant_revoked', targetType: 'support_grant', targetId: id });
  });
}

// ─────────────────────────────────────────────────────────────
// Templates (LUMA-approved storefront templates)
// ─────────────────────────────────────────────────────────────
export const templateInput = z.object({
  name: z.string().trim().min(2).max(80),
  nameEn: z.string().trim().max(80).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  document: z.unknown(),
  status: z.enum(['draft', 'approved', 'retired']).default('draft'),
});

export async function listTemplates(p: PlatformContext) {
  need(p, 'platform.templates.manage');
  return sys('templates', (tx) => tx`select id, name, name_en, description, status, created_at from templates where tenant_id is null order by created_at desc`);
}

export async function upsertTemplate(p: PlatformContext, input: z.infer<typeof templateInput>, id?: string) {
  need(p, 'platform.templates.manage');
  const doc = documentSchema.safeParse(input.document);
  if (!doc.success) throw new AppError('validation', 'platform.err_template_invalid', { issues: doc.error.issues.slice(0, 5).map((i) => i.path.join('.')) });
  return sys('template upsert', async (tx) => {
    let tid = id;
    if (tid) {
      const r = await tx`update templates set name = ${input.name}, name_en = ${input.nameEn ?? null}, description = ${input.description ?? null},
                         document = ${tx.json(doc.data as never)}, status = ${input.status} where id = ${tid} and tenant_id is null returning id`;
      if (!r.length) throw notFound('template');
    } else {
      const [r] = await tx<{ id: string }[]>`insert into templates (tenant_id, name, name_en, description, document, status, created_by)
        values (null, ${input.name}, ${input.nameEn ?? null}, ${input.description ?? null}, ${tx.json(doc.data as never)}, ${input.status}, ${p.user.userId}) returning id`;
      tid = r.id;
    }
    await audit(tx, { ...act(p), action: 'platform.template_saved', targetType: 'template', targetId: tid, metadata: { status: input.status } });
    return { id: tid };
  });
}

// ─────────────────────────────────────────────────────────────
// Integrations status (honest: nothing is reported live unless it is)
// ─────────────────────────────────────────────────────────────
export type IntegrationState = 'live' | 'sandbox' | 'mock' | 'disconnected';

export async function integrationsStatus(p: PlatformContext) {
  need(p, 'platform.integrations.view');
  const e = env();
  const msg = messagingStatus();
  const mapMsg = (s: string): IntegrationState => (s === 'connected' ? 'live' : s === 'dev_outbox' ? 'mock' : 'disconnected');
  const aiConfigured = e.AI_PROVIDER === 'openai' && !!e.OPENAI_API_KEY && !!e.OPENAI_MODEL;
  const lastAi = await sys('ai last run', (tx) => tx<{ status: string; createdAt: Date }[]>`
    select status, created_at from ai_runs where provider = 'openai' order by created_at desc limit 1`).catch(() => []);
  const accounts = await sys('payment accounts', (tx) => tx<{ provider: string; mode: string; n: number }[]>`
    select provider, mode, count(*)::int as n from payment_accounts where status = 'active' group by provider, mode`);
  const [jobs] = await sys('jobs', (tx) => tx<{ failed: number; queued: number }[]>`
    select count(*) filter (where status = 'failed' and finished_at > now() - interval '7 days')::int as failed,
           count(*) filter (where status = 'queued')::int as queued from job_runs`);
  return {
    items: [
      { key: 'email', state: mapMsg(msg.email), detail: msg.email === 'dev_outbox' ? 'dev outbox (not sent)' : e.EMAIL_PROVIDER },
      { key: 'sms', state: mapMsg(msg.sms), detail: msg.sms === 'dev_outbox' ? 'dev outbox (not sent)' : e.SMS_PROVIDER },
      { key: 'whatsapp', state: 'disconnected' as IntegrationState, detail: 'no adapter connected; deliveries recorded as simulated' },
      {
        key: 'ai',
        state: (aiConfigured ? (lastAi[0]?.status === 'succeeded' ? 'live' : 'disconnected') : 'disconnected') as IntegrationState,
        detail: aiConfigured ? (lastAi[0] ? `last run: ${lastAi[0].status}` : 'configured, never successfully invoked') : 'not configured',
      },
      {
        key: 'payments',
        state: (accounts.some((a) => a.provider === 'moyasar' && a.mode === 'live') ? 'live' : e.PAYMENTS_SANDBOX_ENABLED && !isProduction() ? 'sandbox' : 'disconnected') as IntegrationState,
        detail: accounts.map((a) => `${a.provider}/${a.mode}: ${a.n}`).join(', ') || 'no active accounts',
      },
      { key: 'moyasar', state: (e.MOYASAR_ENABLED ? 'disconnected' : 'disconnected') as IntegrationState, detail: e.MOYASAR_ENABLED ? 'enabled but not live-verified' : 'adapter present, untested, disabled' },
      { key: 'trends', state: (e.TRENDS_FETCH_ENABLED ? 'disconnected' : 'disconnected') as IntegrationState, detail: e.TRENDS_FETCH_ENABLED ? 'fetch enabled; see sources' : 'no external sources connected' },
    ],
    jobs,
    deployment: e.LUMA_DEPLOYMENT,
  };
}

export async function aiUsageOverview(p: PlatformContext) {
  need(p, 'platform.ai_usage.view');
  return sys('ai usage', async (tx) => {
    const perTenant = await tx`
      select t.name, t.slug, u.period, u.runs, u.tokens_in, u.tokens_out, u.cost_micro_usd
      from ai_usage u join tenants t on t.id = u.tenant_id
      where u.period >= date_trunc('month', now()) - interval '3 months' order by u.period desc, u.runs desc limit 200`;
    const byStatus = await tx`select status, count(*)::int as n, count(*) filter (where cost_micro_usd is null)::int as cost_unknown
                              from ai_runs where created_at > now() - interval '30 days' group by status`;
    return { perTenant, byStatus };
  });
}

export async function revenueOverview(p: PlatformContext) {
  need(p, 'platform.revenue.view');
  return sys('platform revenue', async (tx) => {
    const byMonth = await tx`
      select date_trunc('month', issued_at)::date as month, is_test,
        coalesce(sum(amount_minor) filter (where status = 'paid'), 0)::bigint as paid_minor,
        coalesce(sum(amount_minor) filter (where status = 'open'), 0)::bigint as open_minor, count(*)::int as invoices
      from platform_invoices group by 1, 2 order by 1 desc limit 24`;
    const [subs] = await tx`
      select count(*) filter (where status = 'trialing')::int as trialing, count(*) filter (where status = 'active')::int as active,
             count(*) filter (where status = 'past_due')::int as past_due, count(*) filter (where status = 'paused')::int as paused,
             count(*) filter (where status in ('cancelled','expired'))::int as ended
      from (select distinct on (tenant_id) status from subscriptions order by tenant_id, created_at desc) s`;
    return { byMonth, subscriptions: subs };
  });
}

export const auditQuery = z.object({
  tenantId: z.string().uuid().optional(),
  action: z.string().max(80).optional(),
  actorKind: z.enum(['user', 'platform', 'support', 'system', 'customer']).optional(),
  before: z.coerce.number().int().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export async function platformAudit(p: PlatformContext, q: z.infer<typeof auditQuery>) {
  need(p, 'platform.audit.view');
  const actionLike = q.action ? `${q.action.replace(/[%_\\]/g, (m) => `\\${m}`)}%` : null;
  const rows = await sql()`
    select a.id, a.at, a.actor_kind, a.action, a.target_type, a.target_id, a.reason, a.metadata, a.request_id, a.tenant_id,
      u.display_name as actor_name, t.name as tenant_name
    from audit_logs a left join users u on u.id = a.actor_user_id left join tenants t on t.id = a.tenant_id
    where (${q.tenantId ?? null}::uuid is null or a.tenant_id = ${q.tenantId ?? null}::uuid)
      and (${actionLike}::text is null or a.action like ${actionLike})
      and (${q.actorKind ?? null}::text is null or a.actor_kind = ${q.actorKind ?? null})
      and (${q.before ?? null}::bigint is null or a.id < ${q.before ?? null}::bigint)
    order by a.id desc limit ${q.limit + 1}`;
  return { items: rows.slice(0, q.limit), nextBefore: rows.length > q.limit ? rows[q.limit - 1].id : null };
}

export async function platformOverview(p: PlatformContext) {
  need(p, 'platform.tenants.view');
  return sys('overview', async (tx) => {
    const [c] = await tx`
      select (select count(*)::int from tenants where status = 'active') as active_tenants,
             (select count(*)::int from tenants where status = 'onboarding') as onboarding_tenants,
             (select count(*)::int from tenants where status = 'suspended') as suspended_tenants,
             (select count(*)::int from customer_incidents where platform_review_requested and status in ('submitted','under_review')) as review_queue,
             (select count(*)::int from appeals where status in ('submitted','under_review') and decision_id in (select id from policy_decisions where scope = 'platform')) as open_platform_appeals,
             (select count(*)::int from support_access_grants where revoked_at is null and expires_at > now()) as active_support_grants`;
    return c;
  });
}
