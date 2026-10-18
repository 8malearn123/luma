import { z } from 'zod';
import type { Tx } from '../db';
import { AppError, forbidden, notFound } from '../errors';
import { audit } from '../audit';
import { notifyUser } from '../services/notifications';
import type { TenantContext } from '../tenancy/context';

/**
 * Delivery for product orders.
 *  - A business enables delivery and defines zones (cities/districts → fee,
 *    free-over threshold, minimum order, ETA). Pickup stays available unless
 *    switched off; at least one method is always on.
 *  - The customer picks an address from her central address book; the order
 *    keeps a SNAPSHOT (later edits never change a placed order).
 *  - The fee is computed on the server from the zone; the browser only shows it.
 *  - Stages: pending → ready → out_for_delivery → delivered (→ order collected)
 *    with failed_attempt → out_for_delivery | ready. Every stage is a
 *    fulfillment_events row (timeline visible to the customer).
 * No courier integration exists: courier name / tracking ref / tracking URL
 * are entered by staff. Nothing is sent to a courier.
 */

export interface CommerceSettings {
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  cashOnDelivery: boolean;
  deliveryInstructions: string | null;
  returnsEnabled: boolean;
  returnWindowDays: number;
  returnPolicyText: string | null;
  returnShippingPaidBy: 'customer' | 'business';
  refundDeliveryFee: boolean;
}

export const DEFAULT_COMMERCE: CommerceSettings = {
  pickupEnabled: true,
  deliveryEnabled: false,
  cashOnDelivery: false,
  deliveryInstructions: null,
  returnsEnabled: false,
  returnWindowDays: 7,
  returnPolicyText: null,
  returnShippingPaidBy: 'customer',
  refundDeliveryFee: false,
};

export async function commerceSettings(tx: Tx): Promise<CommerceSettings> {
  const [s] = await tx<CommerceSettings[]>`select pickup_enabled, delivery_enabled, cash_on_delivery, delivery_instructions, returns_enabled,
      return_window_days, return_policy_text, return_shipping_paid_by, refund_delivery_fee from commerce_settings`;
  return s ?? DEFAULT_COMMERCE;
}

export const commerceSettingsInput = z
  .object({
    pickupEnabled: z.boolean(),
    deliveryEnabled: z.boolean(),
    cashOnDelivery: z.boolean(),
    deliveryInstructions: z.string().trim().max(1000).nullable(),
    returnsEnabled: z.boolean(),
    returnWindowDays: z.number().int().min(0).max(90),
    returnPolicyText: z.string().trim().max(4000).nullable(),
    returnShippingPaidBy: z.enum(['customer', 'business']),
    refundDeliveryFee: z.boolean(),
  })
  .refine((v) => v.pickupEnabled || v.deliveryEnabled, { path: ['pickupEnabled'], message: 'errors.one_fulfillment_required' })
  .refine((v) => !v.returnsEnabled || !!v.returnPolicyText?.trim(), { path: ['returnPolicyText'], message: 'errors.return_policy_required' });

