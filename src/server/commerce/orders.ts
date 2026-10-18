import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Tx } from '../db';
import { AppError, forbidden, notFound } from '../errors';
import { audit } from '../audit';
import { post } from '../finance/journal';
import { nextNumber } from '../booking/service';
import { activeAccount, createRefund } from '../payments/service';
import { notifyUser } from '../services/notifications';
import type { TenantContext } from '../tenancy/context';
import { entitlements, requireFeature, requireLive } from '../tenancy/plan';

/**
 * Carts, orders and stock reservations.
 *   stock_available = on_hand − reserved   (CHECK reserved ≤ on_hand; on_hand ≥ 0)
 * Reservation locks inventory rows FOR UPDATE in a stable (id) order, so two
 * concurrent orders for the last unit cannot both succeed. Release happens
 * exactly once (orders.stock_released_at + unique movement index).
 * One tenant per cart: a checkout never mixes financial beneficiaries.
 */
const ORDER_HOLD_MIN = 15;
const PAY_AT_PICKUP_HOLD_HOURS = 48;

export const cartLineInput = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().nullable().optional(),
  quantity: z.number().int().min(1).max(100),
});

export const anonKeyHash = (k: string) => createHash('sha256').update(`cart|${k}`).digest();

export async function getOrCreateCart(tx: Tx, tenantId: string, owner: { userId?: string | null; anonKey?: string | null }) {
  if (!owner.userId && !owner.anonKey) throw new AppError('validation', 'errors.validation');
  const found = owner.userId
    ? await tx<{ id: string }[]>`select id from carts where user_id = ${owner.userId} and status = 'open' and expires_at > now() order by created_at desc limit 1`
    : await tx<{ id: string }[]>`select id from carts where anon_key_hash = ${anonKeyHash(owner.anonKey!)} and status = 'open' and expires_at > now() limit 1`;
  if (found[0]) return found[0].id;
  const [c] = await tx<{ id: string }[]>`insert into carts (tenant_id, user_id, anon_key_hash) values (${tenantId}, ${owner.userId ?? null}, ${owner.anonKey ? anonKeyHash(owner.anonKey) : null}) returning id`;
  return c.id;
}

/** After sign-in: merge an anonymous cart into the account cart (same tenant). */
export async function adoptCart(tx: Tx, tenantId: string, anonKey: string, userId: string) {
  const [anon] = await tx<{ id: string }[]>`select id from carts where anon_key_hash = ${anonKeyHash(anonKey)} and status = 'open'`;
  if (!anon) return;
  const target = await getOrCreateCart(tx, tenantId, { userId });
  const lines = await tx<{ productId: string; variantId: string | null; quantity: number; seenPriceMinor: number }[]>`select product_id, variant_id, quantity, seen_price_minor from cart_items where cart_id = ${anon.id}`;
  for (const l of lines) {
    await tx`insert into cart_items (tenant_id, cart_id, product_id, variant_id, quantity, seen_price_minor)
             values (${tenantId}, ${target}, ${l.productId}, ${l.variantId}, ${l.quantity}, ${l.seenPriceMinor})
             on conflict (tenant_id, cart_id, product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))
             do update set quantity = least(cart_items.quantity + excluded.quantity, 100)`;
  }
  await tx`update carts set status = 'converted' where id = ${anon.id}`;
}

interface PricedLine {
  productId: string;
  variantId: string | null;
  name: string;
  variantName: string | null;
  quantity: number;
  unitPriceMinor: number;
  seenPriceMinor: number;
  priceChanged: boolean;
  lineTotalMinor: number;
  available: number;
  maxPerOrder: number;
  inventoryItemId: string | null;
  unitCostMinor: number | null;
  problem: null | 'unavailable' | 'insufficient_stock' | 'over_limit';
}

