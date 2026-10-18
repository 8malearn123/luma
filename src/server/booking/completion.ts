import type { Tx } from '../db';
import { liabilityHeldForBooking, post } from '../finance/journal';
import { notifyTenantRoles } from '../services/notifications';

/**
 * Side effects of completing a booking, each exactly once:
 *  - revenue recognition for money already held (liability → service revenue)
 *  - commission entries (snapshot of the rule used)
 *  - service-material consumption per approved recipe (never blocks completion;
 *    a shortage is recorded and management is alerted)
 *  - loyalty points when the booking is fully paid (loyalty service)
 */
export async function onBookingCompleted(tx: Tx, bookingId: string, actorUserId: string | null) {
  const [b] = await tx<{ tenantId: string; branchId: string; totalMinor: number; paidMinor: number; refundedMinor: number; tenantCustomerId: string; financialStatus: string }[]>`
    select tenant_id, branch_id, total_minor, paid_minor, refunded_minor, tenant_customer_id, financial_status from bookings where id = ${bookingId}`;
  const tenantId = b.tenantId;

  // 1) revenue recognition (only what was actually collected; outstanding balance is recognized when collected)
  const [already] = await tx`select 1 from financial_entries where ref_type = 'service_completed' and ref_id = ${bookingId} limit 1`;
  if (!already) {
    const held = await liabilityHeldForBooking(tx, bookingId);
    if (held > 0) {
      await post(tx, { tenantId, refType: 'service_completed', refId: bookingId, memo: 'service delivered', actorUserId, lines: [{ account: 'customer_deposits', debit: held }, { account: 'service_revenue', credit: held }] });
    }
  }

  const items = await tx<{ id: string; staffId: string; serviceId: string; priceMinor: number; addonsMinor: number }[]>`
    select id, staff_id, service_id, price_minor, addons_minor from booking_items where booking_id = ${bookingId} and status = 'active'`;

  // 2) commissions
  for (const it of items) {
    const [rule] = await tx<{ id: string; kind: 'percentage' | 'fixed'; rateBps: number | null; fixedMinor: number | null; staffId: string | null; serviceId: string | null }[]>`
      select id, kind, rate_bps, fixed_minor, staff_id, service_id from commission_rules
      where (staff_id = ${it.staffId} or staff_id is null) and (service_id = ${it.serviceId} or service_id is null)
        and effective_from <= current_date and (effective_to is null or effective_to >= current_date)
      order by (staff_id is not null)::int + (service_id is not null)::int desc, created_at desc limit 1`;
    if (!rule) continue;
    const basis = it.priceMinor + it.addonsMinor;
    const amount = rule.kind === 'percentage' ? Math.floor((basis * (rule.rateBps ?? 0) + 5000) / 10000) : (rule.fixedMinor ?? 0);
    const ins = await tx`insert into commission_entries (tenant_id, staff_id, booking_item_id, kind, basis_minor, amount_minor, rule_snapshot, created_by)
             values (${tenantId}, ${it.staffId}, ${it.id}, 'earned', ${basis}, ${amount}, ${tx.json(rule as never)}, ${actorUserId})
             on conflict (tenant_id, booking_item_id) where kind = 'earned' do nothing returning id`;
    if (ins.length && amount > 0) {
      await post(tx, { tenantId, refType: 'commission', refId: ins[0].id as string, memo: 'commission earned', actorUserId, lines: [{ account: 'commission_expense', debit: amount }, { account: 'commission_payable', credit: amount }] });
    }
  }

  // 3) materials
  const shortages: string[] = [];
  for (const it of items) {
    const recipe = await tx<{ inventoryItemId: string; quantity: string; unit: string; itemUnit: string; onHand: string; reserved: string; name: string; branchId: string; unitCostMinor: number | null }[]>`
      select r.inventory_item_id, r.quantity, r.unit, i.unit as item_unit, i.on_hand, i.reserved, i.name, i.branch_id, i.unit_cost_minor
      from service_material_recipes r join inventory_items i on i.id = r.inventory_item_id
      where r.service_id = ${it.serviceId} and r.approved_at is not null and i.branch_id = ${b.branchId} and i.status = 'active'`;
    for (const r of recipe) {
      const [{ already: done }] = await tx<{ already: boolean }[]>`
        select exists(select 1 from stock_movements where inventory_item_id = ${r.inventoryItemId} and kind = 'consumption' and ref_type = 'booking_item' and ref_id = ${it.id}) as already`;
      if (done) continue;
      const factor = r.unit === r.itemUnit ? 1 : Number((await tx<{ factor: string }[]>`select factor from unit_conversions where from_unit = ${r.unit} and to_unit = ${r.itemUnit}`)[0]?.factor ?? NaN);
      if (!Number.isFinite(factor)) {
        shortages.push(`${r.name}: unit`);
        continue;
      }
      const want = Number(r.quantity) * factor;
      const [lock] = await tx<{ onHand: string; reserved: string }[]>`select on_hand, reserved from inventory_items where id = ${r.inventoryItemId} for update`;
      const available = Number(lock.onHand) - Number(lock.reserved);
      const take = Math.max(0, Math.min(want, available));
      if (take < want) shortages.push(r.name);
      await tx`update inventory_items set on_hand = on_hand - ${take}, updated_at = now() where id = ${r.inventoryItemId}`;
      await tx`insert into stock_movements (tenant_id, inventory_item_id, kind, on_hand_delta, reason, ref_type, ref_id, actor_user_id)
               values (${tenantId}, ${r.inventoryItemId}, 'consumption', ${-take}, ${take < want ? `shortage: wanted ${want}` : 'recipe'}, 'booking_item', ${it.id}, ${actorUserId})`;
    }
    await tx`update booking_items set materials_deducted_at = coalesce(materials_deducted_at, now()) where id = ${it.id}`;
  }
  if (shortages.length) {
    await notifyTenantRoles(tx, tenantId, ['owner', 'manager'], { type: 'inventory.shortage', title: 'inventory.notice_shortage', body: shortages.join('، ').slice(0, 300), targetPath: `/app/_/inventory`, dedupeKey: `shortage:${bookingId}` });
  }

  // 4) loyalty
  if (b.financialStatus === 'paid') {
    const { earnForBooking } = await import('../services/loyalty');
    await earnForBooking(tx, bookingId);
  }
}
