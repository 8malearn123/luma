import { z } from 'zod';
import type { Tx } from '../db';
import { AppError, notFound } from '../errors';
import { audit } from '../audit';
import type { TenantContext } from '../tenancy/context';

/**
 * Operational inventory. Retail products and service materials share the
 * stock ledger (stock_movements, append-only) but are distinguished by
 * inventory_items.usage. on_hand/reserved are updated in the same transaction
 * as the movement, under a row lock.
 */
const units = z.enum(['piece', 'ml', 'l', 'g', 'kg']);
export const itemInput = z.object({
  branchId: z.string().uuid(),
  usage: z.enum(['retail', 'material', 'both']),
  productId: z.string().uuid().nullable().optional(),
  variantId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(160),
  unit: units.default('piece'),
  lowStockThreshold: z.number().min(0).max(1_000_000).nullable().optional(),
  unitCostMinor: z.number().int().min(0).nullable().optional(),
});

export const movementInput = z.object({
  kind: z.enum(['receipt', 'adjustment', 'return']),
  /** signed for adjustments; positive for receipts/returns */
  quantity: z.number().min(-1_000_000).max(1_000_000).refine((n) => n !== 0, 'errors.quantity_zero'),
  reason: z.string().trim().min(3).max(300),
  unitCostMinor: z.number().int().min(0).nullable().optional(),
});

export const recipeInput = z.object({
  serviceId: z.string().uuid(),
  lines: z.array(z.object({ inventoryItemId: z.string().uuid(), quantity: z.number().positive().max(100000), unit: units })).max(30),
  approve: z.boolean().default(false),
});

const act = (ctx: TenantContext) => ({ actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, requestId: ctx.requestId });

export async function listItems(tx: Tx, opts: { branchId?: string; usage?: string; lowOnly?: boolean; showCost: boolean }) {
  const rows = await tx<Record<string, unknown>[]>`
    select i.id, i.branch_id, b.name as branch_name, i.usage, i.product_id, i.variant_id, i.name, i.unit, i.on_hand::float as on_hand,
      i.reserved::float as reserved, (i.on_hand - i.reserved)::float as available, i.low_stock_threshold::float as low_stock_threshold,
      i.unit_cost_minor, (i.low_stock_threshold is not null and i.on_hand - i.reserved <= i.low_stock_threshold) as low
    from inventory_items i join branches b on b.id = i.branch_id
    where i.status = 'active' and (${opts.branchId ?? null}::uuid is null or i.branch_id = ${opts.branchId ?? null}::uuid)
      and (${opts.usage ?? null}::text is null or i.usage = ${opts.usage ?? null} or i.usage = 'both')
    order by i.name`;
  const items = opts.lowOnly ? rows.filter((r) => r.low) : rows;
  if (!opts.showCost) for (const r of items) delete r.unitCostMinor;
  return items;
}

export async function createItem(tx: Tx, ctx: TenantContext, input: z.infer<typeof itemInput>) {
  if (input.usage !== 'material' && !input.productId) throw new AppError('validation', 'errors.product_required_for_retail');
  const [r] = await tx<{ id: string }[]>`
    insert into inventory_items (tenant_id, branch_id, usage, product_id, variant_id, name, unit, low_stock_threshold, unit_cost_minor)
    values (${ctx.tenant.id}, ${input.branchId}, ${input.usage}, ${input.productId ?? null}, ${input.variantId ?? null}, ${input.name}, ${input.unit},
            ${input.lowStockThreshold ?? null}, ${input.unitCostMinor ?? null}) returning id`;
  await audit(tx, { ...act(ctx), action: 'inventory.item_created', targetType: 'inventory_item', targetId: r.id });
  return r;
}

export async function updateItem(tx: Tx, ctx: TenantContext, id: string, p: { name?: string; lowStockThreshold?: number | null; unitCostMinor?: number | null; status?: 'active' | 'archived' }) {
  const r = await tx`update inventory_items set name = coalesce(${p.name ?? null}, name),
    low_stock_threshold = case when ${p.lowStockThreshold !== undefined} then ${p.lowStockThreshold ?? null}::numeric else low_stock_threshold end,
    unit_cost_minor = case when ${p.unitCostMinor !== undefined} then ${p.unitCostMinor ?? null}::bigint else unit_cost_minor end,
    status = coalesce(${p.status ?? null}, status), updated_at = now() where id = ${id} returning id`;
  if (!r.length) throw notFound('inventory_item');
  await audit(tx, { ...act(ctx), action: 'inventory.item_updated', targetType: 'inventory_item', targetId: id, metadata: p });
}

