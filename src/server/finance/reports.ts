import type { Tx } from '../db';

/**
 * Financial summary for a period [from, to). Each figure states its basis.
 * Revenue comes from the journal (recognized on completion/collection);
 * collected deposits stay in `customer_deposits` (a liability) until then.
 * Profit is computed ONLY when the cost inputs are complete; otherwise the
 * report says "costs incomplete" and lists what is missing.
 */
export interface FinanceReport {
  period: { from: string; to: string; timezone: string };
  figures: Record<string, { valueMinor: number; basis: string }>;
  profit:
    | { status: 'computed'; valueMinor: number; formula: string }
    | { status: 'costs_incomplete'; formula: string; missing: string[]; partialMinor: number };
}

const net = async (tx: Tx, account: string, from: Date, to: Date, credit = true) => {
  const [r] = await tx<{ v: number }[]>`select coalesce(sum(${credit ? tx`credit_minor - debit_minor` : tx`debit_minor - credit_minor`}), 0)::bigint as v
                                         from financial_entries where account = ${account} and at >= ${from} and at < ${to}`;
  return Number(r.v);
};

export async function financeReport(tx: Tx, from: Date, to: Date, timezone: string): Promise<FinanceReport> {
  const f: FinanceReport['figures'] = {};
  const [bv] = await tx<{ v: number }[]>`select coalesce(sum(total_minor),0)::bigint as v from bookings
    where starts_at >= ${from} and starts_at < ${to} and status in ('confirmed','checked_in','in_service','completed')`;
  f.bookingValue = { valueMinor: Number(bv.v), basis: 'Sum of booking totals scheduled in the period (confirmed or later). Not revenue.' };
  f.serviceRevenue = { valueMinor: await net(tx, 'service_revenue', from, to), basis: 'Recognized when a booking is completed, plus retained cancellation/no-show fees (journal: service_revenue).' };
  f.productRevenue = { valueMinor: await net(tx, 'product_revenue', from, to), basis: 'Recognized when an order is collected (journal: product_revenue).' };
  const [col] = await tx<{ online: number; onsite: number }[]>`select
      coalesce(sum(amount_minor) filter (where provider <> 'manual'),0)::bigint as online,
      coalesce(sum(amount_minor) filter (where provider = 'manual'),0)::bigint as onsite
    from payments where status = 'succeeded' and succeeded_at >= ${from} and succeeded_at < ${to}`;
  f.collectionsOnline = { valueMinor: Number(col.online), basis: 'Online payments confirmed by the provider (signed event) in the period.' };
  f.collectionsOnSite = { valueMinor: Number(col.onsite), basis: 'Cash / card-terminal collections recorded by staff with a reference.' };
  const [dep] = await tx<{ v: number }[]>`select coalesce(sum(credit_minor - debit_minor),0)::bigint as v from financial_entries where account = 'customer_deposits' and at < ${to}`;
  f.depositsHeld = { valueMinor: Number(dep.v), basis: 'Balance of customer money received for services/products not yet delivered (liability) at period end.' };
  const [out] = await tx<{ v: number }[]>`select coalesce(sum(greatest(total_minor - (paid_minor - refunded_minor), 0)),0)::bigint as v from bookings
    where status in ('confirmed','checked_in','in_service','completed') and starts_at < ${to} and starts_at >= ${from}`;
  f.outstanding = { valueMinor: Number(out.v), basis: 'Unpaid remainder of bookings in the period (total − net paid).' };
  const [rf] = await tx<{ done: number; pending: number }[]>`select
      coalesce(sum(amount_minor) filter (where status = 'succeeded' and completed_at >= ${from} and completed_at < ${to}),0)::bigint as done,
      coalesce(sum(amount_minor) filter (where status in ('pending','processing')),0)::bigint as pending
    from refunds`;
  f.refundsSucceeded = { valueMinor: Number(rf.done), basis: 'Refunds confirmed as paid out in the period.' };
  f.refundsPending = { valueMinor: Number(rf.pending), basis: 'Refunds requested but not yet confirmed (not counted as refunded).' };
  const [disc] = await tx<{ v: number }[]>`select (coalesce((select sum(discount_minor) from bookings where starts_at >= ${from} and starts_at < ${to} and status <> 'cancelled'),0)
      + coalesce((select sum(discount_minor) from orders where created_at >= ${from} and created_at < ${to} and status <> 'cancelled'),0))::bigint as v`;
  f.discounts = { valueMinor: Number(disc.v), basis: 'Discounts applied on bookings/orders in the period.' };
  f.processingFees = { valueMinor: await net(tx, 'processing_fees', from, to, false), basis: 'Provider fees as recorded from settlements (none recorded unless settlement data is imported).' };
  const [ex] = await tx<{ v: number; n: number }[]>`select coalesce(sum(amount_minor),0)::bigint as v, count(*)::int as n from expenses
    where voided_at is null and incurred_on >= (${from}::timestamptz at time zone ${timezone})::date and incurred_on < (${to}::timestamptz at time zone ${timezone})::date`;
  f.expenses = { valueMinor: Number(ex.v), basis: 'Recorded, non-voided expenses incurred in the period.' };
  const [mat] = await tx<{ v: number; unknown: number }[]>`select coalesce(sum(-m.on_hand_delta * i.unit_cost_minor),0)::bigint as v,
      count(*) filter (where i.unit_cost_minor is null)::int as unknown
    from stock_movements m join inventory_items i on i.id = m.inventory_item_id
    where m.kind = 'consumption' and m.created_at >= ${from} and m.created_at < ${to}`;
  const [noRecipe] = await tx<{ n: number; est: number }[]>`select count(*) filter (where s.material_cost_minor is null and not exists (
        select 1 from service_material_recipes r where r.service_id = i.service_id and r.approved_at is not null))::int as n,
      coalesce(sum(s.material_cost_minor) filter (where not exists (select 1 from service_material_recipes r where r.service_id = i.service_id and r.approved_at is not null)),0)::bigint as est
    from booking_items i join bookings b on b.id = i.booking_id join services s on s.id = i.service_id
    where b.status = 'completed' and b.completed_at >= ${from} and b.completed_at < ${to} and i.status = 'active'`;
  f.materialCosts = { valueMinor: Number(mat.v) + Number(noRecipe.est), basis: 'Recipe consumption valued at item unit cost, plus per-service material cost estimates where no recipe exists.' };
  f.productCosts = { valueMinor: await net(tx, 'cogs', from, to, false), basis: 'Cost of goods for collected orders (snapshot unit costs).' };
  const [cogsUnknown] = await tx<{ n: number }[]>`select count(*)::int as n from order_items oi join orders o on o.id = oi.order_id
    where o.status = 'collected' and o.updated_at >= ${from} and o.updated_at < ${to} and oi.unit_cost_minor is null`;
  const [com] = await tx<{ v: number }[]>`select coalesce(sum(amount_minor),0)::bigint as v from commission_entries where created_at >= ${from} and created_at < ${to}`;
  f.commissions = { valueMinor: Number(com.v), basis: 'Commission entries earned (net of reversals/corrections) in the period.' };
  f.refundsAfterRecognition = { valueMinor: await net(tx, 'refunds', from, to, false), basis: 'Refunds of already-recognized revenue (contra-revenue).' };

  const formula = 'profit = service revenue + product revenue − refunds after recognition − expenses − material costs − product costs − commissions − processing fees';
  const value =
    f.serviceRevenue.valueMinor + f.productRevenue.valueMinor - f.refundsAfterRecognition.valueMinor - f.expenses.valueMinor -
    f.materialCosts.valueMinor - f.productCosts.valueMinor - f.commissions.valueMinor - f.processingFees.valueMinor;
  const missing: string[] = [];
  if (Number(mat.unknown) > 0) missing.push('material_unit_costs');
  if (Number(noRecipe.n) > 0) missing.push('service_material_costs');
  if (Number(cogsUnknown.n) > 0) missing.push('product_unit_costs');
  if (Number(ex.n) === 0) missing.push('expenses_not_recorded');
  return {
    period: { from: from.toISOString(), to: to.toISOString(), timezone },
    figures: f,
    profit: missing.length ? { status: 'costs_incomplete', formula, missing, partialMinor: value } : { status: 'computed', valueMinor: value, formula },
  };
}

