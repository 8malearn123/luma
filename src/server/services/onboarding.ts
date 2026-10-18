import { z } from 'zod';
import type { Tx } from '../db';
import { AppError, forbidden } from '../errors';
import { audit } from '../audit';
import type { TenantContext } from '../tenancy/context';
import { FONTS, type Brand, type FontKey } from '@/lib/builder/schema';
import { contrast, generateDraft, paletteFromPrimary, PALETTES, type OnboardingAnswers } from '@/lib/builder/defaults';

/**
 * Seven-step onboarding. Answers persist per step (save / resume / back /
 * skip) with optimistic concurrency on onboarding_sessions.version. Each step
 * also writes its real effect (tenant, branch, profile, hours, policy) so the
 * dashboard is consistent even if onboarding is never "finished". Services are
 * created through the catalog API with owner-entered prices — never invented.
 */
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'errors.color_invalid');
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'errors.time_invalid');
export const CHARACTERS = ['luxurious', 'warm', 'minimal', 'bold', 'natural', 'playful', 'classic', 'modern'] as const;
export const PRIORITIES = ['booking', 'portfolio', 'products'] as const;
export const SOCIAL_NETWORKS = ['instagram', 'tiktok', 'snapchat', 'x', 'youtube', 'facebook'] as const;
const fontKey = z.enum(Object.keys(FONTS) as [FontKey, ...FontKey[]]);
const handle = z.string().trim().regex(/^@?[A-Za-z0-9._-]{1,60}$/, 'errors.social_handle_invalid');

export const STEP_SCHEMAS = {
  1: z.object({
    name: z.string().trim().min(2).max(120),
    businessType: z.enum(['salon', 'expert', 'spa', 'clinic', 'studio']),
    city: z.string().trim().min(2).max(80),
    branchName: z.string().trim().min(1).max(120),
  }),
  2: z.discriminatedUnion('mode', [
    z.object({ mode: z.literal('logo'), logoAssetId: z.string().uuid(), wordmark: z.string().trim().max(60).optional() }),
    z.object({ mode: z.literal('wordmark'), wordmark: z.string().trim().min(1).max(60) }),
  ]),
  3: z.object({ character: z.array(z.enum(CHARACTERS)).max(4).default([]), description: z.string().trim().max(1000).optional() }),
  4: z.object({
    primary: hex.nullable().optional(),
    useSuggested: z.string().max(40).nullable().optional(),
    excluded: z.array(hex).max(8).default([]),
    fonts: z.object({ heading: fontKey.optional(), body: fontKey.optional() }).default({}),
  }),
  5: z.object({ specialties: z.array(z.string().trim().min(1).max(60)).max(20).default([]), audience: z.string().trim().max(500).optional() }),
  6: z.object({ priorities: z.array(z.enum(PRIORITIES)).min(1).max(3) }),
  7: z.object({
    coverAssetId: z.string().uuid().nullable().optional(),
    intro: z.string().trim().max(4000).optional(),
    tagline: z.string().trim().max(160).optional(),
    phone: z.string().trim().max(30).optional(),
    whatsapp: z.string().trim().max(30).optional(),
    email: z.string().trim().email().max(254).optional().or(z.literal('')),
    address: z.string().trim().max(300).optional(),
    hours: z.array(z.object({ weekday: z.number().int().min(0).max(6), start: hhmm, end: hhmm })).max(21).default([]),
    socials: z.partialRecord(z.enum(SOCIAL_NETWORKS), handle).default({}),
    policy: z
      .object({
        allowOnSite: z.boolean(),
        depositMode: z.enum(['none', 'percent', 'fixed']),
        depositValue: z.number().int().min(0).max(10_000_000),
        cancellationWindowHours: z.number().int().min(0).max(336),
      })
      .optional(),
  }),
} as const;

export type StepNo = keyof typeof STEP_SCHEMAS;
export const OPTIONAL_STEPS = new Set<number>([2, 3, 4, 5, 6, 7]);

export const patchInput = z.object({
  step: z.number().int().min(1).max(7),
  answers: z.unknown().optional(),
  skip: z.boolean().default(false),
  /** where to land afterwards (back/next); defaults to step+1 */
  goTo: z.number().int().min(1).max(8).optional(),
  expectedVersion: z.number().int(),
});