export async function updateCommerceSettings(tx: Tx, ctx: TenantContext, p: z.infer<typeof commerceSettingsInput>) {
  if (p.deliveryEnabled) {
    const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from delivery_zones where is_active`;
    if (!n) throw new AppError('validation', 'errors.delivery_zone_required', { field: 'deliveryEnabled' });
  }
  await tx`insert into commerce_settings (tenant_id, pickup_enabled, delivery_enabled, cash_on_delivery, delivery_instructions, returns_enabled,
             return_window_days, return_policy_text, return_shipping_paid_by, refund_delivery_fee, updated_by)
           values (${ctx.tenant.id}, ${p.pickupEnabled}, ${p.deliveryEnabled}, ${p.cashOnDelivery}, ${p.deliveryInstructions || null}, ${p.returnsEnabled},
             ${p.returnWindowDays}, ${p.returnPolicyText || null}, ${p.returnShippingPaidBy}, ${p.refundDeliveryFee}, ${ctx.user.userId})
           on conflict (tenant_id) do update set pickup_enabled = excluded.pickup_enabled, delivery_enabled = excluded.delivery_enabled,
             cash_on_delivery = excluded.cash_on_delivery, delivery_instructions = excluded.delivery_instructions, returns_enabled = excluded.returns_enabled,
             return_window_days = excluded.return_window_days, return_policy_text = excluded.return_policy_text,
             return_shipping_paid_by = excluded.return_shipping_paid_by, refund_delivery_fee = excluded.refund_delivery_fee,
             updated_by = excluded.updated_by, updated_at = now()`;
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: 'commerce_settings.updated', requestId: ctx.requestId, metadata: { delivery: p.deliveryEnabled, pickup: p.pickupEnabled, returns: p.returnsEnabled } });
}

// ── zones ──
const cityList = z.array(z.string().trim().min(1).max(80)).min(1).max(30);
export const zoneInput = z
  .object({
    branchId: z.string().uuid(),
    name: z.string().trim().min(1).max(80),
    cities: cityList,
    districts: z.array(z.string().trim().min(1).max(80)).max(60).default([]),
    feeMinor: z.number().int().min(0).max(100000),
    freeOverMinor: z.number().int().min(1).max(10_000_000).nullable(),
    minOrderMinor: z.number().int().min(0).max(10_000_000),
    etaMinHours: z.number().int().min(1).max(720),
    etaMaxHours: z.number().int().min(1).max(720),
    isActive: z.boolean(),
  })
  .refine((v) => v.etaMaxHours >= v.etaMinHours, { path: ['etaMaxHours'], message: 'errors.time_range_invalid' });

export async function listZones(tx: Tx) {
  return tx`select z.id, z.branch_id, b.name as branch_name, z.name, z.cities, z.districts, z.fee_minor, z.free_over_minor, z.min_order_minor,
              z.eta_min_hours, z.eta_max_hours, z.is_active, z.sort_order
            from delivery_zones z join branches b on b.id = z.branch_id order by z.sort_order, z.name`;
}

export async function upsertZone(tx: Tx, ctx: TenantContext, p: z.infer<typeof zoneInput>, id?: string) {
  const [br] = await tx`select 1 from branches where id = ${p.branchId} and status = 'active'`;
  if (!br) throw new AppError('validation', 'errors.invalid_reference', { field: 'branchId' });
  const norm = (a: string[]) => [...new Set(a.map((x) => x.trim()))];
  let zoneId = id;
  if (id) {
    const r = await tx`update delivery_zones set branch_id = ${p.branchId}, name = ${p.name}, cities = ${norm(p.cities)}, districts = ${norm(p.districts)},
                         fee_minor = ${p.feeMinor}, free_over_minor = ${p.freeOverMinor}, min_order_minor = ${p.minOrderMinor},
                         eta_min_hours = ${p.etaMinHours}, eta_max_hours = ${p.etaMaxHours}, is_active = ${p.isActive}, updated_at = now()
                       where id = ${id} returning id`;
    if (!r.length) throw notFound('delivery_zone');
  } else {
    const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from delivery_zones`;
    if (n >= 50) throw new AppError('validation', 'errors.limit_reached', { limit: 50 });
    const [z] = await tx<{ id: string }[]>`insert into delivery_zones (tenant_id, branch_id, name, cities, districts, fee_minor, free_over_minor, min_order_minor, eta_min_hours, eta_max_hours, is_active, sort_order)
      values (${ctx.tenant.id}, ${p.branchId}, ${p.name}, ${norm(p.cities)}, ${norm(p.districts)}, ${p.feeMinor}, ${p.freeOverMinor}, ${p.minOrderMinor},
              ${p.etaMinHours}, ${p.etaMaxHours}, ${p.isActive}, ${n}) returning id`;
    zoneId = z.id;
  }
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: id ? 'delivery_zone.updated' : 'delivery_zone.created', targetType: 'delivery_zone', targetId: zoneId!, requestId: ctx.requestId, metadata: { feeMinor: p.feeMinor } });
  return { id: zoneId! };
}

