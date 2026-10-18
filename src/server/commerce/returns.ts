import { z } from 'zod';
import type { Tx } from '../db';
import { AppError, forbidden, notFound } from '../errors';
import { audit } from '../audit';
import { nextNumber } from '../booking/service';
import { createRefund } from '../payments/service';
import { notifyTenantRoles, notifyUser } from '../services/notifications';
import type { TenantContext } from '../tenancy/context';
import { commerceSettings } from './delivery';

/**
 * Product returns. One request (RET-…) groups one or more order lines.
 *   requested → approved → received → completed
 *             ↘ rejected            ↘ (completed directly when nothing is shipped back)
 *   requested → cancelled (by the customer)
 * Rules:
 *  - only collected/delivered orders; the window comes from the policy captured
 *    at checkout (terms_snapshot.returns) or, if none, the current policy;
 *  - products marked non-returnable cannot be requested by customers;
 *  - open + completed return quantity never exceeds the purchased quantity
 *    (order_items rows locked FOR UPDATE);
 *  - restock happens once per return line (unique stock movement on ref_id);
 *  - the refund is a normal refund (provider / manual / gift card) — completing
 *    a return never marks money as refunded by itself;
 *  - a credit note is issued when the order had an invoice.
 */
export const REASON_CODES = ['damaged', 'wrong_item', 'not_as_described', 'changed_mind', 'allergy', 'other'] as const;

export const returnRequestInput = z.object({
  items: z.array(z.object({ orderItemId: z.string().uuid(), quantity: z.number().int().min(1).max(100) })).min(1).max(30),
  reasonCode: z.enum(REASON_CODES),
  reason: z.string().trim().min(3).max(500),
});

interface ItemRow {
  id: string;
  quantity: number;
  returnedQty: number;
  unitPriceMinor: number;
  inventoryItemId: string;
  returnable: boolean;
  name: string;
  open: number;
}

async function lockItems(tx: Tx, orderId: string): Promise<ItemRow[]> {
  return tx<ItemRow[]>`
    select i.id, i.quantity, i.returned_qty, i.unit_price_minor, i.inventory_item_id, p.returnable, i.name,
      coalesce((select sum(r.quantity) from returns r where r.order_item_id = i.id and r.status in ('requested','approved','received')), 0)::int as open
    from order_items i join products p on p.id = i.product_id
    where i.order_id = ${orderId} order by i.id for update of i`;
}

export async function returnWindow(tx: Tx, orderId: string) {
  const [o] = await tx<{ status: string; termsSnapshot: { returns?: { windowDays: number } | null }; collectedAt: Date | null; deliveredAt: Date | null }[]>`
    select o.status, o.terms_snapshot, f.collected_at, f.delivered_at from orders o left join fulfillments f on f.order_id = o.id where o.id = ${orderId}`;
  if (!o) throw notFound('order');
  const cs = await commerceSettings(tx);
  const snap = o.termsSnapshot?.returns;
  const enabled = snap ? true : cs.returnsEnabled;
  const days = snap ? snap.windowDays : cs.returnWindowDays;
  const handedOver = o.deliveredAt ?? o.collectedAt;
  const until = handedOver ? new Date(handedOver.getTime() + days * 86400000) : null;
  return { enabled, days, handedOver, until, open: o.status === 'collected' && enabled && !!until && until.getTime() > Date.now(), policyText: cs.returnPolicyText, shippingPaidBy: cs.returnShippingPaidBy };
}