export interface SessionRow {
  currentStep: number;
  answers: Record<string, unknown>;
  completedSteps: number[];
  skippedSteps: number[];
  paletteSuggestions: { colors: string[]; palette: Brand['colors'] } | null;
  draftGeneratedAt: Date | null;
  completedAt: Date | null;
  version: number;
  updatedAt: Date;
}

const requireOwnerish = (ctx: TenantContext) => {
  if (!ctx.caps.has('tenant.settings.manage')) throw forbidden();
};

export async function getSession(tx: Tx): Promise<SessionRow> {
  const [s] = await tx<SessionRow[]>`select current_step, answers, completed_steps, skipped_steps, palette_suggestions, draft_generated_at, completed_at, version, updated_at from onboarding_sessions limit 1`;
  if (!s) throw new AppError('not_found', 'errors.not_found');
  return s;
}

/** For 'expert' businesses the owner is herself the (first) provider. */
export async function ensureExpertStaff(tx: Tx, ctx: TenantContext) {
  const [t] = await tx<{ businessType: string }[]>`select business_type from tenants where id = ${ctx.tenant.id}`;
  if (t.businessType !== 'expert') return null;
  const [m] = await tx<{ id: string; staffProfileId: string | null }[]>`select id, staff_profile_id from tenant_memberships where user_id = ${ctx.user.userId} and role = 'owner'`;
  if (!m) return null;
  if (m.staffProfileId) return m.staffProfileId;
  const [existing] = await tx<{ id: string }[]>`select id from staff_profiles where user_id = ${ctx.user.userId}`;
  const staffId =
    existing?.id ??
    (
      await tx<{ id: string }[]>`insert into staff_profiles (tenant_id, user_id, display_name) values (${ctx.tenant.id}, ${ctx.user.userId}, ${ctx.user.displayName}) returning id`
    )[0].id;
  const branches = await tx<{ id: string }[]>`select id from branches where status = 'active'`;
  for (const b of branches) {
    await tx`insert into staff_branch_assignments (tenant_id, staff_id, branch_id) values (${ctx.tenant.id}, ${staffId}, ${b.id}) on conflict do nothing`;
  }
  await tx`update tenant_memberships set staff_profile_id = ${staffId} where id = ${m.id}`;
  return staffId;
}