/** Server-side quote: re-reads price, visibility and stock. Never trusts the browser. */
export async function priceCart(tx: Tx, cartId: string, branchId: string): Promise<{ lines: PricedLine[]; subtotalMinor: number; priceChanged: boolean; ok: boolean }> {
  const rows = await tx<{
    productId: string; variantId: string | null; quantity: number; seenPriceMinor: number; name: string; status: string; isVisible: boolean;
    price: number; variantPrice: number | null; variantName: string | null; variantStatus: string | null; maxPerOrder: number;
    invId: string | null; onHand: string | null; reserved: string | null; cost: number | null; variantCost: number | null; invCost: number | null;
  }[]>`
    select ci.product_id, ci.variant_id, ci.quantity, ci.seen_price_minor, p.name, p.status, p.is_visible, p.price_minor as price,
      v.price_minor as variant_price, v.name as variant_name, v.status as variant_status, p.max_per_order,
      i.id as inv_id, i.on_hand, i.reserved, p.cost_minor as cost, v.cost_minor as variant_cost, i.unit_cost_minor as inv_cost
    from cart_items ci join products p on p.id = ci.product_id
    left join product_variants v on v.id = ci.variant_id
    left join inventory_items i on i.product_id = ci.product_id and i.branch_id = ${branchId} and i.status = 'active'
      and i.variant_id is not distinct from ci.variant_id
    where ci.cart_id = ${cartId} order by ci.id`;
  const lines = rows.map<PricedLine>((r) => {
    const unit = r.variantPrice ?? r.price;
    const available = r.invId ? Number(r.onHand) - Number(r.reserved) : 0;
    let problem: PricedLine['problem'] = null;
    if (r.status !== 'active' || !r.isVisible || (r.variantId && r.variantStatus !== 'active')) problem = 'unavailable';
    else if (!r.invId || available < r.quantity) problem = 'insufficient_stock';
    else if (r.quantity > r.maxPerOrder) problem = 'over_limit';
    return {
      productId: r.productId, variantId: r.variantId, name: r.name, variantName: r.variantName, quantity: r.quantity,
      unitPriceMinor: unit, seenPriceMinor: r.seenPriceMinor, priceChanged: unit !== r.seenPriceMinor, lineTotalMinor: unit * r.quantity,
      available: Math.max(0, Math.floor(available)), maxPerOrder: r.maxPerOrder, inventoryItemId: r.invId,
      unitCostMinor: r.variantCost ?? r.cost ?? r.invCost ?? null, problem,
    };
  });
  const subtotal = lines.reduce((n, l) => n + l.lineTotalMinor, 0);
  return { lines, subtotalMinor: subtotal, priceChanged: lines.some((l) => l.priceChanged), ok: lines.length > 0 && lines.every((l) => !l.problem) };
}

export async function setCartLine(tx: Tx, tenantId: string, cartId: string, line: z.infer<typeof cartLineInput>) {
  const [p] = await tx<{ id: string; status: string; isVisible: boolean; priceMinor: number; maxPerOrder: number }[]>`
    select id, status, is_visible, price_minor, max_per_order from products where id = ${line.productId}`;
  if (!p || p.status !== 'active' || !p.isVisible) throw notFound('product');
  let price = p.priceMinor;
  if (line.variantId) {
    const [v] = await tx<{ priceMinor: number | null; status: string }[]>`select price_minor, status from product_variants where id = ${line.variantId} and product_id = ${p.id}`;
    if (!v || v.status !== 'active') throw new AppError('validation', 'errors.invalid_reference');
    price = v.priceMinor ?? price;
  }
  if (line.quantity > p.maxPerOrder) throw new AppError('validation', 'errors.quantity_over_limit', { max: p.maxPerOrder });
  await tx`insert into cart_items (tenant_id, cart_id, product_id, variant_id, quantity, seen_price_minor)
           values (${tenantId}, ${cartId}, ${p.id}, ${line.variantId ?? null}, ${line.quantity}, ${price})
           on conflict (tenant_id, cart_id, product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))
           do update set quantity = excluded.quantity, seen_price_minor = excluded.seen_price_minor`;
  await tx`update carts set updated_at = now(), expires_at = now() + interval '7 days' where id = ${cartId}`;
}

export async function removeCartLine(tx: Tx, cartId: string, productId: string, variantId: string | null) {
  await tx`delete from cart_items where cart_id = ${cartId} and product_id = ${productId} and variant_id is not distinct from ${variantId}::uuid`;
}