async function createRequest(tx: Tx, tenantId: string, orderId: string, actor: { userId: string; customerUserId: string | null; staff: boolean }, p: z.infer<typeof returnRequestInput>) {
  const [o] = await tx<{ status: string; number: string }[]>`select status, number from orders where id = ${orderId} for update`;
  if (!o) throw notFound('order');
  if (o.status !== 'collected') throw new AppError('invalid_transition', 'errors.return_not_collected');
  if (!actor.staff) {
    const w = await returnWindow(tx, orderId);
    if (!w.enabled) throw new AppError('validation', 'errors.returns_disabled');
    if (!w.open) throw new AppError('validation', 'errors.return_window_closed', { until: w.until?.toISOString() ?? null });
  }
  const rows = await lockItems(tx, orderId);
  const seen = new Set<string>();
  for (const it of p.items) {
    if (seen.has(it.orderItemId)) throw new AppError('validation', 'errors.validation');
    seen.add(it.orderItemId);
    const row = rows.find((r) => r.id === it.orderItemId);
    if (!row) throw new AppError('validation', 'errors.invalid_reference', { field: 'items' });
    if (!actor.staff && !row.returnable) throw new AppError('validation', 'errors.item_not_returnable', { name: row.name });
    const left = row.quantity - row.returnedQty - row.open;
    if (it.quantity > left) throw new AppError('validation', 'errors.return_qty_exceeds', { name: row.name, max: Math.max(0, left) });
  }
  const number = await nextNumber(tx, tenantId, 'return', 'RET');
  const status = actor.staff ? 'approved' : 'requested';
  for (const it of p.items) {
    await tx`insert into returns (tenant_id, order_id, order_item_id, quantity, reason, reason_code, status, request_number, customer_user_id, requested_by, decided_by, decided_at)
             values (${tenantId}, ${orderId}, ${it.orderItemId}, ${it.quantity}, ${p.reason}, ${p.reasonCode}, ${status}, ${number}, ${actor.customerUserId},
                     ${actor.userId}, ${actor.staff ? actor.userId : null}, ${actor.staff ? new Date() : null})`;
  }
  await tx`insert into fulfillment_events (tenant_id, order_id, status, note, actor_user_id) values (${tenantId}, ${orderId}, 'return_requested', ${number}, ${actor.userId})`;
  if (!actor.staff) {
    await notifyTenantRoles(tx, tenantId, ['owner', 'manager'], { type: 'return.requested', title: 'ret.notice_requested', body: `${number} · ${o.number}`, targetPath: `/app/_/orders/returns?n=${number}`, dedupeKey: `ret-req:${tenantId}:${number}` });
  }
  await audit(tx, { actorUserId: actor.userId, actorKind: actor.staff ? 'user' : 'customer', tenantId, action: 'return.requested', targetType: 'order', targetId: orderId, metadata: { number, lines: p.items.length } });
  return { number, status };
}

/** Customer self-service request (tenant scope pinned to the order's business). */
export async function requestReturn(tx: Tx, tenantId: string, customerUserId: string, orderId: string, p: z.infer<typeof returnRequestInput>) {
  const [own] = await tx`select 1 from orders where id = ${orderId} and customer_user_id = ${customerUserId}`;
  if (!own) throw notFound('order');
  return createRequest(tx, tenantId, orderId, { userId: customerUserId, customerUserId, staff: false }, p);
}

/** Staff-recorded return (in store): no window/returnable checks, approved immediately. */
export async function staffReturn(tx: Tx, ctx: TenantContext, orderId: string, p: z.infer<typeof returnRequestInput>) {
  if (!ctx.caps.has('orders.manage')) throw forbidden();
  const [o] = await tx<{ customerUserId: string | null }[]>`select customer_user_id from orders where id = ${orderId}`;
  if (!o) throw notFound('order');
  return createRequest(tx, ctx.tenant.id, orderId, { userId: ctx.user.userId, customerUserId: o.customerUserId, staff: true }, p);
}

export async function cancelMyReturn(tx: Tx, customerUserId: string, number: string) {
  const r = await tx`update returns set status = 'cancelled' where request_number = ${number} and customer_user_id = ${customerUserId} and status = 'requested' returning id`;
  if (!r.length) throw new AppError('invalid_transition', 'errors.invalid_transition');
}

