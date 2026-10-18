import type { Tx } from '../db';
import type { TenantContext } from '../tenancy/context';

/** Real-data overview for the dashboard home. Sections depend on capabilities. */
export async function overview(tx: Tx, ctx: TenantContext, dayStart: Date, dayEnd: Date) {
  const has = (c: Parameters<TenantContext['caps']['has']>[0]) => ctx.caps.has(c);
  const mine = !has('bookings.manage') && has('bookings.view_assigned') ? ctx.staffProfileId : null;
  const seeBookings = has('bookings.manage') || has('bookings.view_assigned') || has('bookings.view_financial');
  const today = seeBookings
    ? await tx`select b.id, b.number, b.status, b.starts_at, b.ends_at,
        ${has('bookings.view_financial') && !has('bookings.manage') ? tx`null` : tx`tc.display_name`} as customer_name,
        (select string_agg(i.service_name || ' · ' || i.staff_name, '، ' order by i.seq) from booking_items i where i.booking_id = b.id and i.status = 'active') as summary
      from bookings b join tenant_customers tc on tc.id = b.tenant_customer_id
      where b.tenant_id = app.tenant_id() and b.starts_at >= ${dayStart} and b.starts_at < ${dayEnd} and b.status in ('held','pending_payment','confirmed','checked_in','in_service','completed','no_show')
        and (${mine}::uuid is null or exists (select 1 from booking_items i where i.booking_id = b.id and i.staff_id = ${mine}::uuid and i.status = 'active'))
      order by b.starts_at limit 50`
    : [];
  const [counts] = seeBookings
    ? await tx<{ upcoming: number; pendingPayment: number }[]>`select
        count(*) filter (where status = 'confirmed' and starts_at >= ${dayEnd} and starts_at < ${dayEnd}::timestamptz + interval '7 days')::int as upcoming,
        count(*) filter (where status in ('held','pending_payment'))::int as pending_payment
      from bookings where tenant_id = app.tenant_id() and (${mine}::uuid is null or exists (select 1 from booking_items i where i.booking_id = bookings.id and i.staff_id = ${mine}::uuid))`
    : [{ upcoming: 0, pendingPayment: 0 }];
  const pending: { key: string; count: number; href: string }[] = [];
  const base = `/app/${ctx.tenant.slug}`;
  if (has('hr.manage')) {
    const [r] = await tx<{ n: number }[]>`select count(*)::int as n from leave_requests where status = 'pending'`;
    if (r.n) pending.push({ key: 'dash.pending_leave', count: r.n, href: `${base}/team?tab=leave` });
  }
  if (has('catalog.price.approve')) {
    const [r] = await tx<{ n: number }[]>`select count(*)::int as n from service_price_changes where status = 'pending'`;
    if (r.n) pending.push({ key: 'dash.pending_prices', count: r.n, href: `${base}/services` });
  }
  if (has('refunds.issue') || has('finance.view')) {
    const [r] = await tx<{ n: number }[]>`select count(*)::int as n from refunds where status in ('pending','processing','failed')`;
    if (r.n) pending.push({ key: 'dash.pending_refunds', count: r.n, href: `${base}/finance?tab=refunds` });
    const [p] = await tx<{ n: number }[]>`select count(*)::int as n from payments where status = 'needs_review'`;
    if (p.n) pending.push({ key: 'dash.payments_review', count: p.n, href: `${base}/finance?tab=payments` });
  }
  if (has('inventory.manage')) {
    const [r] = await tx<{ n: number }[]>`select count(*)::int as n from inventory_items where status = 'active' and low_stock_threshold is not null and on_hand - reserved <= low_stock_threshold`;
    if (r.n) pending.push({ key: 'dash.low_stock', count: r.n, href: `${base}/inventory?low=1` });
  }
  if (has('orders.manage')) {
    const [r] = await tx<{ n: number }[]>`select count(*)::int as n from orders where status in ('paid','preparing')`;
    if (r.n) pending.push({ key: 'dash.orders_to_prepare', count: r.n, href: `${base}/orders?status=paid` });
  }
  // readiness checklist (same criteria as onboarding)
  const [rd] = await tx<{ service: boolean; staff: boolean; schedule: boolean; contact: boolean; policy: boolean; published: boolean; onboardingDone: boolean }[]>`select
      exists(select 1 from services where status = 'active') as service,
      exists(select 1 from service_staff ss join staff_profiles sp on sp.id = ss.staff_id where sp.status = 'active') as staff,
      exists(select 1 from working_hours where staff_id is not null) as schedule,
      exists(select 1 from tenant_profiles where coalesce(contact_phone, whatsapp, contact_email::text) is not null) as contact,
      exists(select 1 from booking_policies where policy_text is not null and length(trim(policy_text)) > 0) as policy,
      exists(select 1 from tenants where published_version_id is not null) as published,
      exists(select 1 from onboarding_sessions where completed_at is not null) as onboarding_done`;
  return { today, counts, pending, readiness: rd };
}