async function reserve(tx: Tx, tenantId: string, orderId: string, lines: { inventoryItemId: string; quantity: number }[], expiresAt: Date) {
  const sorted = [...lines].sort((a, b) => a.inventoryItemId.localeCompare(b.inventoryItemId));
  for (const l of sorted) {
    const [inv] = await tx<{ onHand: string; reserved: string }[]>`select on_hand, reserved from inventory_items where id = ${l.inventoryItemId} for update`;
    if (!inv || Number(inv.onHand) - Number(inv.reserved) < l.quantity) throw new AppError('insufficient_stock', 'errors.insufficient_stock');
    await tx`update inventory_items set reserved = reserved + ${l.quantity}, updated_at = now() where id = ${l.inventoryItemId}`;
    await tx`insert into stock_reservations (tenant_id, inventory_item_id, order_id, quantity, expires_at)
             values (${tenantId}, ${l.inventoryItemId}, ${orderId}, ${l.quantity}, ${expiresAt})
             on conflict (tenant_id, order_id, inventory_item_id) do update set quantity = excluded.quantity, status = 'active', expires_at = excluded.expires_at, updated_at = now()`;
    await tx`insert into stock_movements (tenant_id, inventory_item_id, kind, reserved_delta, reason, ref_type, ref_id)
             values (${tenantId}, ${l.inventoryItemId}, 'reservation', ${l.quantity}, 'order checkout', 'order', ${orderId})
             on conflict do nothing`;
  }
}

export const checkoutInput = z.object({
  branchId: z.string().uuid(),
  acceptedSubtotalMinor: z.number().int().min(0),
  payAtPickup: z.boolean().default(false),
  bookingId: z.string().uuid().nullable().optional(),
  couponCode: z.string().trim().min(2).max(40).optional(),
});

/**
 * Creates an order from the cart: re-prices on the server, refuses if the
 * customer has not seen the current price, and reserves stock atomically.
 */