interface ReqRow {
  id: string;
  tenantId: string;
  orderId: string;
  orderItemId: string;
  quantity: number;
  status: string;
  restock: boolean;
  customerUserId: string | null;
  unitPriceMinor: number;
  inventoryItemId: string;
}

async function lockRequest(tx: Tx, number: string): Promise<ReqRow[]> {
  const rows = await tx<ReqRow[]>`select r.id, r.tenant_id, r.order_id, r.order_item_id, r.quantity, r.status, r.restock, r.customer_user_id, i.unit_price_minor, i.inventory_item_id
                                  from returns r join order_items i on i.id = r.order_item_id where r.request_number = ${number} order by r.id for update of r`;
  if (!rows.length) throw notFound('return');
  return rows;
}

async function notifyCustomer(tx: Tx, r: ReqRow, number: string, status: string) {
  if (!r.customerUserId) return;
  await notifyUser(tx, r.customerUserId, r.tenantId, { type: `return.${status}`, title: `ret.notice_${status}`, body: number, targetPath: `/account/orders/${r.orderId}`, dedupeKey: `ret-${status}:${r.tenantId}:${number}` });
}

export const decisionInput = z.object({ decision: z.enum(['approve', 'reject']), note: z.string().trim().max(500).optional() });

export async function decideReturn(tx: Tx, ctx: TenantContext, number: string, p: z.infer<typeof decisionInput>) {
  if (!ctx.caps.has('orders.manage')) throw forbidden();
  const rows = await lockRequest(tx, number);
  if (rows.some((r) => r.status !== 'requested')) throw new AppError('invalid_transition', 'errors.invalid_transition');
  if (p.decision === 'reject' && !p.note?.trim()) throw new AppError('validation', 'errors.reason_required', { field: 'note' });
  const to = p.decision === 'approve' ? 'approved' : 'rejected';
  await tx`update returns set status = ${to}, decision_note = ${p.note?.trim() || null}, decided_by = ${ctx.user.userId}, decided_at = now() where request_number = ${number}`;
  await notifyCustomer(tx, rows[0], number, to);
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: `return.${to}`, targetType: 'order', targetId: rows[0].orderId, requestId: ctx.requestId, reason: p.note, metadata: { number } });
  return { status: to };
}

export const receiveInput = z.object({ restock: z.array(z.object({ returnId: z.string().uuid(), restock: z.boolean() })).max(30) });

/** Items physically received: optionally put back into sellable stock (exactly once per line). */
export async function receiveReturn(tx: Tx, ctx: TenantContext, number: string, p: z.infer<typeof receiveInput>) {
  if (!ctx.caps.has('orders.manage')) throw forbidden();
  const rows = await lockRequest(tx, number);
  if (rows.some((r) => r.status !== 'approved')) throw new AppError('invalid_transition', 'errors.invalid_transition');
  for (const r of rows.sort((a, b) => a.inventoryItemId.localeCompare(b.inventoryItemId))) {
    const restock = p.restock.find((x) => x.returnId === r.id)?.restock ?? false;
    if (restock) {
      await tx`select id from inventory_items where id = ${r.inventoryItemId} for update`;
      const ins = await tx`insert into stock_movements (tenant_id, inventory_item_id, kind, on_hand_delta, reason, ref_type, ref_id, actor_user_id)
                           values (${r.tenantId}, ${r.inventoryItemId}, 'return', ${r.quantity}, ${`return ${number}`}, 'return', ${r.id}, ${ctx.user.userId})
                           on conflict do nothing returning id`;
      if (ins.length) await tx`update inventory_items set on_hand = on_hand + ${r.quantity}, updated_at = now() where id = ${r.inventoryItemId}`;
    }
    await tx`update returns set status = 'received', restock = ${restock}, received_at = now() where id = ${r.id}`;
  }
  await notifyCustomer(tx, rows[0], number, 'received');
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: 'return.received', targetType: 'order', targetId: rows[0].orderId, requestId: ctx.requestId, metadata: { number, restocked: p.restock.filter((x) => x.restock).length } });
  return { status: 'received' };
}