export async function archiveZone(tx: Tx, ctx: TenantContext, id: string) {
  const r = await tx`update delivery_zones set is_active = false, updated_at = now() where id = ${id} returning id`;
  if (!r.length) throw notFound('delivery_zone');
  const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from delivery_zones where is_active`;
  if (!n) await tx`update commerce_settings set delivery_enabled = false, pickup_enabled = true, updated_at = now()`;
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: 'delivery_zone.deactivated', targetType: 'delivery_zone', targetId: id, requestId: ctx.requestId });
}

// ── address book (central account) ──
export const addressInput = z.object({
  label: z.string().trim().max(40).nullable().optional(),
  recipientName: z.string().trim().min(1).max(120),
  phone: z.string().trim().regex(/^\+[1-9][0-9]{7,14}$/, 'errors.phone_invalid'),
  city: z.string().trim().min(1).max(80),
  district: z.string().trim().max(80).nullable().optional(),
  street: z.string().trim().min(1).max(200),
  buildingNo: z.string().trim().max(20).nullable().optional(),
  postalCode: z.string().trim().regex(/^[0-9]{5}$/, 'errors.postal_invalid').nullable().optional().or(z.literal('').transform(() => null)),
  notes: z.string().trim().max(300).nullable().optional(),
  isDefault: z.boolean().default(false),
});
export type AddressInput = z.infer<typeof addressInput>;

export interface Address {
  id: string;
  label: string | null;
  recipientName: string;
  phone: string;
  city: string;
  district: string | null;
  street: string;
  buildingNo: string | null;
  postalCode: string | null;
  notes: string | null;
  isDefault: boolean;
}

export async function listAddresses(tx: Tx, userId: string): Promise<Address[]> {
  return tx<Address[]>`select id, label, recipient_name, phone, city, district, street, building_no, postal_code, notes, is_default
            from customer_addresses where user_id = ${userId} order by is_default desc, created_at`;
}

export async function saveAddress(tx: Tx, userId: string, p: AddressInput, id?: string) {
  if (p.isDefault) await tx`update customer_addresses set is_default = false where user_id = ${userId} and is_default and id is distinct from ${id ?? null}::uuid`;
  if (id) {
    const r = await tx`update customer_addresses set label = ${p.label ?? null}, recipient_name = ${p.recipientName}, phone = ${p.phone}, city = ${p.city},
                         district = ${p.district ?? null}, street = ${p.street}, building_no = ${p.buildingNo ?? null}, postal_code = ${p.postalCode ?? null},
                         notes = ${p.notes ?? null}, is_default = ${p.isDefault}, updated_at = now() where id = ${id} and user_id = ${userId} returning id`;
    if (!r.length) throw notFound('address');
    return { id };
  }
  const [{ n }] = await tx<{ n: number }[]>`select count(*)::int as n from customer_addresses where user_id = ${userId}`;
  if (n >= 20) throw new AppError('validation', 'errors.limit_reached', { limit: 20 });
  const [a] = await tx<{ id: string }[]>`insert into customer_addresses (user_id, label, recipient_name, phone, city, district, street, building_no, postal_code, notes, is_default)
    values (${userId}, ${p.label ?? null}, ${p.recipientName}, ${p.phone}, ${p.city}, ${p.district ?? null}, ${p.street}, ${p.buildingNo ?? null},
            ${p.postalCode ?? null}, ${p.notes ?? null}, ${p.isDefault || n === 0}) returning id`;
  return a;
}

export async function deleteAddress(tx: Tx, userId: string, id: string) {
  const r = await tx`delete from customer_addresses where id = ${id} and user_id = ${userId} returning id`;
  if (!r.length) throw notFound('address');
}

// ── quoting ──
const fold = (s: string | null | undefined) => (s ?? '').trim().toLocaleLowerCase('ar').replace(/\s+/g, ' ');

interface ZoneRow {
  id: string;
  branchId: string;
  name: string;
  cities: string[];
  districts: string[];
  feeMinor: number;
  freeOverMinor: number | null;
  minOrderMinor: number;
  etaMinHours: number;
  etaMaxHours: number;
}

export type DeliveryQuote =
  | { ok: true; zoneId: string; zoneName: string; branchId: string; feeMinor: number; freeOverMinor: number | null; etaMinHours: number; etaMaxHours: number }
  | { ok: false; reason: 'not_covered' | 'below_minimum' | 'disabled'; minOrderMinor?: number };

/** Most specific active zone covering the address: a district match beats a whole-city zone. */
export async function quoteDelivery(tx: Tx, address: { city: string; district?: string | null }, subtotalAfterDiscountMinor: number): Promise<DeliveryQuote> {
  const s = await commerceSettings(tx);
  if (!s.deliveryEnabled) return { ok: false, reason: 'disabled' };
  const zones = await tx<ZoneRow[]>`select id, branch_id, name, cities, districts, fee_minor, free_over_minor, min_order_minor, eta_min_hours, eta_max_hours
                                    from delivery_zones where is_active order by sort_order, name`;
  const city = fold(address.city);
  const district = fold(address.district);
  const covering = zones.filter((z) => z.cities.some((c) => fold(c) === city) && (!z.districts.length || (district && z.districts.some((d) => fold(d) === district))));
  const zone = covering.find((z) => z.districts.length) ?? covering[0];
  if (!zone) return { ok: false, reason: 'not_covered' };
  if (subtotalAfterDiscountMinor < zone.minOrderMinor) return { ok: false, reason: 'below_minimum', minOrderMinor: zone.minOrderMinor };
  const free = zone.freeOverMinor != null && subtotalAfterDiscountMinor >= zone.freeOverMinor;
  return { ok: true, zoneId: zone.id, zoneName: zone.name, branchId: zone.branchId, feeMinor: free ? 0 : zone.feeMinor, freeOverMinor: zone.freeOverMinor, etaMinHours: zone.etaMinHours, etaMaxHours: zone.etaMaxHours };
}

/** What is stored on the order: the delivery destination only (no account ids). */
export function addressSnapshot(a: Address) {
  return { recipientName: a.recipientName, phone: a.phone, city: a.city, district: a.district, street: a.street, buildingNo: a.buildingNo, postalCode: a.postalCode, notes: a.notes };
}

// ── delivery stages (staff) ──
const STAGES: Record<string, string[]> = {
  pending: ['ready'],
  ready: ['out_for_delivery'],
  out_for_delivery: ['delivered', 'failed_attempt'],
  failed_attempt: ['out_for_delivery', 'ready'],
};

export const deliveryUpdateInput = z.object({
  status: z.enum(['ready', 'out_for_delivery', 'failed_attempt', 'delivered']),
  courierName: z.string().trim().max(80).nullable().optional(),
  trackingRef: z.string().trim().max(80).nullable().optional(),
  trackingUrl: z.string().trim().max(500).regex(/^https:\/\/\S{4,}$/, 'errors.https_url_required').nullable().optional().or(z.literal('').transform(() => null)),
  note: z.string().trim().max(500).optional(),
});

export async function updateDelivery(tx: Tx, ctx: TenantContext, orderId: string, p: z.infer<typeof deliveryUpdateInput>) {
  if (!ctx.caps.has('orders.manage')) throw forbidden();
  const [o] = await tx<{ id: string; tenantId: string; status: string; fulfillmentMethod: string; paidMinor: number; totalMinor: number; customerUserId: string | null; number: string }[]>`
    select id, tenant_id, status, fulfillment_method, paid_minor, total_minor, customer_user_id, number from orders where id = ${orderId} for update`;
  if (!o) throw notFound('order');
  if (o.fulfillmentMethod !== 'delivery') throw new AppError('invalid_transition', 'errors.not_a_delivery_order');
  const [f] = await tx<{ status: string; attempts: number }[]>`select status, attempts from fulfillments where order_id = ${orderId} for update`;
  if (!f) throw notFound('fulfillment');
  if (!(STAGES[f.status] ?? []).includes(p.status)) throw new AppError('invalid_transition', 'errors.invalid_transition', { from: f.status, to: p.status });
  if (p.status === 'failed_attempt' && !p.note?.trim()) throw new AppError('validation', 'errors.reason_required', { field: 'note' });

  const { transitionOrder } = await import('./orders');
  if (p.status === 'ready') {
    // same rules as pickup "ready" (paid, or cash on delivery); back from a failed attempt it is already ready
    if (o.status !== 'ready') await transitionOrder(tx, ctx, orderId, 'ready', undefined, { viaDelivery: true });
    else await tx`update fulfillments set status = 'ready' where order_id = ${orderId}`;
  } else if (p.status === 'out_for_delivery') {
    if (!['ready'].includes(o.status)) throw new AppError('invalid_transition', 'errors.invalid_transition', { from: o.status, to: 'out_for_delivery' });
    await tx`update fulfillments set status = 'out_for_delivery', dispatched_at = coalesce(dispatched_at, now()), attempts = attempts + 1,
               courier_name = coalesce(${p.courierName ?? null}, courier_name), tracking_ref = coalesce(${p.trackingRef ?? null}, tracking_ref),
               tracking_url = coalesce(${p.trackingUrl ?? null}, tracking_url) where order_id = ${orderId}`;
  } else if (p.status === 'failed_attempt') {
    await tx`update fulfillments set status = 'failed_attempt' where order_id = ${orderId}`;
  } else {
    // delivered = handed over: same stock/finance effects as a pickup collection
    await transitionOrder(tx, ctx, orderId, 'collected', undefined, { viaDelivery: true });
    await tx`update fulfillments set status = 'delivered', delivered_at = now() where order_id = ${orderId}`;
  }
  await tx`insert into fulfillment_events (tenant_id, order_id, status, note, actor_user_id) values (${o.tenantId}, ${orderId}, ${p.status}, ${p.note?.trim() || null}, ${ctx.user.userId})`;
  if (o.customerUserId && (p.status === 'out_for_delivery' || p.status === 'delivered' || p.status === 'failed_attempt')) {
    await notifyUser(tx, o.customerUserId, o.tenantId, { type: `order.${p.status}`, title: `order.notice_${p.status}`, body: o.number, targetPath: `/account/orders/${orderId}`, dedupeKey: `ord-${p.status}:${orderId}:${f.attempts}` });
  }
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: o.tenantId, action: `delivery.${p.status}`, targetType: 'order', targetId: orderId, requestId: ctx.requestId, reason: p.note });
  return { status: p.status };
}

export async function deliveryTimeline(tx: Tx, orderId: string) {
  return tx`select status, note, created_at from fulfillment_events where order_id = ${orderId} order by created_at`;
}

/** Staff delivery board: active delivery orders grouped by stage. */
export async function deliveryBoard(tx: Tx) {
  return tx`select o.id, o.number, o.status as order_status, o.total_minor, o.paid_minor, o.payment_terms, o.delivery_fee_minor, o.delivery_address, o.created_at,
              f.status, f.courier_name, f.tracking_ref, f.tracking_url, f.dispatched_at, f.attempts, z.name as zone_name, tc.display_name as customer_name
            from orders o join fulfillments f on f.order_id = o.id join tenant_customers tc on tc.id = o.tenant_customer_id
            left join delivery_zones z on z.id = o.delivery_zone_id
            where o.tenant_id = app.tenant_id() and o.fulfillment_method = 'delivery' and o.status not in ('cancelled','draft')
              and (f.status <> 'delivered' or f.delivered_at > now() - interval '3 days')
            order by o.created_at desc limit 200`;
}
