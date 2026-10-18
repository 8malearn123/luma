import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { sql, withTenant, type Tx } from '../db';
import { AppError, invalid } from '../errors';
import { audit } from '../audit';
import { generateDraft } from '@/lib/builder/defaults';
import type { SessionUser } from '../auth/service';

export const RESERVED_TENANT_SLUGS = new Set([
  'admin', 'api', 'app', 'auth', 'account', 'platform', 'staff', 'discover', 'pricing', 'preview', 'luma', 'www', 'help', 'support', 'dev', 'static', 's',
]);

export const createTenantSchema = z.object({
  name: z.string().trim().min(2).max(120),
  businessType: z.enum(['salon', 'expert', 'spa', 'clinic', 'studio']),
  city: z.string().trim().min(2).max(80),
  branchName: z.string().trim().min(1).max(120).optional(),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/, 'errors.slug_invalid'),
  locale: z.enum(['ar', 'en']).default('ar'),
});

export async function slugAvailable(slug: string): Promise<boolean> {
  if (RESERVED_TENANT_SLUGS.has(slug)) return false;
  const [r] = await sql()`select 1 from tenants where slug = ${slug}`;
  return !r;
}

/**
 * Trusted transaction: creates the tenant, its primary branch, the OWNER
 * membership for the authenticated caller (never a browser-supplied role),
 * a trial subscription on the default plan, default policies, an empty
 * profile, the initial storefront draft and the onboarding session.
 */
export async function createTenant(user: SessionUser, input: z.infer<typeof createTenantSchema>, opts: { isDemo?: boolean; requestId?: string } = {}) {
  if (!(await slugAvailable(input.slug))) throw invalid({ slug: 'errors.slug_taken' });
  const tenantId = randomUUID();
  return withTenant({ tenantId, userId: user.userId }, async (tx) => {
    await tx`insert into tenants (id, slug, name, business_type, city, default_locale, created_by, is_demo)
             values (${tenantId}, ${input.slug}, ${input.name}, ${input.businessType}, ${input.city}, ${input.locale},
                     ${user.userId}, ${opts.isDemo ?? false})`;
    const [branch] = await tx<{ id: string }[]>`
      insert into branches (tenant_id, name, city, is_primary)
      values (${tenantId}, ${input.branchName ?? input.name}, ${input.city}, true) returning id`;
    await tx`insert into tenant_memberships (tenant_id, user_id, role) values (${tenantId}, ${user.userId}, 'owner')`;
    await startTrial(tx, tenantId, user.userId);
    await tx`insert into booking_policies (tenant_id, updated_by) values (${tenantId}, ${user.userId})`;
    await tx`insert into tenant_profiles (tenant_id, wordmark_text) values (${tenantId}, ${input.name})`;
    await tx`insert into finance_settings (tenant_id) values (${tenantId})`;
    await tx`insert into marketing_preferences (tenant_id) values (${tenantId})`;
    await tx`insert into loyalty_rules (tenant_id) values (${tenantId})`;
    const draft = generateDraft({ businessName: input.name, businessType: input.businessType });
    await tx`insert into storefront_drafts (tenant_id, document, updated_by) values (${tenantId}, ${tx.json(draft as never)}, ${user.userId})`;
    await tx`insert into onboarding_sessions (tenant_id, current_step, answers, completed_steps, updated_by)
             values (${tenantId}, 2, ${tx.json({ '1': { name: input.name, businessType: input.businessType, city: input.city, branchName: input.branchName ?? input.name, slug: input.slug } } as never)},
                     ${[1]}, ${user.userId})`;
    await audit(tx, {
      actorUserId: user.userId,
      actorKind: 'user',
      tenantId,
      action: 'tenant.created',
      targetType: 'tenant',
      targetId: tenantId,
      requestId: opts.requestId,
      metadata: { slug: input.slug, businessType: input.businessType },
    });
    return { tenantId, slug: input.slug, branchId: branch.id };
  });
}

async function startTrial(tx: Tx, tenantId: string, userId: string) {
  const [plan] = await tx<{ id: string; trialDays: number; code: string }[]>`
    select id, trial_days, code from plans where status = 'active' order by sort, created_at limit 1`;
  if (!plan) return; // platform has not configured plans yet: tenant stays in onboarding without a live subscription
  const [sub] = await tx<{ id: string }[]>`
    insert into subscriptions (tenant_id, plan_id, status, trial_ends_at, current_period_start, current_period_end)
    values (${tenantId}, ${plan.id}, 'trialing', now() + make_interval(days => ${plan.trialDays}), now(),
            now() + make_interval(days => ${plan.trialDays}))
    returning id`;
  await tx`insert into subscription_events (tenant_id, subscription_id, type, to_status, actor_user_id, data)
           values (${tenantId}, ${sub.id}, 'trial_started', 'trialing', ${userId}, ${tx.json({ plan: plan.code } as never)})`;
}

export function assertTenantWritable(status: string) {
  if (status === 'suspended' || status === 'archived') throw new AppError('forbidden', 'errors.tenant_suspended');
}