export async function checkoutCart(tx: Tx, tenantId: string, customer: { userId: string; tenantCustomerId: string; analyticsSession?: string | null }, cartId: string, input: z.infer<typeof checkoutInput>) {
  const ent = await entitlements(tx, tenantId);
  requireLive(ent);
  requireFeature(ent, 'products.enabled');
  const q = await priceCart(tx, cartId, input.branchId);
  if (!q.lines.length) throw new AppError('validation', 'errors.cart_empty');
  if (!q.ok) throw new AppError('conflict', 'errors.cart_has_problems', { lines: q.lines.filter((l) => l.problem).map((l) => ({ productId: l.productId, problem: l.problem, available: l.available })) });
  if (q.subtotalMinor !== input.acceptedSubtotalMinor) throw new AppError('conflict', 'errors.price_changed', { subtotalMinor: q.subtotalMinor });
  const acct = await activeAccount(tx, tenantId);
  const [pol] = await tx<{ allowOnSite: boolean }[]>`select allow_on_site from booking_policies limit 1`;
  let terms: 'full' | 'on_site';
  if (input.payAtPickup) {
    if (!pol?.allowOnSite) throw new AppError('payment_required', 'errors.terms_not_allowed');
    terms = 'on_site';
  } else {
    if (!acct) throw new AppError('unavailable', 'errors.payments_unavailable', { payAtPickupAllowed: !!pol?.allowOnSite });
    terms = 'full';
  }
  if (input.bookingId) {
    const [bk] = await tx`select 1 from bookings where id = ${input.bookingId} and customer_user_id = ${customer.userId} and status in ('held','pending_payment','confirmed')`;
    if (!bk) throw new AppError('validation', 'errors.invalid_reference');
  }
  let discount = 0;
  if (input.couponCode) {
    const { validateCoupon } = await import('../services/coupons');
    discount = Math.min(q.subtotalMinor, (await validateCoupon(tx, tenantId, input.couponCode, { totalMinor: q.subtotalMinor, tenantCustomerId: customer.tenantCustomerId })).discountMinor);
  }
  const total = q.subtotalMinor - discount;
  const number = await nextNumber(tx, tenantId, 'order', 'ORD');
  const expires = new Date(Date.now() + (terms === 'full' ? ORDER_HOLD_MIN * 60000 : PAY_AT_PICKUP_HOLD_HOURS * 3600000));
  const [o] = await tx<{ id: string }[]>`
    insert into orders (tenant_id, branch_id, number, tenant_customer_id, customer_user_id, status, booking_id, subtotal_minor, discount_minor, total_minor,
                        payment_terms, terms_snapshot, hold_expires_at, created_by)
    values (${tenantId}, ${input.branchId}, ${number}, ${customer.tenantCustomerId}, ${customer.userId}, 'pending_payment', ${input.bookingId ?? null},
            ${q.subtotalMinor}, ${discount}, ${total}, ${terms}, ${tx.json({ terms, holdMinutes: terms === 'full' ? ORDER_HOLD_MIN : PAY_AT_PICKUP_HOLD_HOURS * 60, analyticsSession: customer.analyticsSession && /^[a-f0-9-]{36}$/.test(customer.analyticsSession) ? customer.analyticsSession : null } as never)},
            ${expires}, ${customer.userId})
    returning id`;
  for (const l of q.lines) {
    await tx`insert into order_items (tenant_id, order_id, product_id, variant_id, inventory_item_id, name, variant_name, unit_price_minor, unit_cost_minor, quantity, line_total_minor)
             values (${tenantId}, ${o.id}, ${l.productId}, ${l.variantId}, ${l.inventoryItemId}, ${l.name}, ${l.variantName}, ${l.unitPriceMinor}, ${l.unitCostMinor}, ${l.quantity}, ${l.lineTotalMinor})`;
  }
  await reserve(tx, tenantId, o.id, q.lines.map((l) => ({ inventoryItemId: l.inventoryItemId!, quantity: l.quantity })), expires);
  await tx`insert into fulfillments (tenant_id, order_id, method) values (${tenantId}, ${o.id}, 'pickup')`;
  if (input.couponCode && discount > 0) {
    const { redeemCoupon } = await import('../services/coupons');
    await redeemCoupon(tx, tenantId, input.couponCode, { totalMinor: q.subtotalMinor, tenantCustomerId: customer.tenantCustomerId, orderId: o.id });
  }
  await tx`update carts set status = 'converted' where id = ${cartId}`;
  await audit(tx, { actorUserId: customer.userId, actorKind: 'customer', tenantId, action: 'order.created', targetType: 'order', targetId: o.id, metadata: { number, total: q.subtotalMinor } });
  if (total === 0) {
    // fully discounted: nothing to pay; keep the stock reserved until pickup
    await tx`update orders set status = 'paid', hold_expires_at = null where id = ${o.id}`;
    await tx`update stock_reservations set expires_at = 'infinity' where order_id = ${o.id} and status = 'active'`;
  }
  return { orderId: o.id, number, subtotalMinor: q.subtotalMinor, discountMinor: discount, totalMinor: total, terms, holdExpiresAt: expires };
}

/** Release reserved stock exactly once (failed/expired payment, cancellation). */
export async function releaseOrderStock(tx: Tx, orderId: string, reason: string) {
  const [o] = await tx<{ tenantId: string }[]>`update orders set stock_released_at = now() where id = ${orderId} and stock_released_at is null returning tenant_id`;
  if (!o) return false;
  const res = await tx<{ id: string; inventoryItemId: string; quantity: string }[]>`
    update stock_reservations set status = 'released', updated_at = now() where order_id = ${orderId} and status = 'active'
    returning id, inventory_item_id, quantity`;
  for (const r of res.sort((a, b) => a.inventoryItemId.localeCompare(b.inventoryItemId))) {
    await tx`select id from inventory_items where id = ${r.inventoryItemId} for update`;
    await tx`update inventory_items set reserved = reserved - ${r.quantity}, updated_at = now() where id = ${r.inventoryItemId}`;
    const [prior] = await tx`select 1 from stock_movements where inventory_item_id = ${r.inventoryItemId} and kind = 'release' and ref_type = 'order' and ref_id = ${orderId}`;
    await tx`insert into stock_movements (tenant_id, inventory_item_id, kind, reserved_delta, reason, ref_type, ref_id)
             values (${o.tenantId}, ${r.inventoryItemId}, ${prior ? 'adjustment' : 'release'}, ${-Number(r.quantity)}, ${reason}, 'order', ${orderId})`;
  }
  return true;
}