export async function listCommissions(tx: Tx, from: Date, to: Date) {
  return tx`select c.id, c.kind, c.basis_minor, c.amount_minor, c.created_at, s.display_name as staff_name, i.service_name, b.number as booking_number
            from commission_entries c join staff_profiles s on s.id = c.staff_id join booking_items i on i.id = c.booking_item_id join bookings b on b.id = i.booking_id
            where c.created_at >= ${from} and c.created_at < ${to} order by c.created_at desc limit 500`;
}

export async function listRefunds(tx: Tx, status?: string) {
  return tx`select r.id, r.amount_minor, r.status, r.reason, r.created_at, r.completed_at, p.provider, p.method, p.id as payment_id,
              b.number as booking_number, o.number as order_number
            from refunds r join payments p on p.id = r.payment_id left join bookings b on b.id = p.booking_id left join orders o on o.id = p.order_id
            where (${status ?? null}::text is null or r.status = ${status ?? null}) order by r.created_at desc limit 300`;
}

export async function listPayments(tx: Tx, from: Date, to: Date) {
  return tx`select p.id, p.purpose, p.kind, p.method, p.provider, p.amount_minor, p.refunded_minor, p.status, p.collection_ref, p.created_at, p.succeeded_at,
              b.number as booking_number, o.number as order_number, u.display_name as collected_by_name
            from payments p left join bookings b on b.id = p.booking_id left join orders o on o.id = p.order_id left join users u on u.id = p.collected_by
            where p.created_at >= ${from} and p.created_at < ${to} order by p.created_at desc limit 500`;
}