async function applyStep(tx: Tx, ctx: TenantContext, step: StepNo, a: Record<string, unknown>, session: SessionRow) {
  const tid = ctx.tenant.id;
  switch (step) {
    case 1: {
      const v = a as z.infer<(typeof STEP_SCHEMAS)[1]>;
      await tx`update tenants set name = ${v.name}, business_type = ${v.businessType}, city = ${v.city} where id = ${tid}`;
      await tx`update branches set name = ${v.branchName}, city = ${v.city} where is_primary and status = 'active'`;
      await ensureExpertStaff(tx, ctx);
      break;
    }
    case 2: {
      const v = a as z.infer<(typeof STEP_SCHEMAS)[2]>;
      if (v.mode === 'logo') {
        const [asset] = await tx<{ dominantColors: string[] }[]>`select dominant_colors from assets where id = ${v.logoAssetId} and status = 'ready'`;
        if (!asset) throw new AppError('validation', 'errors.invalid_reference');
        await tx`update tenant_profiles set logo_asset_id = ${v.logoAssetId}, wordmark_text = coalesce(${v.wordmark ?? null}, wordmark_text), updated_at = now()`;
        // suggestion only: applied when the owner explicitly accepts it
        const primary = asset.dominantColors.find((c) => contrast(c, '#FFFFFF') > 2 && contrast(c, '#000000') > 2) ?? asset.dominantColors[0];
        const suggestion = primary ? { colors: asset.dominantColors, palette: paletteFromPrimary(primary, false) } : null;
        await tx`update onboarding_sessions set palette_suggestions = ${(suggestion ? tx.json(suggestion as never) : null) as never}`;
      } else {
        await tx`update tenant_profiles set logo_asset_id = null, wordmark_text = ${v.wordmark}, updated_at = now()`;
        await tx`update onboarding_sessions set palette_suggestions = null`;
      }
      break;
    }
    case 3: {
      const v = a as z.infer<(typeof STEP_SCHEMAS)[3]>;
      await tx`update tenant_profiles set brand_character = ${v.character}, brand_description = ${v.description ?? null}, updated_at = now()`;
      break;
    }
    case 4: {
      const v = a as z.infer<(typeof STEP_SCHEMAS)[4]>;
      if (v.useSuggested && !PALETTES.some((p) => p.key === v.useSuggested)) throw new AppError('validation', 'errors.validation', { useSuggested: 'errors.invalid_reference' });
      await tx`update tenant_profiles set excluded_colors = ${v.excluded}, updated_at = now()`;
      // keep a previously accepted logo palette unless the owner picks something else explicitly
      const prev = (session.answers['4'] as { acceptedLogoPalette?: unknown } | undefined)?.acceptedLogoPalette;
      if (prev && !v.primary && !v.useSuggested) (a as Record<string, unknown>).acceptedLogoPalette = prev;
      break;
    }
    case 5: {
      const v = a as z.infer<(typeof STEP_SCHEMAS)[5]>;
      await tx`update tenant_profiles set target_audience = ${v.audience ?? null}, updated_at = now()`;
      break;
    }
    case 6: {
      const v = a as z.infer<(typeof STEP_SCHEMAS)[6]>;
      if (new Set(v.priorities).size !== v.priorities.length) throw new AppError('validation', 'errors.duplicate');
      await tx`update tenant_profiles set store_priorities = ${v.priorities}, updated_at = now()`;
      break;
    }
    case 7: {
      const v = a as z.infer<(typeof STEP_SCHEMAS)[7]>;
      const socials = Object.fromEntries(Object.entries(v.socials).map(([k, h]) => [k, h.replace(/^@/, '')]));
      await tx`update tenant_profiles set cover_asset_id = ${v.coverAssetId ?? null}, intro = ${v.intro ?? null}, tagline = ${v.tagline ?? null},
               contact_phone = ${v.phone || null}, whatsapp = ${v.whatsapp || null}, contact_email = ${v.email || null}, address = ${v.address ?? null},
               socials = ${tx.json(socials as never)}, updated_at = now()`;
      if (v.coverAssetId) {
        const [c] = await tx`select 1 from assets where id = ${v.coverAssetId} and status = 'ready'`;
        if (!c) throw new AppError('validation', 'errors.invalid_reference');
      }
      const [branch] = await tx<{ id: string }[]>`select id from branches where is_primary and status = 'active' limit 1`;
      if (branch && v.hours.length) {
        for (const h of v.hours) if (h.end <= h.start) throw new AppError('validation', 'errors.time_range_invalid');
        await tx`delete from working_hours where branch_id = ${branch.id} and staff_id is null`;
        for (const h of v.hours) {
          await tx`insert into working_hours (tenant_id, branch_id, staff_id, weekday, start_time, end_time) values (${tid}, ${branch.id}, null, ${h.weekday}, ${h.start}, ${h.end})`;
        }
        // an expert's own hours default to the opening hours until she edits her schedule
        const staffId = await ensureExpertStaff(tx, ctx);
        if (staffId) {
          const [has] = await tx`select 1 from working_hours where staff_id = ${staffId} limit 1`;
          if (!has) for (const h of v.hours) await tx`insert into working_hours (tenant_id, branch_id, staff_id, weekday, start_time, end_time) values (${tid}, ${branch.id}, ${staffId}, ${h.weekday}, ${h.start}, ${h.end})`;
        }
      }
      if (v.policy) {
        if (v.policy.depositMode === 'percent' && v.policy.depositValue > 10000) throw new AppError('validation', 'errors.validation');
        await tx`update booking_policies set allow_on_site = ${v.policy.allowOnSite}, deposit_mode = ${v.policy.depositMode},
                 deposit_value = ${v.policy.depositValue}, cancellation_window_hours = ${v.policy.cancellationWindowHours},
                 version = version + 1, updated_by = ${ctx.user.userId}, updated_at = now()`;
        (a as Record<string, unknown>).policyReviewed = true;
      }
      break;
    }
  }
}