/** Suggested refund: line value minus its share of the order discount (+ delivery fee when the policy says so and everything comes back). */
export async function suggestedRefund(tx: Tx, number: string) {
  const rows = await tx<{ orderId: string; quantity: number; unitPriceMinor: number }[]>`
    select r.order_id, r.quantity, i.unit_price_minor from returns r join order_items i on i.id = r.order_item_id where r.request_number = ${number}`;
  if (!rows.length) throw notFound('return');
  const [o] = await tx<{ subtotalMinor: number; discountMinor: number; deliveryFeeMinor: number; termsSnapshot: { returns?: { refundDeliveryFee?: boolean } | null }; paidMinor: number; refundedMinor: number }[]>`
    select subtotal_minor, discount_minor, delivery_fee_minor, terms_snapshot, paid_minor, refunded_minor from orders where id = ${rows[0].orderId}`;
  const gross = rows.reduce((n, r) => n + r.unitPriceMinor * r.quantity, 0);
  const discountShare = o.subtotalMinor > 0 ? Math.round((o.discountMinor * gross) / o.subtotalMinor) : 0;
  const [{ totalQty, otherQty }] = await tx<{ totalQty: number; otherQty: number }[]>`
    select (select coalesce(sum(quantity), 0) from order_items where order_id = ${rows[0].orderId})::int as total_qty,
           (select coalesce(sum(quantity), 0) from returns where order_id = ${rows[0].orderId} and request_number <> ${number} and status in ('requested','approved','received','completed'))::int as other_qty`;
  const all = otherQty + rows.reduce((n, r) => n + r.quantity, 0) >= totalQty;
  const fee = all && o.termsSnapshot?.returns?.refundDeliveryFee ? o.deliveryFeeMinor : 0;
  const suggested = Math.max(0, gross - discountShare + fee);
  const refundable = Math.max(0, o.paidMinor - o.refundedMinor);
  return { suggestedMinor: Math.min(suggested, refundable), grossMinor: gross, discountShareMinor: discountShare, deliveryFeeMinor: fee, refundableMinor: refundable };
}

export const completeInput = z.object({ refundAmountMinor: z.number().int().min(0).max(100_000_000), idempotencyKey: z.string().min(8).max(100) });

