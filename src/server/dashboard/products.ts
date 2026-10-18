import { z } from 'zod';
import type { Tx } from '../db';
import { AppError, notFound } from '../errors';
import { audit } from '../audit';
import type { TenantContext } from '../tenancy/context';
import { entitlements, requireFeature } from '../tenancy/plan';

const uuid = z.string().uuid();
export const productInput = z.object({
  name: z.string().trim().min(1).max(160),
  nameEn: z.string().trim().max(160).nullable().optional(),
  description: z.string().max(4000).nullable().optional(),
  descriptionEn: z.string().max(4000).nullable().optional(),
  categoryId: uuid.nullable().optional(),
  sku: z.string().trim().max(60).nullable().optional(),
  barcode: z.string().trim().max(60).nullable().optional(),
  priceMinor: z.number().int().min(0).max(100_000_000),
  costMinor: z.number().int().min(0).max(100_000_000).nullable().optional(),
  isVisible: z.boolean().default(true),
  hideWhenOutOfStock: z.boolean().default(false),
  maxPerOrder: z.number().int().min(1).max(100).default(10),
  returnable: z.boolean().default(false),
  imageAssetIds: z.array(uuid).max(10).default([]),
  variants: z
    .array(z.object({ id: uuid.optional(), name: z.string().trim().min(1).max(80), nameEn: z.string().max(80).nullable().optional(), sku: z.string().max(60).nullable().optional(), priceMinor: z.number().int().min(0).nullable().optional(), costMinor: z.number().int().min(0).nullable().optional() }))
    .max(30)
    .default([]),
});
export type ProductInput = z.infer<typeof productInput>;

const act = (ctx: TenantContext) => ({ actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, requestId: ctx.requestId });

export async function listProducts(tx: Tx, opts: { q?: string; status?: string; showCost: boolean; offset?: number; limit?: number }) {
  const limit = Math.min(opts.limit ?? 50, 100);
  const like = opts.q ? `%${opts.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%` : null;
  const rows = await tx<Record<string, unknown>[]>`
    select p.id, p.name, p.name_en, p.sku, p.price_minor, p.cost_minor, p.status, p.is_visible, p.version, c.name as category_name,
      coalesce((select sum(i.on_hand - i.reserved) from inventory_items i where i.product_id = p.id and i.status = 'active'), 0)::float as available,
      (select asset_id from product_images pi where pi.product_id = p.id order by sort limit 1) as image_asset_id
    from products p left join categories c on c.id = p.category_id
    where (${opts.status ?? null}::text is null and p.status <> 'archived' or p.status = ${opts.status ?? null})
      and (${like}::text is null or p.name ilike ${like} or p.sku ilike ${like} or p.barcode ilike ${like})
    order by p.sort, p.name limit ${limit + 1} offset ${opts.offset ?? 0}`;
  if (!opts.showCost) for (const r of rows) delete r.costMinor;
  return { items: rows.slice(0, limit), hasMore: rows.length > limit };
}

export async function getProduct(tx: Tx, id: string, showCost: boolean) {
  const [p] = await tx<Record<string, unknown>[]>`select * from products where id = ${id}`;
  if (!p) throw notFound('product');
  const variants = await tx<Record<string, unknown>[]>`select id, name, name_en, sku, price_minor, cost_minor, status from product_variants where product_id = ${id} and status = 'active' order by name`;
  const images = await tx`select asset_id, sort from product_images where product_id = ${id} order by sort`;
  const inventory = await tx`select i.id, i.branch_id, b.name as branch_name, i.variant_id, i.on_hand, i.reserved, i.low_stock_threshold, i.unit
                             from inventory_items i join branches b on b.id = i.branch_id where i.product_id = ${id} and i.status = 'active'`;
  if (!showCost) {
    delete p.costMinor;
    for (const v of variants) delete v.costMinor;
  }
  return { product: p, variants, images, inventory };
}

async function writeChildren(tx: Tx, ctx: TenantContext, id: string, input: ProductInput) {
  await tx`delete from product_images where product_id = ${id}`;
  let s = 0;
  for (const a of [...new Set(input.imageAssetIds)]) await tx`insert into product_images (tenant_id, product_id, asset_id, sort) values (${ctx.tenant.id}, ${id}, ${a}, ${s++})`;
  const keep = input.variants.filter((v) => v.id).map((v) => v.id!) as string[];
  await tx`update product_variants set status = 'archived' where product_id = ${id} and status = 'active' and not (id = any(${keep}::uuid[]))`;
  for (const v of input.variants) {
    if (v.id) {
      const r = await tx`update product_variants set name = ${v.name}, name_en = ${v.nameEn ?? null}, sku = ${v.sku ?? null}, price_minor = ${v.priceMinor ?? null}, cost_minor = ${v.costMinor ?? null}
                         where id = ${v.id} and product_id = ${id} returning id`;
      if (!r.length) throw new AppError('validation', 'errors.invalid_reference');
    } else {
      await tx`insert into product_variants (tenant_id, product_id, name, name_en, sku, price_minor, cost_minor) values (${ctx.tenant.id}, ${id}, ${v.name}, ${v.nameEn ?? null}, ${v.sku ?? null}, ${v.priceMinor ?? null}, ${v.costMinor ?? null})`;
    }
  }
}