export async function saveStep(tx: Tx, ctx: TenantContext, input: z.infer<typeof patchInput>): Promise<SessionRow> {
  requireOwnerish(ctx);
  const [s] = await tx<SessionRow[]>`select current_step, answers, completed_steps, skipped_steps, palette_suggestions, draft_generated_at, completed_at, version, updated_at from onboarding_sessions for update`;
  if (!s) throw new AppError('not_found', 'errors.not_found');
  if (s.version !== input.expectedVersion) throw new AppError('version_conflict', 'errors.version_conflict', { currentVersion: s.version });
  const step = input.step as StepNo;
  const answers = { ...s.answers };
  let completed = s.completedSteps.filter((n) => n !== step);
  let skipped = s.skippedSteps.filter((n) => n !== step);
  if (input.skip) {
    if (!OPTIONAL_STEPS.has(step)) throw new AppError('validation', 'errors.step_required');
    skipped = [...skipped, step];
  } else if (input.answers !== undefined) {
    const parsed = (STEP_SCHEMAS[step] as z.ZodType).safeParse(input.answers);
    if (!parsed.success) throw new AppError('validation', 'errors.validation', z.flattenError(parsed.error as z.ZodError));
    const value = { ...(parsed.data as Record<string, unknown>) };
    await applyStep(tx, ctx, step, value, s);
    answers[String(step)] = value;
    completed = [...completed, step];
  }
  const goTo = Math.min(input.goTo ?? step + 1, 8);
  const [row] = await tx<SessionRow[]>`
    update onboarding_sessions set answers = ${tx.json(answers as never)}, completed_steps = ${[...new Set(completed)].sort()},
      skipped_steps = ${[...new Set(skipped)].sort()}, current_step = ${goTo}, version = version + 1, updated_by = ${ctx.user.userId}, updated_at = now()
    returning current_step, answers, completed_steps, skipped_steps, palette_suggestions, draft_generated_at, completed_at, version, updated_at`;
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: input.skip ? 'onboarding.step_skipped' : 'onboarding.step_saved', targetType: 'onboarding', targetId: String(step), requestId: ctx.requestId });
  return row;
}

/** Accept (or dismiss) the logo-derived palette. Nothing changes color until accepted. */
export async function decidePalette(tx: Tx, ctx: TenantContext, accept: boolean, expectedVersion: number) {
  requireOwnerish(ctx);
  const s = await getSession(tx);
  if (s.version !== expectedVersion) throw new AppError('version_conflict', 'errors.version_conflict');
  if (!s.paletteSuggestions) throw new AppError('invalid_transition', 'errors.no_palette_suggestion');
  const answers = { ...s.answers } as Record<string, Record<string, unknown>>;
  const step4 = { excluded: [], fonts: {}, ...(answers['4'] ?? {}) } as Record<string, unknown>;
  if (accept) {
    step4.acceptedLogoPalette = s.paletteSuggestions.palette;
    step4.primary = null;
    step4.useSuggested = null;
  } else delete step4.acceptedLogoPalette;
  answers['4'] = step4;
  const [row] = await tx<SessionRow[]>`update onboarding_sessions set answers = ${tx.json(answers as never)}, palette_suggestions = ${(accept ? tx.json(s.paletteSuggestions as never) : null) as never}, version = version + 1, updated_at = now()
    returning current_step, answers, completed_steps, skipped_steps, palette_suggestions, draft_generated_at, completed_at, version, updated_at`;
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: accept ? 'onboarding.palette_accepted' : 'onboarding.palette_dismissed', requestId: ctx.requestId });
  return row;
}

