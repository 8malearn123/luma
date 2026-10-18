import { z } from 'zod';
import type { Tx } from '../db';
import { AppError, notFound } from '../errors';
import { audit } from '../audit';
import type { TenantContext } from '../tenancy/context';
import { entitlements, requireBelowLimit } from '../tenancy/plan';

const act = (ctx: TenantContext) => ({ actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, requestId: ctx.requestId });

const TIMEZONES = ['Asia/Riyadh', 'Asia/Dubai', 'Asia/Kuwait', 'Asia/Qatar', 'Asia/Bahrain', 'Africa/Cairo', 'Europe/London', 'UTC'];

export const businessInput = z.object({
  name: z.string().trim().min(2).max(120),
  legalName: z.string().trim().max(200).nullable().optional(),
  taxNumber: z.string().trim().max(40).regex(/^[0-9A-Za-z-]*$/).nullable().optional(),
  timezone: z.string().refine((t) => TIMEZONES.includes(t), 'errors.timezone_invalid'),
  defaultLocale: z.enum(['ar', 'en']),
  city: z.string().trim().max(80).nullable().optional(),
});

export const branchInput = z.object({
  name: z.string().trim().min(1).max(120),
  city: z.string().trim().max(80).nullable().optional(),
  address: z.string().trim().max(300).nullable().optional(),
  phone: z.string().trim().max(20).nullable().optional(),
  timezone: z.string().refine((t) => TIMEZONES.includes(t)).nullable().optional(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
});

export const policyInput = z.object({
  slotIncrementMin: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(20), z.literal(30), z.literal(45), z.literal(60)]),
  minNoticeMin: z.number().int().min(0).max(20160),
  maxAdvanceDays: z.number().int().min(1).max(365),
  holdMinutes: z.number().int().min(2).max(60),
  cancellationWindowHours: z.number().int().min(0).max(336),
  lateCancelFeeBps: z.number().int().min(0).max(10000),
  noShowGraceMin: z.number().int().min(0).max(240),
  noShowFeeBps: z.number().int().min(0).max(10000),
  depositMode: z.enum(['none', 'percent', 'fixed']),
  depositValue: z.number().int().min(0).max(100_000_000),
  allowOnSite: z.boolean(),
  allowFullOnline: z.boolean(),
  anyStaffRule: z.enum(['earliest_then_least_booked', 'earliest_then_weight']),
  maxGapMin: z.number().int().min(0).max(240),
  policyText: z.string().max(4000).nullable().optional(),
  policyTextEn: z.string().max(4000).nullable().optional(),
  expectedVersion: z.number().int(),
}).refine((p) => p.depositMode !== 'percent' || p.depositValue <= 10000, { message: 'errors.deposit_percent_max', path: ['depositValue'] });

const optText = (max: number, re?: RegExp, msg?: string) => {
  const base = re ? z.string().trim().regex(re, msg) : z.string().trim().max(max);
  return z.union([z.literal('').transform(() => null), base.max(max)]).nullable().optional();
};
export const financeSettingsInput = z
  .object({
    pricesIncludeTax: z.boolean(),
    taxRateBps: z.number().int().min(0).max(10000),
    taxLabel: z.string().trim().min(1).max(20),
    taxRegistered: z.boolean(),
    legalAddress: z.string().max(400).nullable().optional(),
    invoiceFooter: z.string().max(400).nullable().optional(),
    // seller identity printed on tax invoices (ZATCA simplified invoice fields)
    sellerVatNumber: optText(15, /^3[0-9]{13}3$/, 'errors.vat_number_invalid'),
    crNumber: optText(10, /^[0-9]{10}$/, 'errors.cr_number_invalid'),
    addressStreet: optText(120),
    addressBuildingNo: optText(4, /^[0-9]{4}$/, 'errors.building_no_invalid'),
    addressDistrict: optText(80),
    addressCity: optText(80),
    addressPostalCode: optText(5, /^[0-9]{5}$/, 'errors.postal_invalid'),
    addressAdditionalNo: optText(4, /^[0-9]{4}$/, 'errors.building_no_invalid'),
  })
  .refine((v) => !v.taxRegistered || !!v.sellerVatNumber, { path: ['sellerVatNumber'], message: 'errors.vat_number_required' })
  .refine((v) => !v.taxRegistered || v.taxRateBps > 0, { path: ['taxRateBps'], message: 'errors.tax_rate_required' });