/** Receipt / return / manual adjustment. Never edits history; reason required. */
export async function recordMovement(tx: Tx, ctx: TenantContext, itemId: string, input: z.infer<typeof movementInput>) {
  const [i] = await tx<{ onHand: string; reserved: string }[]>`select on_hand, reserved from inventory_items where id = ${itemId} and status = 'active' for update`;
  if (!i) throw notFound('inventory_item');
  if (input.kind !== 'adjustment' && input.quantity < 0) throw new AppError('validation', 'errors.quantity_positive');
  const next = Number(i.onHand) + input.quantity;
  if (next < Number(i.reserved)) throw new AppError('insufficient_stock', 'errors.adjust_below_reserved', { reserved: Number(i.reserved) });
  await tx`update inventory_items set on_hand = on_hand + ${input.quantity},
           unit_cost_minor = coalesce(${input.kind === 'receipt' ? (input.unitCostMinor ?? null) : null}::bigint, unit_cost_minor), updated_at = now()
           where id = ${itemId}`;
  const [m] = await tx<{ id: string }[]>`
    insert into stock_movements (tenant_id, inventory_item_id, kind, on_hand_delta, reason, ref_type, actor_user_id)
    values (${ctx.tenant.id}, ${itemId}, ${input.kind}, ${input.quantity}, ${input.reason}, 'manual', ${ctx.user.userId}) returning id`;
  await audit(tx, { ...act(ctx), action: `inventory.${input.kind}`, targetType: 'inventory_item', targetId: itemId, reason: input.reason, metadata: { quantity: input.quantity } });
  return { movementId: m.id, onHand: next };
}

export async function movements(tx: Tx, itemId: string, limit = 100) {
  return tx`select m.id, m.kind, m.on_hand_delta::float as on_hand_delta, m.reserved_delta::float as reserved_delta, m.reason, m.ref_type, m.ref_id, m.created_at,
              u.display_name as actor_name
            from stock_movements m left join users u on u.id = m.actor_user_id where m.inventory_item_id = ${itemId} order by m.created_at desc limit ${limit}`;
}

export async function getRecipe(tx: Tx, serviceId: string) {
  return tx`select r.inventory_item_id, i.name, r.quantity::float as quantity, r.unit, i.unit as item_unit, r.approved_at
            from service_material_recipes r join inventory_items i on i.id = r.inventory_item_id where r.service_id = ${serviceId} order by i.name`;
}

export async function setRecipe(tx: Tx, ctx: TenantContext, input: z.infer<typeof recipeInput>) {
  await tx`delete from service_material_recipes where service_id = ${input.serviceId}`;
  for (const l of input.lines) {
    const [it] = await tx<{ usage: string }[]>`select usage from inventory_items where id = ${l.inventoryItemId}`;
    if (!it) throw new AppError('validation', 'errors.invalid_reference');
    if (it.usage === 'retail') throw new AppError('validation', 'errors.recipe_needs_material');
    await tx`insert into service_material_recipes (tenant_id, service_id, inventory_item_id, quantity, unit, approved_by, approved_at)
             values (${ctx.tenant.id}, ${input.serviceId}, ${l.inventoryItemId}, ${l.quantity}, ${l.unit},
                     ${input.approve ? ctx.user.userId : null}, ${input.approve ? new Date() : null})`;
  }
  await audit(tx, { ...act(ctx), action: input.approve ? 'recipe.approved' : 'recipe.saved', targetType: 'service', targetId: input.serviceId, metadata: { lines: input.lines.length } });
}

export interface CapacityEstimate {
  serviceId: string;
  status: 'estimated' | 'cannot_estimate';
  approxBookings: number | null;
  limitingItem: string | null;
  method: string;
  missing: string[];
}

/**
 * "Enough for approximately N bookings" = min over recipe lines of
 * floor(available ÷ quantity-per-booking), using APPROVED recipes only.
 * Without an approved recipe, stock or a valid unit conversion → cannot estimate.
 */
export async function capacityEstimate(tx: Tx, serviceId: string, branchId: string): Promise<CapacityEstimate> {
  const method = 'min over approved recipe lines of floor((on_hand − reserved) ÷ quantity per service), units converted via unit_conversions';
  const lines = await tx<{ name: string; quantity: string; unit: string; itemUnit: string; available: string; approvedAt: Date | null; branchId: string }[]>`
    select i.name, r.quantity, r.unit, i.unit as item_unit, (i.on_hand - i.reserved) as available, r.approved_at, i.branch_id
    from service_material_recipes r join inventory_items i on i.id = r.inventory_item_id where r.service_id = ${serviceId}`;
  const missing: string[] = [];
  if (!lines.length) missing.push('recipe');
  if (lines.some((l) => !l.approvedAt)) missing.push('recipe_approval');
  if (lines.some((l) => l.branchId !== branchId)) missing.push('branch_stock');
  let best: number | null = null;
  let limiting: string | null = null;
  for (const l of lines) {
    let factor = 1;
    if (l.unit !== l.itemUnit) {
      const [c] = await tx<{ factor: string }[]>`select factor from unit_conversions where from_unit = ${l.unit} and to_unit = ${l.itemUnit}`;
      if (!c) {
        missing.push(`unit_conversion:${l.name}`);
        continue;
      }
      factor = Number(c.factor);
    }
    const per = Number(l.quantity) * factor;
    const n = Math.floor(Math.max(0, Number(l.available)) / per);
    if (best === null || n < best) {
      best = n;
      limiting = l.name;
    }
  }
  if (missing.length || best === null) return { serviceId, status: 'cannot_estimate', approxBookings: null, limitingItem: null, method, missing };
  return { serviceId, status: 'estimated', approxBookings: best, limitingItem: limiting, method, missing };
}