export async function createProduct(tx: Tx, ctx: TenantContext, input: ProductInput) {
  requireFeature(await entitlements(tx, ctx.tenant.id), 'products.enabled');
  const [p] = await tx<{ id: string }[]>`
    insert into products (tenant_id, category_id, sku, barcode, name, name_en, description, description_en, price_minor, cost_minor, is_visible,
      hide_when_out_of_stock, max_per_order, returnable, sort)
    values (${ctx.tenant.id}, ${input.categoryId ?? null}, ${input.sku || null}, ${input.barcode || null}, ${input.name}, ${input.nameEn ?? null},
      ${input.description ?? null}, ${input.descriptionEn ?? null}, ${input.priceMinor}, ${input.costMinor ?? null}, ${input.isVisible},
      ${input.hideWhenOutOfStock}, ${input.maxPerOrder}, ${input.returnable}, (select coalesce(max(sort),0)+1 from products))
    returning id`;
  await writeChildren(tx, ctx, p.id, input);
  await audit(tx, { ...act(ctx), action: 'product.created', targetType: 'product', targetId: p.id });
  return p;
}

export async function updateProduct(tx: Tx, ctx: TenantContext, id: string, input: ProductInput, expectedVersion: number) {
  const [cur] = await tx<{ version: number }[]>`select version from products where id = ${id} for update`;
  if (!cur) throw notFound('product');
  if (cur.version !== expectedVersion) throw new AppError('version_conflict', 'errors.version_conflict');
  await tx`update products set category_id = ${input.categoryId ?? null}, sku = ${input.sku || null}, barcode = ${input.barcode || null}, name = ${input.name},
    name_en = ${input.nameEn ?? null}, description = ${input.description ?? null}, description_en = ${input.descriptionEn ?? null}, price_minor = ${input.priceMinor},
    cost_minor = ${input.costMinor ?? null}, is_visible = ${input.isVisible}, hide_when_out_of_stock = ${input.hideWhenOutOfStock},
    max_per_order = ${input.maxPerOrder}, returnable = ${input.returnable}, version = version + 1, updated_at = now() where id = ${id}`;
  await writeChildren(tx, ctx, id, input);
  await audit(tx, { ...act(ctx), action: 'product.updated', targetType: 'product', targetId: id, metadata: { priceMinor: input.priceMinor } });
  return { version: cur.version + 1 };
}

export async function setProductStatus(tx: Tx, ctx: TenantContext, id: string, status: 'active' | 'inactive' | 'archived') {
  const r = await tx`update products set status = ${status}, version = version + 1 where id = ${id} returning id`;
  if (!r.length) throw notFound('product');
  await audit(tx, { ...act(ctx), action: `product.${status}`, targetType: 'product', targetId: id });
}

export async function listOrders(tx: Tx, opts: { status?: string; q?: string; offset?: number; limit?: number }) {
  const limit = Math.min(opts.limit ?? 50, 100);
  const like = opts.q ? `%${opts.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%` : null;
  const rows = await tx`
    select o.id, o.number, o.status, o.refund_status, o.total_minor, o.paid_minor, o.payment_terms, o.fulfillment_method, o.created_at,
      tc.display_name as customer_name, (select count(*)::int from order_items i where i.order_id = o.id) as lines
    from orders o join tenant_customers tc on tc.id = o.tenant_customer_id
    where o.tenant_id = app.tenant_id() and (${opts.status ?? null}::text is null or o.status = ${opts.status ?? null})
      and (${like}::text is null or o.number ilike ${like} or tc.display_name ilike ${like})
    order by o.created_at desc limit ${limit + 1} offset ${opts.offset ?? 0}`;
  return { items: rows.slice(0, limit), hasMore: rows.length > limit };
}

export async function getOrder(tx: Tx, id: string) {
  const [o] = await tx<Record<string, unknown>[]>`select o.*, tc.display_name as customer_name, tc.phone as customer_phone
                      from orders o join tenant_customers tc on tc.id = o.tenant_customer_id where o.id = ${id} and o.tenant_id = app.tenant_id()`;
  if (!o) throw notFound('order');
  const items = await tx`select id, name, variant_name, unit_price_minor, quantity, line_total_minor, returned_qty from order_items where order_id = ${id}`;
  const payments = await tx`select id, kind, method, amount_minor, status, refunded_minor, provider, collection_ref, created_at from payments where order_id = ${id} order by created_at`;
  const [f] = await tx`select method, status, ready_at, collected_at from fulfillments where order_id = ${id}`;
  return { order: o, items, payments, fulfillment: f ?? null };
}