export async function getSettings(tx: Tx) {
  const [business] = await tx`select name, legal_name, tax_number, timezone, default_locale, city, slug, business_type, status from tenants`;
  const branches = await tx`select id, name, city, address, phone, timezone, is_primary, status, latitude::float as latitude, longitude::float as longitude from branches order by is_primary desc, name`;
  const [policy] = await tx`select * from booking_policies`;
  const [finance] = await tx`select * from finance_settings`;
  return { business, branches, policy, finance };
}

export async function updateBusiness(tx: Tx, ctx: TenantContext, p: z.infer<typeof businessInput>) {
  await tx`update tenants set name = ${p.name}, legal_name = ${p.legalName ?? null}, tax_number = ${p.taxNumber ?? null}, timezone = ${p.timezone},
           default_locale = ${p.defaultLocale}, city = ${p.city ?? null} where id = ${ctx.tenant.id}`;
  await audit(tx, { ...act(ctx), action: 'tenant.updated', targetType: 'tenant', targetId: ctx.tenant.id, metadata: { timezone: p.timezone } });
}

export async function upsertBranch(tx: Tx, ctx: TenantContext, p: z.infer<typeof branchInput>, id?: string) {
  if (id) {
    const r = await tx`update branches set name = ${p.name}, city = ${p.city ?? null}, address = ${p.address ?? null}, phone = ${p.phone ?? null},
                       timezone = ${p.timezone ?? null}, latitude = ${p.latitude ?? null}, longitude = ${p.longitude ?? null}, updated_at = now() where id = ${id} returning id`;
    if (!r.length) throw notFound('branch');
  } else {
    const ent = await entitlements(tx, ctx.tenant.id);
    const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from branches where status = 'active'`;
    requireBelowLimit(ent, 'branches.max', n);
    const [b] = await tx<{ id: string }[]>`insert into branches (tenant_id, name, city, address, phone, timezone, latitude, longitude)
      values (${ctx.tenant.id}, ${p.name}, ${p.city ?? null}, ${p.address ?? null}, ${p.phone ?? null}, ${p.timezone ?? null}, ${p.latitude ?? null}, ${p.longitude ?? null}) returning id`;
    id = b.id;
  }
  await audit(tx, { ...act(ctx), action: 'branch.saved', targetType: 'branch', targetId: id });
  return { id };
}

export async function archiveBranch(tx: Tx, ctx: TenantContext, id: string) {
  const [b] = await tx<{ isPrimary: boolean }[]>`select is_primary from branches where id = ${id}`;
  if (!b) throw notFound('branch');
  if (b.isPrimary) throw new AppError('validation', 'errors.cannot_archive_primary_branch');
  const [fut] = await tx`select 1 from bookings where branch_id = ${id} and starts_at > now() and status in ('held','pending_payment','confirmed') limit 1`;
  if (fut) throw new AppError('conflict', 'errors.branch_has_future_bookings');
  await tx`update branches set status = 'archived' where id = ${id}`;
  await audit(tx, { ...act(ctx), action: 'branch.archived', targetType: 'branch', targetId: id });
}

/** Booking policy changes never alter existing bookings: they keep their terms snapshot. */
export async function updatePolicy(tx: Tx, ctx: TenantContext, p: z.infer<typeof policyInput>) {
  const [cur] = await tx<{ version: number }[]>`select version from booking_policies for update`;
  if (!cur) throw notFound('policy');
  if (cur.version !== p.expectedVersion) throw new AppError('version_conflict', 'errors.version_conflict');
  await tx`update booking_policies set version = version + 1, slot_increment_min = ${p.slotIncrementMin}, min_notice_min = ${p.minNoticeMin},
    max_advance_days = ${p.maxAdvanceDays}, hold_minutes = ${p.holdMinutes}, cancellation_window_hours = ${p.cancellationWindowHours},
    late_cancel_fee_bps = ${p.lateCancelFeeBps}, no_show_grace_min = ${p.noShowGraceMin}, no_show_fee_bps = ${p.noShowFeeBps},
    deposit_mode = ${p.depositMode}, deposit_value = ${p.depositValue}, allow_on_site = ${p.allowOnSite}, allow_full_online = ${p.allowFullOnline},
    any_staff_rule = ${p.anyStaffRule}, max_gap_min = ${p.maxGapMin}, policy_text = ${p.policyText ?? null}, policy_text_en = ${p.policyTextEn ?? null},
    updated_by = ${ctx.user.userId}, updated_at = now()`;
  await audit(tx, { ...act(ctx), action: 'policy.updated', targetType: 'booking_policy', metadata: { version: cur.version + 1, depositMode: p.depositMode } });
  return { version: cur.version + 1 };
}

export async function updateFinanceSettings(tx: Tx, ctx: TenantContext, p: z.infer<typeof financeSettingsInput>) {
  await tx`update finance_settings set prices_include_tax = ${p.pricesIncludeTax}, tax_rate_bps = ${p.taxRateBps}, tax_label = ${p.taxLabel},
           tax_registered = ${p.taxRegistered}, legal_address = ${p.legalAddress ?? null}, invoice_footer = ${p.invoiceFooter ?? null},
           seller_vat_number = ${p.sellerVatNumber ?? null}, cr_number = ${p.crNumber ?? null}, address_street = ${p.addressStreet ?? null},
           address_building_no = ${p.addressBuildingNo ?? null}, address_district = ${p.addressDistrict ?? null}, address_city = ${p.addressCity ?? null},
           address_postal_code = ${p.addressPostalCode ?? null}, address_additional_no = ${p.addressAdditionalNo ?? null}, updated_at = now()`;
  await audit(tx, { ...act(ctx), action: 'finance_settings.updated', metadata: { taxRateBps: p.taxRateBps, registered: p.taxRegistered } });
}

export async function subscriptionView(tx: Tx, tenantId: string) {
  const [sub] = await tx`select s.status, s.trial_ends_at, s.current_period_end, s.grace_until, s.overage_state, p.code, p.name_ar, p.name_en,
                           p.price_monthly_minor, p.price_is_test, p.currency
                         from subscriptions s join plans p on p.id = s.plan_id where s.tenant_id = ${tenantId} order by s.created_at desc limit 1`;
  const ent = await entitlements(tx, tenantId);
  const [usage] = await tx<{ staff: number; services: number; branches: number }[]>`select
      (select count(*) from staff_profiles where status = 'active')::int as staff,
      (select count(*) from services where status <> 'archived')::int as services,
      (select count(*) from branches where status = 'active')::int as branches`;
  return { subscription: sub ?? null, live: ent.live, features: Object.fromEntries(ent.features), usage };
}

export async function auditLog(tx: Tx, tenantId: string, q: { action?: string; actor?: string; from?: string; to?: string; offset?: number }) {
  // audit_logs has no RLS: always filter by the context tenant explicitly
  const rows = await tx`select a.id, a.at, a.actor_kind, a.action, a.target_type, a.target_id, a.reason, a.metadata, u.display_name as actor_name
    from audit_logs a left join users u on u.id = a.actor_user_id
    where a.tenant_id = ${tenantId}
      and (${q.action ?? null}::text is null or a.action like ${(q.action ?? '') + '%'})
      and (${q.actor ?? null}::text is null or u.display_name ilike ${'%' + (q.actor ?? '') + '%'})
      and (${q.from ?? null}::timestamptz is null or a.at >= ${q.from ?? null}::timestamptz)
      and (${q.to ?? null}::timestamptz is null or a.at < ${q.to ?? null}::timestamptz)
    order by a.at desc limit 101 offset ${q.offset ?? 0}`;
  return { items: rows.slice(0, 100), hasMore: rows.length > 100 };
}