export async function reReserveOrderStock(tx: Tx, orderId: string): Promise<boolean> {
  const [o] = await tx<{ tenantId: string }[]>`select tenant_id from orders where id = ${orderId}`;
  const items = await tx<{ inventoryItemId: string; quantity: number }[]>`select inventory_item_id, quantity from order_items where order_id = ${orderId}`;
  try {
    await tx.savepoint(async (sp) => {
      for (const l of [...items].sort((a, b) => a.inventoryItemId.localeCompare(b.inventoryItemId))) {
        const [inv] = await sp<{ onHand: string; reserved: string }[]>`select on_hand, reserved from inventory_items where id = ${l.inventoryItemId} for update`;
        if (Number(inv.onHand) - Number(inv.reserved) < l.quantity) throw new AppError('insufficient_stock', 'errors.insufficient_stock');
        await sp`update inventory_items set reserved = reserved + ${l.quantity} where id = ${l.inventoryItemId}`;
        await sp`update stock_reservations set status = 'active', expires_at = 'infinity', updated_at = now() where order_id = ${orderId} and inventory_item_id = ${l.inventoryItemId}`;
        await sp`insert into stock_movements (tenant_id, inventory_item_id, kind, reserved_delta, reason, ref_type, ref_id)
                 values (${o.tenantId}, ${l.inventoryItemId}, 'adjustment', ${l.quantity}, 're-reserved after late payment', 'order', ${orderId})`;
      }
      await sp`update orders set stock_released_at = null where id = ${orderId}`;
    });
    return true;
  } catch {
    return false;
  }
}

