import type { Tx } from '../db';
import { AppError, notFound } from '../errors';
import { audit } from '../audit';
import { entitlements, requireBelowLimit } from '../tenancy/plan';
import { requireCap, type TenantContext } from '../tenancy/context';
import type { ServiceInput } from '@/lib/validation/catalog';
import { categoryInput, packageInput } from '@/lib/validation/catalog';
import type { z } from 'zod';

const act = (ctx: TenantContext) => ({ actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, requestId: ctx.requestId });

export interface ServiceRow {
  id: string;
  name: string;
  nameEn: string | null;
  description: string | null;
  descriptionEn: string | null;
  categoryId: string | null;
  branchId: string | null;
  priceMinor: number;
  priceIsFrom: boolean;
  currency: string;
  durationMin: number;
  bufferBeforeMin: number;
  bufferAfterMin: number;
  imageAssetId: string | null;
  status: 'active' | 'inactive' | 'archived';
  isVisible: boolean;
  internalBookingWhenHidden: boolean;
  minNoticeMin: number | null;
  maxAdvanceDays: number | null;
  groupCapacity: number | null;
  materialCostMinor: number | null;
  sort: number;
  version: number;
  updatedAt: Date;
}

export async function listServices(
  tx: Tx,
  opts: { q?: string; status?: string; categoryId?: string; limit?: number; offset?: number } = {},
) {
  const limit = Math.min(opts.limit ?? 50, 100);
  const q = opts.q ? `%${opts.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%` : null;
  const rows = await tx<(ServiceRow & { categoryName: string | null; staffCount: number })[]>`
    select s.*, c.name as category_name,
      (select count(*)::int from service_staff ss where ss.tenant_id = s.tenant_id and ss.service_id = s.id) as staff_count
    from services s left join categories c on c.tenant_id = s.tenant_id and c.id = s.category_id
    where (${opts.status ?? null}::text is null and s.status <> 'archived' or s.status = ${opts.status ?? null})
      and (${q}::text is null or s.name ilike ${q} or s.name_en ilike ${q})
      and (${opts.categoryId ?? null}::uuid is null or s.category_id = ${opts.categoryId ?? null}::uuid)
    order by s.sort, s.name
    limit ${limit + 1} offset ${opts.offset ?? 0}`;
  return { items: rows.slice(0, limit), hasMore: rows.length > limit };
}

export async function getService(tx: Tx, id: string) {
  const [s] = await tx<ServiceRow[]>`select * from services where id = ${id}`;
  if (!s) throw notFound('service');
  const [variants, addons, staff, priceRules, resources] = await Promise.all([
    tx`select id, name, name_en, price_minor, duration_min, status from service_variants where service_id = ${id} and status = 'active' order by sort, name`,
    tx`select id, name, name_en, price_minor, duration_min, status from service_addons where service_id = ${id} and status = 'active' order by name`,
    tx<{ staffId: string }[]>`select staff_id from service_staff where service_id = ${id}`,
    tx`select id, variant_id, staff_id, price_minor, duration_min from service_price_rules where service_id = ${id}`,
    tx<{ resourceTypeId: string }[]>`select resource_type_id from service_resource_requirements where service_id = ${id}`,
  ]);
  const pending = await tx`select id, current_price_minor, proposed_price_minor, reason, source, created_at from service_price_changes
                           where service_id = ${id} and status = 'pending' order by created_at desc`;
  return {
    ...s,
    variants,
    addons,
    staffIds: staff.map((x) => x.staffId),
    priceRules,
    resourceTypeIds: resources.map((r) => r.resourceTypeId),
    pendingPriceChanges: pending,
  };
}