/** Builds deterministic generator inputs from saved answers + real catalog state. */
export async function answersForDraft(tx: Tx, ctx: TenantContext): Promise<OnboardingAnswers> {
  const s = await getSession(tx);
  const a = s.answers as Record<string, Record<string, unknown> | undefined>;
  const [t] = await tx<{ name: string; businessType: string }[]>`select name, business_type from tenants where id = ${ctx.tenant.id}`;
  const [p] = await tx<{ logoAssetId: string | null; coverAssetId: string | null; wordmarkText: string | null; tagline: string | null; brandCharacter: string[]; storePriorities: string[] }[]>`
    select logo_asset_id, cover_asset_id, wordmark_text, tagline, brand_character, store_priorities from tenant_profiles limit 1`;
  const [{ products }] = await tx<{ products: number }[]>`select count(*)::int as products from products where status = 'active'`;
  const s4 = (a['4'] ?? {}) as { primary?: string | null; useSuggested?: string | null; excluded?: string[]; fonts?: { heading?: FontKey; body?: FontKey }; acceptedLogoPalette?: Brand['colors'] };
  const priorities = (p?.storePriorities ?? []).filter((x) => (PRIORITIES as readonly string[]).includes(x));
  return {
    businessName: t.name,
    businessType: t.businessType,
    character: p?.brandCharacter ?? [],
    colors: { primary: s4.primary ?? null, useSuggested: s4.useSuggested ?? null, excluded: s4.excluded ?? [], acceptedLogoPalette: s4.acceptedLogoPalette ?? null },
    fonts: s4.fonts ?? {},
    priorities,
    wordmark: p?.wordmarkText ?? t.name,
    logoAssetId: p?.logoAssetId ?? null,
    coverAssetId: p?.coverAssetId ?? null,
    tagline: p?.tagline ?? '',
    hasProducts: priorities.includes('products') || products > 0,
  };
}

/**
 * Deterministic first draft (no AI). Overwriting a draft that the owner has
 * already edited in the builder requires an explicit `overwrite`.
 */
export async function generateFromAnswers(tx: Tx, ctx: TenantContext, opts: { overwrite?: boolean } = {}) {
  requireOwnerish(ctx);
  const s = await getSession(tx);
  const [d] = await tx<{ version: number; updatedAt: Date }[]>`select version, updated_at from storefront_drafts for update`;
  const edited = d && (s.draftGeneratedAt ? +d.updatedAt > +s.draftGeneratedAt + 1000 : d.version > 1);
  if (edited && !opts.overwrite) throw new AppError('conflict', 'errors.draft_overwrite_confirm', { draftVersion: d.version });
  const doc = generateDraft(await answersForDraft(tx, ctx));
  let version: number;
  if (d) {
    const [r] = await tx<{ version: number }[]>`update storefront_drafts set document = ${tx.json(doc as never)}, version = version + 1, updated_by = ${ctx.user.userId}, updated_at = now() returning version`;
    version = r.version;
  } else {
    const [r] = await tx<{ version: number }[]>`insert into storefront_drafts (tenant_id, document, updated_by) values (${ctx.tenant.id}, ${tx.json(doc as never)}, ${ctx.user.userId}) returning version`;
    version = r.version;
  }
  await tx`update onboarding_sessions set draft_generated_at = now(), completed_at = coalesce(completed_at, now()), current_step = 8, version = version + 1`;
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: 'onboarding.draft_generated', requestId: ctx.requestId, metadata: { draftVersion: version } });
  return { draftVersion: version, document: doc };
}

export interface ReadinessItem {
  key: 'service' | 'staff' | 'schedule' | 'contact' | 'policy';
  ok: boolean;
}

/** Pre-publication readiness checklist (booking must actually be possible). */
export async function readiness(tx: Tx): Promise<{ items: ReadinessItem[]; ready: boolean }> {
  const [r] = await tx<{ service: boolean; staff: boolean; schedule: boolean; contact: boolean; policy: boolean }[]>`
    select
      exists(select 1 from services s where s.status = 'active' and s.group_capacity is null) as service,
      exists(select 1 from service_staff ss join services s on s.id = ss.service_id and s.status = 'active'
             join staff_profiles p on p.id = ss.staff_id and p.status = 'active'
             join staff_branch_assignments a on a.staff_id = p.id) as staff,
      exists(select 1 from service_staff ss join services s on s.id = ss.service_id and s.status = 'active'
             join staff_profiles p on p.id = ss.staff_id and p.status = 'active'
             join working_hours w on w.staff_id = p.id) as schedule,
      exists(select 1 from tenant_profiles where coalesce(contact_phone, whatsapp, contact_email::text) is not null) as contact,
      (exists(select 1 from booking_policies where version > 1)
        or coalesce((select (answers->'7'->>'policyReviewed')::boolean from onboarding_sessions limit 1), false)) as policy`;
  const items: ReadinessItem[] = (['service', 'staff', 'schedule', 'contact', 'policy'] as const).map((key) => ({ key, ok: r[key] }));
  return { items, ready: items.every((i) => i.ok) };
}