/** Order lifecycle (staff). Refund status is tracked separately from order status. */
const ORDER_FLOW: Record<string, string[]> = {
  pending_payment: ['cancelled', 'paid'],
  paid: ['preparing', 'ready', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['collected', 'cancelled'],
};

export async function transitionOrder(tx: Tx, ctx: TenantContext, orderId: string, to: 'paid' | 'preparing' | 'ready' | 'collected' | 'cancelled', reason?: string) {
  if (!ctx.caps.has('orders.manage')) throw forbidden();
  const [o] = await tx<{ id: string; tenantId: string; status: string; paidMinor: number; totalMinor: number; paymentTerms: string; customerUserId: string | null; number: string }[]>`
    select * from orders where id = ${orderId} for update`;
  if (!o) throw notFound('order');
  if (!(ORDER_FLOW[o.status] ?? []).includes(to)) throw new AppError('invalid_transition', 'errors.invalid_transition', { from: o.status, to });
  if (to === 'paid' && o.paidMinor < o.totalMinor) throw new AppError('payment_required', 'errors.payment_required');
  if (to === 'collected' && o.paidMinor < o.totalMinor) throw new AppError('payment_required', 'errors.collect_payment_first');
  if (to === 'cancelled' && !reason?.trim()) throw new AppError('validation', 'errors.reason_required');

  if (to === 'collected') {
    // consume reservations into a sale: on_hand and reserved both decrease, exactly once
    const res = await tx<{ inventoryItemId: string; quantity: string }[]>`
      update stock_reservations set status = 'consumed', updated_at = now() where order_id = ${orderId} and status = 'active' returning inventory_item_id, quantity`;
    for (const r of res.sort((a, b) => a.inventoryItemId.localeCompare(b.inventoryItemId))) {
      await tx`select id from inventory_items where id = ${r.inventoryItemId} for update`;
      await tx`update inventory_items set on_hand = on_hand - ${r.quantity}, reserved = reserved - ${r.quantity}, updated_at = now() where id = ${r.inventoryItemId}`;
      await tx`insert into stock_movements (tenant_id, inventory_item_id, kind, on_hand_delta, reserved_delta, reason, ref_type, ref_id, actor_user_id)
               values (${o.tenantId}, ${r.inventoryItemId}, 'sale', ${-Number(r.quantity)}, ${-Number(r.quantity)}, 'collected', 'order', ${orderId}, ${ctx.user.userId})`;
    }
    await tx`update fulfillments set status = 'collected', collected_at = now(), collected_by = ${ctx.user.userId} where order_id = ${orderId}`;
    const held = Math.max(0, o.paidMinor);
    await post(tx, { tenantId: o.tenantId, refType: 'order_collected', refId: orderId, memo: 'product revenue recognized', actorUserId: ctx.user.userId, lines: [{ account: 'customer_deposits', debit: held }, { account: 'product_revenue', credit: held }] });
    const [cogs] = await tx<{ total: number; unknown: number }[]>`
      select coalesce(sum(unit_cost_minor * quantity), 0)::bigint as total, count(*) filter (where unit_cost_minor is null)::int as unknown from order_items where order_id = ${orderId}`;
    if (Number(cogs.total) > 0) {
      await post(tx, { tenantId: o.tenantId, refType: 'order_cogs', refId: orderId, memo: cogs.unknown ? 'COGS (partial: some costs unknown)' : 'COGS', actorUserId: ctx.user.userId, lines: [{ account: 'cogs', debit: Number(cogs.total) }, { account: 'inventory', credit: Number(cogs.total) }] });
    }
  }
  if (to === 'ready') await tx`update fulfillments set status = 'ready', ready_at = now() where order_id = ${orderId}`;
  if (to === 'cancelled') {
    await releaseOrderStock(tx, orderId, `cancelled: ${reason}`);
    if (o.paidMinor === 0) await returnOrderCoupon(tx, orderId);
    await tx`update fulfillments set status = 'cancelled' where order_id = ${orderId}`;
    const pays = await tx<{ id: string; amountMinor: number; refundedMinor: number }[]>`select id, amount_minor, refunded_minor from payments where order_id = ${orderId} and status = 'succeeded'`;
    for (const p of pays) {
      const amt = p.amountMinor - p.refundedMinor;
      if (amt > 0) await createRefund(tx, { paymentId: p.id, amountMinor: amt, reason: 'order_cancelled', requestedBy: ctx.user.userId, idempotencyKey: `ordcancel:${orderId}:${p.id}` });
    }
  }
  await tx`update orders set status = ${to}, version = version + 1, cancelled_at = ${to === 'cancelled' ? new Date() : null}, cancel_reason = ${to === 'cancelled' ? (reason ?? null) : null} where id = ${orderId}`;
  if (o.customerUserId && (to === 'ready' || to === 'cancelled')) {
    await notifyUser(tx, o.customerUserId, o.tenantId, { type: `order.${to}`, title: `order.notice_${to}`, body: o.number, targetPath: `/account/orders/${orderId}`, dedupeKey: `ord-${to}:${orderId}` });
  }
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: o.tenantId, action: `order.${to}`, targetType: 'order', targetId: orderId, requestId: ctx.requestId, reason });
  return { status: to };
}

async function returnOrderCoupon(tx: Tx, orderId: string) {
  const reds = await tx<{ id: string }[]>`select id from reward_redemptions where order_id = ${orderId} and coupon_id is not null and status = 'applied'`;
  if (!reds.length) return;
  const { reverseRedemption } = await import('../services/coupons');
  for (const r of reds) await reverseRedemption(tx, r.id);
}

/** Job: expire unpaid orders and release their stock exactly once. */
export async function expireUnpaidOrders(tx: Tx) {
  const rows = await tx<{ id: string }[]>`
    update orders set status = 'cancelled', cancelled_at = now(), cancel_reason = 'payment_window_expired', version = version + 1
    where status = 'pending_payment' and hold_expires_at <= now()
      and not exists (select 1 from payments p where p.order_id = orders.id and p.status = 'succeeded')
    returning id`;
  for (const r of rows) {
    await releaseOrderStock(tx, r.id, 'payment_window_expired');
    await returnOrderCoupon(tx, r.id);
  }
  return { expired: rows.length };
}