export async function completeReturn(tx: Tx, ctx: TenantContext, number: string, p: z.infer<typeof completeInput>) {
  if (!ctx.caps.has('orders.manage')) throw forbidden();
  if (p.refundAmountMinor > 0 && !ctx.caps.has('refunds.issue')) throw forbidden();
  const rows = await lockRequest(tx, number);
  if (rows.some((r) => !['approved', 'received'].includes(r.status))) throw new AppError('invalid_transition', 'errors.invalid_transition');
  const s = await suggestedRefund(tx, number);
  if (p.refundAmountMinor > s.suggestedMinor) throw new AppError('validation', 'errors.refund_exceeds', { refundableMinor: s.suggestedMinor, field: 'refundAmountMinor' });
  const orderId = rows[0].orderId;
  // returned quantity is final now (CHECK returned_qty ≤ quantity guards the column)
  for (const r of rows) await tx`update order_items set returned_qty = returned_qty + ${r.quantity} where id = ${r.orderItemId}`;
  let firstRefund: string | null = null;
  if (p.refundAmountMinor > 0) {
    let left = p.refundAmountMinor;
    const pays = await tx<{ id: string; amountMinor: number; open: number }[]>`
      select p.id, p.amount_minor, coalesce((select sum(amount_minor) from refunds r where r.payment_id = p.id and r.status in ('pending','processing','succeeded')), 0)::bigint as open
      from payments p where p.order_id = ${orderId} and p.status = 'succeeded' order by p.succeeded_at desc`;
    let n = 0;
    for (const pay of pays) {
      if (left <= 0) break;
      const amt = Math.min(pay.amountMinor - Number(pay.open), left);
      if (amt <= 0) continue;
      const ref = await createRefund(tx, { paymentId: pay.id, amountMinor: amt, reason: `return ${number}`, requestedBy: ctx.user.userId, idempotencyKey: `ret:${number}:${p.idempotencyKey}:${n++}`, termsBasis: { returnNumber: number } });
      firstRefund ??= ref.id;
      left -= amt;
    }
    if (left > 0) throw new AppError('validation', 'errors.refund_exceeds', { refundableMinor: p.refundAmountMinor - left });
  }
  await tx`update returns set status = 'completed', completed_at = now(), refund_id = ${firstRefund}, refund_amount_minor = ${p.refundAmountMinor} where request_number = ${number}`;
  await tx`insert into fulfillment_events (tenant_id, order_id, status, note, actor_user_id) values (${ctx.tenant.id}, ${orderId}, 'return_completed', ${number}, ${ctx.user.userId})`;
  // credit note against the order's invoice, if one was issued
  const [inv] = await tx<{ id: string }[]>`select id from invoices where order_id = ${orderId} and kind = 'invoice' and status = 'issued' order by issued_at limit 1`;
  let creditNote: { id: string; number: string } | null = null;
  if (inv && p.refundAmountMinor > 0) {
    const { issueCreditNote } = await import('../finance/invoices');
    const [first] = await tx<{ id: string }[]>`select id from returns where request_number = ${number} order by id limit 1`;
    creditNote = await issueCreditNote(tx, ctx, inv.id, { amountMinor: p.refundAmountMinor, reason: `return ${number}`, returnId: first.id });
  }
  await notifyCustomer(tx, rows[0], number, 'completed');
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: 'return.completed', targetType: 'order', targetId: orderId, requestId: ctx.requestId, metadata: { number, refundAmountMinor: p.refundAmountMinor } });
  return { status: 'completed', refundId: firstRefund, creditNote };
}

export async function listReturns(tx: Tx, opts: { status?: string; number?: string }) {
  return tx`
    select r.request_number as number, max(r.status) as status,
      r.order_id, o.number as order_number, tc.display_name as customer_name, max(r.reason_code) as reason_code, max(r.reason) as reason,
      sum(r.quantity)::int as quantity, count(*)::int as lines, min(r.created_at) as created_at, max(r.refund_amount_minor) as refund_amount_minor
    from returns r join orders o on o.id = r.order_id join tenant_customers tc on tc.id = o.tenant_customer_id
    where r.tenant_id = app.tenant_id() and r.request_number is not null
      and (${opts.status ?? null}::text is null or r.status = ${opts.status ?? null})
      and (${opts.number ?? null}::text is null or r.request_number = ${opts.number ?? null})
    group by r.request_number, r.order_id, o.number, tc.display_name
    order by min(r.created_at) desc limit 200`;
}

export async function getReturn(tx: Tx, number: string) {
  const lines = await tx`select r.id, r.order_item_id, r.quantity, r.status, r.reason, r.reason_code, r.decision_note, r.restock, r.refund_amount_minor, r.refund_id,
                          r.created_at, r.decided_at, r.received_at, r.completed_at, i.name, i.variant_name, i.unit_price_minor, i.quantity as purchased, o.number as order_number, o.id as order_id
                        from returns r join order_items i on i.id = r.order_item_id join orders o on o.id = r.order_id
                        where r.request_number = ${number} order by r.id`;
  if (!lines.length) throw notFound('return');
  const s = await suggestedRefund(tx, number);
  return { number, lines, suggestion: s };
}

/** Returns on one order (customer view and staff order page). */
export async function orderReturns(tx: Tx, orderId: string) {
  return tx`select r.request_number as number, r.status, r.quantity, r.reason_code, r.decision_note, r.refund_amount_minor, r.created_at, i.name, i.variant_name
            from returns r join order_items i on i.id = r.order_item_id where r.order_id = ${orderId} order by r.created_at, r.id`;
}