async function writeChildren(tx: Tx, ctx: TenantContext, serviceId: string, input: ServiceInput) {
  const tid = ctx.tenant.id;
  // staff qualification (composite FK rejects other tenants' staff)
  await tx`delete from service_staff where service_id = ${serviceId}`;
  for (const staffId of new Set(input.staffIds)) {
    await tx`insert into service_staff (tenant_id, service_id, staff_id) values (${tid}, ${serviceId}, ${staffId})`;
  }
  // variants & add-ons: update in place, archive removed (history keeps referencing them)
  const keepV = input.variants.filter((v) => v.id).map((v) => v.id!) as string[];
  await tx`update service_variants set status = 'archived' where service_id = ${serviceId} and status = 'active' and not (id = any(${keepV}::uuid[]))`;
  let sort = 0;
  for (const v of input.variants) {
    if (v.id) {
      const r = await tx`update service_variants set name = ${v.name}, name_en = ${v.nameEn ?? null}, price_minor = ${v.priceMinor},
                         duration_min = ${v.durationMin}, sort = ${sort} where id = ${v.id} and service_id = ${serviceId} returning id`;
      if (!r.length) throw new AppError('validation', 'errors.invalid_reference');
    } else {
      await tx`insert into service_variants (tenant_id, service_id, name, name_en, price_minor, duration_min, sort)
               values (${tid}, ${serviceId}, ${v.name}, ${v.nameEn ?? null}, ${v.priceMinor}, ${v.durationMin}, ${sort})`;
    }
    sort++;
  }
  const keepA = input.addons.filter((a) => a.id).map((a) => a.id!) as string[];
  await tx`update service_addons set status = 'archived' where service_id = ${serviceId} and status = 'active' and not (id = any(${keepA}::uuid[]))`;
  for (const a of input.addons) {
    if (a.id) {
      const r = await tx`update service_addons set name = ${a.name}, name_en = ${a.nameEn ?? null}, price_minor = ${a.priceMinor},
                         duration_min = ${a.durationMin} where id = ${a.id} and service_id = ${serviceId} returning id`;
      if (!r.length) throw new AppError('validation', 'errors.invalid_reference');
    } else {
      await tx`insert into service_addons (tenant_id, service_id, name, name_en, price_minor, duration_min)
               values (${tid}, ${serviceId}, ${a.name}, ${a.nameEn ?? null}, ${a.priceMinor}, ${a.durationMin})`;
    }
  }
  await tx`delete from service_price_rules where service_id = ${serviceId}`;
  for (const r of input.priceRules) {
    if (!r.variantId && !r.staffId) continue;
    if (r.priceMinor == null && r.durationMin == null) continue;
    await tx`insert into service_price_rules (tenant_id, service_id, variant_id, staff_id, price_minor, duration_min)
             values (${tid}, ${serviceId}, ${r.variantId ?? null}, ${r.staffId ?? null}, ${r.priceMinor ?? null}, ${r.durationMin ?? null})`;
  }
  await tx`delete from service_resource_requirements where service_id = ${serviceId}`;
  for (const rt of new Set(input.resourceTypeIds)) {
    await tx`insert into service_resource_requirements (tenant_id, service_id, resource_type_id) values (${tid}, ${serviceId}, ${rt})`;
  }
}

export async function createService(tx: Tx, ctx: TenantContext, input: ServiceInput) {
  requireCap(ctx, 'catalog.manage');
  const ent = await entitlements(tx, ctx.tenant.id);
  const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from services where status <> 'archived'`;
  requireBelowLimit(ent, 'services.max', n);
  const [s] = await tx<{ id: string }[]>`
    insert into services (tenant_id, branch_id, category_id, name, name_en, description, description_en, price_minor, price_is_from,
      duration_min, buffer_before_min, buffer_after_min, image_asset_id, is_visible, internal_booking_when_hidden, min_notice_min,
      max_advance_days, group_capacity, material_cost_minor, sort)
    values (${ctx.tenant.id}, ${input.branchId ?? null}, ${input.categoryId ?? null}, ${input.name}, ${input.nameEn ?? null},
      ${input.description ?? null}, ${input.descriptionEn ?? null}, ${input.priceMinor}, ${input.priceIsFrom}, ${input.durationMin},
      ${input.bufferBeforeMin}, ${input.bufferAfterMin}, ${input.imageAssetId ?? null}, ${input.isVisible}, ${input.internalBookingWhenHidden},
      ${input.minNoticeMin ?? null}, ${input.maxAdvanceDays ?? null}, ${input.groupCapacity ?? null}, ${input.materialCostMinor ?? null},
      (select coalesce(max(sort), 0) + 1 from services))
    returning id`;
  await writeChildren(tx, ctx, s.id, input);
  await audit(tx, { ...act(ctx), action: 'service.created', targetType: 'service', targetId: s.id, metadata: { name: input.name, priceMinor: input.priceMinor } });
  return { id: s.id };
}

/**
 * Updates a service with optimistic concurrency. A price change by someone
 * without catalog.price.approve becomes a pending proposal instead of applying.
 * Existing bookings are never repriced: they hold snapshots.
 */
export async function updateService(tx: Tx, ctx: TenantContext, id: string, input: ServiceInput, expectedVersion: number) {
  requireCap(ctx, 'catalog.manage');
  const [cur] = await tx<{ priceMinor: number; version: number; status: string }[]>`select price_minor, version, status from services where id = ${id} for update`;
  if (!cur) throw notFound('service');
  if (cur.version !== expectedVersion) throw new AppError('version_conflict', 'errors.version_conflict', { currentVersion: cur.version });
  let price = input.priceMinor;
  let proposal: string | null = null;
  if (price !== cur.priceMinor) {
    if (ctx.caps.has('catalog.price.approve')) {
      await tx`update service_price_changes set status = 'superseded' where service_id = ${id} and status = 'pending'`;
      await tx`insert into service_price_changes (tenant_id, service_id, current_price_minor, proposed_price_minor, status, proposed_by, decided_by, decided_at)
               values (${ctx.tenant.id}, ${id}, ${cur.priceMinor}, ${price}, 'approved', ${ctx.user.userId}, ${ctx.user.userId}, now())`;
    } else {
      const [p] = await tx<{ id: string }[]>`insert into service_price_changes (tenant_id, service_id, current_price_minor, proposed_price_minor, proposed_by)
               values (${ctx.tenant.id}, ${id}, ${cur.priceMinor}, ${price}, ${ctx.user.userId}) returning id`;
      proposal = p.id;
      price = cur.priceMinor;
    }
  }
  await tx`
    update services set branch_id = ${input.branchId ?? null}, category_id = ${input.categoryId ?? null}, name = ${input.name},
      name_en = ${input.nameEn ?? null}, description = ${input.description ?? null}, description_en = ${input.descriptionEn ?? null},
      price_minor = ${price}, price_is_from = ${input.priceIsFrom}, duration_min = ${input.durationMin},
      buffer_before_min = ${input.bufferBeforeMin}, buffer_after_min = ${input.bufferAfterMin}, image_asset_id = ${input.imageAssetId ?? null},
      is_visible = ${input.isVisible}, internal_booking_when_hidden = ${input.internalBookingWhenHidden},
      min_notice_min = ${input.minNoticeMin ?? null}, max_advance_days = ${input.maxAdvanceDays ?? null},
      group_capacity = ${input.groupCapacity ?? null}, material_cost_minor = ${input.materialCostMinor ?? null},
      version = version + 1, updated_at = now()
    where id = ${id}`;
  await writeChildren(tx, ctx, id, input);
  await audit(tx, { ...act(ctx), action: 'service.updated', targetType: 'service', targetId: id, metadata: { priceProposal: proposal, priceMinor: price } });
  return { id, version: cur.version + 1, pricePendingApproval: proposal !== null };
}

export async function decidePriceChange(tx: Tx, ctx: TenantContext, changeId: string, approve: boolean) {
  requireCap(ctx, 'catalog.price.approve');
  const [c] = await tx<{ serviceId: string; proposedPriceMinor: number }[]>`
    update service_price_changes set status = ${approve ? 'approved' : 'rejected'}, decided_by = ${ctx.user.userId}, decided_at = now()
    where id = ${changeId} and status = 'pending' returning service_id, proposed_price_minor`;
  if (!c) throw notFound('price_change');
  if (approve) await tx`update services set price_minor = ${c.proposedPriceMinor}, version = version + 1, updated_at = now() where id = ${c.serviceId}`;
  await audit(tx, { ...act(ctx), action: approve ? 'service.price_approved' : 'service.price_rejected', targetType: 'service', targetId: c.serviceId, metadata: { priceMinor: c.proposedPriceMinor } });
}

export async function setServiceStatus(tx: Tx, ctx: TenantContext, id: string, status: 'active' | 'inactive' | 'archived') {
  requireCap(ctx, 'catalog.manage');
  const r = await tx`update services set status = ${status}, version = version + 1, updated_at = now() where id = ${id} returning id`;
  if (!r.length) throw notFound('service');
  await audit(tx, { ...act(ctx), action: `service.${status}`, targetType: 'service', targetId: id });
}

export async function reorderServices(tx: Tx, ids: string[]) {
  let i = 0;
  for (const id of ids) await tx`update services set sort = ${i++} where id = ${id}`;
}

// ── categories ──
export async function listCategories(tx: Tx, kind: 'service' | 'product', includeArchived = false) {
  return tx`select id, kind, name, name_en, sort, status,
              (select count(*)::int from services s where s.category_id = c.id and s.status <> 'archived') as service_count,
              (select count(*)::int from products p where p.category_id = c.id and p.status <> 'archived') as product_count
            from categories c where kind = ${kind} and (${includeArchived} or status <> 'archived') order by sort, name`;
}

export async function createCategory(tx: Tx, ctx: TenantContext, input: z.infer<typeof categoryInput>) {
  requireCap(ctx, 'catalog.manage');
  const [c] = await tx<{ id: string }[]>`
    insert into categories (tenant_id, kind, name, name_en, sort)
    values (${ctx.tenant.id}, ${input.kind}, ${input.name}, ${input.nameEn ?? null},
            (select coalesce(max(sort), 0) + 1 from categories where kind = ${input.kind}))
    returning id`;
  await audit(tx, { ...act(ctx), action: 'category.created', targetType: 'category', targetId: c.id });
  return c;
}

/** Hiding a category hides its items publicly without deleting them or their history. */
export async function updateCategory(tx: Tx, ctx: TenantContext, id: string, patch: { name?: string; nameEn?: string | null; status?: 'active' | 'hidden' | 'archived' }) {
  requireCap(ctx, 'catalog.manage');
  const r = await tx`update categories set name = coalesce(${patch.name ?? null}, name), name_en = ${patch.nameEn === undefined ? tx`name_en` : patch.nameEn},
                     status = coalesce(${patch.status ?? null}, status), updated_at = now() where id = ${id} returning id`;
  if (!r.length) throw notFound('category');
  await audit(tx, { ...act(ctx), action: 'category.updated', targetType: 'category', targetId: id, metadata: patch });
}

export async function reorderCategories(tx: Tx, ids: string[]) {
  let i = 0;
  for (const id of ids) await tx`update categories set sort = ${i++} where id = ${id}`;
}

// ── packages ──
export async function listPackages(tx: Tx) {
  return tx`select p.*, coalesce(json_agg(json_build_object('serviceId', i.service_id, 'quantity', i.quantity, 'name', s.name)
              order by i.sort) filter (where i.service_id is not null), '[]') as items
            from packages p left join package_items i on i.package_id = p.id left join services s on s.id = i.service_id
            where p.status <> 'archived' group by p.id order by p.created_at`;
}

export async function upsertPackage(tx: Tx, ctx: TenantContext, input: z.infer<typeof packageInput>, id?: string) {
  requireCap(ctx, 'catalog.manage');
  let pid = id;
  if (pid) {
    const r = await tx`update packages set name = ${input.name}, name_en = ${input.nameEn ?? null}, description = ${input.description ?? null},
                       price_minor = ${input.priceMinor} where id = ${pid} returning id`;
    if (!r.length) throw notFound('package');
    await tx`delete from package_items where package_id = ${pid}`;
  } else {
    const [p] = await tx<{ id: string }[]>`insert into packages (tenant_id, name, name_en, description, price_minor)
      values (${ctx.tenant.id}, ${input.name}, ${input.nameEn ?? null}, ${input.description ?? null}, ${input.priceMinor}) returning id`;
    pid = p.id;
  }
  let sort = 0;
  for (const it of input.items) {
    await tx`insert into package_items (tenant_id, package_id, service_id, quantity, sort) values (${ctx.tenant.id}, ${pid}, ${it.serviceId}, ${it.quantity}, ${sort++})`;
  }
  await audit(tx, { ...act(ctx), action: id ? 'package.updated' : 'package.created', targetType: 'package', targetId: pid });
  return { id: pid };
}

export async function setPackageStatus(tx: Tx, ctx: TenantContext, id: string, status: 'active' | 'hidden' | 'archived') {
  requireCap(ctx, 'catalog.manage');
  const r = await tx`update packages set status = ${status} where id = ${id} returning id`;
  if (!r.length) throw notFound('package');
  await audit(tx, { ...act(ctx), action: `package.${status}`, targetType: 'package', targetId: id });
}

/**
 * Resolve price & duration for (service, variant?, staff?):
 * most specific wins — variant+staff > staff > variant > base.
 */
export async function resolvePricing(tx: Tx, serviceId: string, variantId: string | null, staffId: string | null) {
  const [s] = await tx<{ priceMinor: number; durationMin: number }[]>`select price_minor, duration_min from services where id = ${serviceId}`;
  if (!s) throw notFound('service');
  let price = s.priceMinor;
  let dur = s.durationMin;
  if (variantId) {
    const [v] = await tx<{ priceMinor: number; durationMin: number }[]>`select price_minor, duration_min from service_variants where id = ${variantId} and service_id = ${serviceId} and status = 'active'`;
    if (!v) throw new AppError('validation', 'errors.invalid_reference');
    price = v.priceMinor;
    dur = v.durationMin;
  }
  const rules = await tx<{ variantId: string | null; staffId: string | null; priceMinor: number | null; durationMin: number | null }[]>`
    select variant_id, staff_id, price_minor, duration_min from service_price_rules where service_id = ${serviceId}`;
  const score = (r: { variantId: string | null; staffId: string | null }) =>
    (r.variantId && r.variantId === variantId ? 1 : r.variantId ? -99 : 0) + (r.staffId && r.staffId === staffId ? 2 : r.staffId ? -99 : 0);
  for (const r of rules.filter((x) => score(x) > 0).sort((a, b) => score(a) - score(b))) {
    if (r.priceMinor != null) price = r.priceMinor;
    if (r.durationMin != null) dur = r.durationMin;
  }
  return { priceMinor: price, durationMin: dur };
}

// ── resources (rooms, chairs, devices) ──
export async function listResources(tx: Tx) {
  const types = await tx`select t.id, t.name, (select count(*)::int from resources r where r.resource_type_id = t.id and r.status = 'active') as count from resource_types t order by t.name`;
  const resources = await tx`select r.id, r.name, r.status, r.branch_id, r.resource_type_id, b.name as branch_name
                             from resources r join branches b on b.id = r.branch_id order by r.status, r.name`;
  return { types, resources };
}

export async function createResourceType(tx: Tx, ctx: TenantContext, name: string) {
  requireCap(ctx, 'catalog.manage');
  const [r] = await tx<{ id: string }[]>`insert into resource_types (tenant_id, name) values (${ctx.tenant.id}, ${name}) returning id`;
  await audit(tx, { ...act(ctx), action: 'resource_type.created', targetType: 'resource_type', targetId: r.id });
  return r;
}

export async function createResource(tx: Tx, ctx: TenantContext, input: { name: string; branchId: string; resourceTypeId: string }) {
  requireCap(ctx, 'catalog.manage');
  const [r] = await tx<{ id: string }[]>`insert into resources (tenant_id, branch_id, resource_type_id, name)
    values (${ctx.tenant.id}, ${input.branchId}, ${input.resourceTypeId}, ${input.name}) returning id`;
  await audit(tx, { ...act(ctx), action: 'resource.created', targetType: 'resource', targetId: r.id });
  return r;
}

/** Archiving a resource keeps historical allocations; it simply stops being allocated. */
export async function updateResource(tx: Tx, ctx: TenantContext, id: string, patch: { name?: string; status?: 'active' | 'archived' }) {
  requireCap(ctx, 'catalog.manage');
  const r = await tx`update resources set name = coalesce(${patch.name ?? null}, name), status = coalesce(${patch.status ?? null}, status) where id = ${id} returning id`;
  if (!r.length) throw notFound('resource');
  await audit(tx, { ...act(ctx), action: 'resource.updated', targetType: 'resource', targetId: id, metadata: patch });
}
