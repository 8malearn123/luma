/**
 * Demo seed (synthetic data only — no real personal information).
 *   npm run db:seed
 * Creates: LUMA platform accounts, plans (TEST prices, labeled), "Noura Salon" with
 * a full team, catalog, schedules, products/materials, weeks of history and
 * consistent finance; a second business "Lamsa Studio" (independent expert) with a
 * different identity; customers (ordinary, experimental require_full decision,
 * brand-new); draft + published storefront versions; an incident under review and
 * an appeal; an "Example" marketing plan.
 *
 * Every demo account gets its own random password, printed once and written to
 * storage/demo-credentials.json (gitignored). Accounts are flagged is_demo.
 * Refuses to run in production. Idempotent: skips if demo tenants already exist.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { closeDb, sql, withTenant, type Tx } from '../src/server/db';
import { hashPassword, randomToken, encryptSecret } from '../src/server/crypto';
import { createTenant } from '../src/server/services/tenants';
import { resolveSession, createSession, type SessionUser } from '../src/server/auth/service';
import { generateDraft } from '../src/lib/builder/defaults';
import { newBlock } from '../src/lib/builder/schema';
import { post } from '../src/server/finance/journal';
import { onBookingCompleted } from '../src/server/booking/completion';
import { nextNumber, ensureTenantCustomer } from '../src/server/booking/service';
import { addDays, utcToWall, wallToUtc } from '../src/lib/tz';

if ((process.env.LUMA_DEPLOYMENT === 'production' || (process.env.NODE_ENV === 'production' && process.env.LUMA_DEPLOYMENT !== 'review'))) {
  console.error('Refusing to seed demo data in production.');
  process.exit(1);
}

const TZ = 'Asia/Riyadh';
const creds: { role: string; name: string; identifier: string; password: string }[] = [];

async function user(name: string, email: string, role: string): Promise<SessionUser> {
  const password = `${randomToken(9)}-${randomToken(3)}`;
  const [u] = await sql()<{ id: string }[]>`
    insert into users (email, email_verified_at, password_hash, display_name, is_demo)
    values (${email}, now(), ${await hashPassword(password)}, ${name}, true)
    on conflict (email) do update set display_name = excluded.display_name returning id`;
  await sql()`insert into customer_profiles (user_id, full_name) values (${u.id}, ${name}) on conflict do nothing`;
  creds.push({ role, name, identifier: email, password });
  const s = await createSession(u.id, null, 'seed');
  return (await resolveSession(s.token))!;
}

async function plans() {
  const defs = [
    { code: 'sanaa', ar: 'سناء', en: 'Sanaa', sort: 1, price: 19900, limits: { 'branches.max': 1, 'staff.max': 3, 'services.max': 30, 'custom_pages.max': 3, 'ai.monthly_runs': 5 }, flags: ['products.enabled', 'waitlist.enabled', 'marketing.enabled'] },
    { code: 'wahaj', ar: 'وهج', en: 'Wahaj', sort: 2, price: 39900, limits: { 'branches.max': 3, 'staff.max': 15, 'services.max': 150, 'custom_pages.max': 10, 'ai.monthly_runs': 30 }, flags: ['products.enabled', 'marketing.enabled', 'loyalty.enabled', 'giftcards.enabled', 'waitlist.enabled', 'memberships.enabled', 'group_sessions.enabled'] },
    { code: 'fareed', ar: 'فريد', en: 'Fareed', sort: 3, price: 79900, limits: { 'branches.max': null, 'staff.max': null, 'services.max': null, 'custom_pages.max': null, 'ai.monthly_runs': 200 }, flags: ['products.enabled', 'marketing.enabled', 'loyalty.enabled', 'giftcards.enabled', 'waitlist.enabled', 'memberships.enabled', 'group_sessions.enabled', 'branding.remove_powered_by'] },
  ];
  for (const d of defs) {
    const [p] = await sql()<{ id: string }[]>`
      insert into plans (code, name_ar, name_en, price_monthly_minor, price_is_test, sort, trial_days)
      values (${d.code}, ${d.ar}, ${d.en}, ${d.price}, true, ${d.sort}, 14)
      on conflict (code) do update set name_ar = excluded.name_ar returning id`;
    for (const [k, v] of Object.entries(d.limits)) await sql()`insert into plan_features (plan_id, feature_key, enabled, limit_value) values (${p.id}, ${k}, true, ${v}) on conflict do nothing`;
    for (const k of d.flags) await sql()`insert into plan_features (plan_id, feature_key, enabled) values (${p.id}, ${k}, true) on conflict do nothing`;
  }
}

interface Ctx {
  tenantId: string;
  branchId: string;
  run: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
}

async function staffProfile(tx: Tx, c: Ctx, name: string, nameEn: string, specialty: string, userId: string | null, hours: [string, string], days: number[]) {
  const [s] = await tx<{ id: string }[]>`insert into staff_profiles (tenant_id, user_id, display_name, display_name_en, specialty, bio) values (${c.tenantId}, ${userId}, ${name}, ${nameEn}, ${specialty}, ${`${specialty} — ملف تجريبي`}) returning id`;
  await tx`insert into staff_branch_assignments (tenant_id, staff_id, branch_id) values (${c.tenantId}, ${s.id}, ${c.branchId})`;
  for (const wd of days) await tx`insert into working_hours (tenant_id, branch_id, staff_id, weekday, start_time, end_time) values (${c.tenantId}, ${c.branchId}, ${s.id}, ${wd}, ${hours[0]}, ${hours[1]})`;
  return s.id;
}

async function service(tx: Tx, c: Ctx, o: { name: string; nameEn: string; cat: string; price: number; dur: number; after?: number; staff: string[]; cost?: number | null; desc?: string }) {
  const [s] = await tx<{ id: string }[]>`
    insert into services (tenant_id, category_id, name, name_en, description, price_minor, duration_min, buffer_after_min, material_cost_minor)
    values (${c.tenantId}, ${o.cat}, ${o.name}, ${o.nameEn}, ${o.desc ?? null}, ${o.price}, ${o.dur}, ${o.after ?? 0}, ${o.cost ?? null}) returning id`;
  for (const st of o.staff) await tx`insert into service_staff (tenant_id, service_id, staff_id) values (${c.tenantId}, ${s.id}, ${st})`;
  return s.id;
}

/** Past booking with consistent ledger: cash collection, completion side effects. */
async function pastBooking(tx: Tx, c: Ctx, o: { customer: string; customerUserId: string | null; serviceId: string; serviceName: string; staffId: string; staffName: string; price: number; dur: number; start: Date; status: 'completed' | 'cancelled' | 'no_show'; ownerId: string; depositPaid?: number }) {
  const number = await nextNumber(tx, c.tenantId, 'booking', 'BKG');
  const end = new Date(+o.start + o.dur * 60000);
  const [b] = await tx<{ id: string }[]>`
    insert into bookings (tenant_id, branch_id, number, tenant_customer_id, customer_user_id, status, source, starts_at, ends_at, subtotal_minor, total_minor,
      payment_terms, terms_snapshot, created_by, completed_at, cancelled_at, cancel_source, cancel_reason, no_show_at)
    values (${c.tenantId}, ${c.branchId}, ${number}, ${o.customer}, ${o.customerUserId}, ${o.status === 'completed' ? 'in_service' : o.status}, 'online', ${o.start}, ${end}, ${o.price}, ${o.price},
      'on_site', ${tx.json({ policy: { cancellationWindowHours: 24, lateCancelFeeBps: 0, noShowGraceMin: 15, noShowFeeBps: 10000 }, seeded: true } as never)}, ${o.ownerId},
      null, ${o.status === 'cancelled' ? new Date(+o.start - 2 * 86400000) : null}, ${o.status === 'cancelled' ? 'customer' : null},
      ${o.status === 'cancelled' ? 'تغيّر موعد السفر' : null}, ${o.status === 'no_show' ? new Date(+o.start + 20 * 60000) : null})
    returning id`;
  const [it] = await tx<{ id: string }[]>`
    insert into booking_items (tenant_id, booking_id, seq, service_id, staff_id, service_name, staff_name, price_minor, duration_min, starts_at, ends_at, status, actual_start_at, actual_end_at)
    values (${c.tenantId}, ${b.id}, 0, ${o.serviceId}, ${o.staffId}, ${o.serviceName}, ${o.staffName}, ${o.price}, ${o.dur}, ${o.start}, ${end},
      'active', ${o.status === 'completed' ? new Date(+o.start + 3 * 60000) : null}, ${o.status === 'completed' ? new Date(+end + 4 * 60000) : null}) returning id`;
  await tx`insert into booking_allocations (tenant_id, booking_id, booking_item_id, staff_id, during, active, released_at, release_reason)
           values (${c.tenantId}, ${b.id}, ${it.id}, ${o.staffId}, tstzrange(${o.start}, ${end}), ${o.status === 'completed'},
                   ${o.status === 'completed' ? null : new Date()}, ${o.status === 'completed' ? null : o.status})`;
  await tx`insert into booking_events (tenant_id, booking_id, to_status, kind, source, at) values (${c.tenantId}, ${b.id}, 'confirmed', 'transition', 'seed', ${new Date(+o.start - 5 * 86400000)})`;
  if (o.depositPaid) {
    const [p] = await tx<{ id: string }[]>`insert into payments (tenant_id, purpose, booking_id, kind, method, amount_minor, status, provider, collected_by, collection_ref, idempotency_key, succeeded_at)
      values (${c.tenantId}, 'booking', ${b.id}, 'deposit', 'cash', ${o.depositPaid}, 'succeeded', 'manual', ${o.ownerId}, 'SEED-DEP', ${`seed-dep-${b.id}`}, ${new Date(+o.start - 3 * 86400000)}) returning id`;
    await post(tx, { tenantId: c.tenantId, refType: 'payment', refId: p.id, memo: 'seed deposit', at: new Date(+o.start - 3 * 86400000), lines: [{ account: 'cash', debit: o.depositPaid }, { account: 'customer_deposits', credit: o.depositPaid }] });
  }
  if (o.status === 'completed') {
    const rest = o.price - (o.depositPaid ?? 0);
    if (rest > 0) {
      const [p] = await tx<{ id: string }[]>`insert into payments (tenant_id, purpose, booking_id, kind, method, amount_minor, status, provider, collected_by, collection_ref, idempotency_key, succeeded_at)
        values (${c.tenantId}, 'booking', ${b.id}, 'on_site', 'card_terminal', ${rest}, 'succeeded', 'manual', ${o.ownerId}, ${`POS-${number}`}, ${`seed-pay-${b.id}`}, ${end}) returning id`;
      await post(tx, { tenantId: c.tenantId, refType: 'payment', refId: p.id, memo: 'seed collection', at: end, lines: [{ account: 'card_clearing', debit: rest }, { account: 'customer_deposits', credit: rest }] });
    }
    await tx`update bookings set paid_minor = ${o.price}, financial_status = 'paid', status = 'completed', completed_at = ${end}, checked_in_at = ${o.start}, service_started_at = ${o.start} where id = ${b.id}`;
    await onBookingCompleted(tx, b.id, o.ownerId);
  } else if (o.status === 'no_show' && o.depositPaid) {
    await tx`update bookings set paid_minor = ${o.depositPaid}, financial_status = 'deposit_paid' where id = ${b.id}`;
    await post(tx, { tenantId: c.tenantId, refType: 'booking_fee_retained', refId: b.id, memo: 'no-show deposit retained', lines: [{ account: 'customer_deposits', debit: o.depositPaid }, { account: 'service_revenue', credit: o.depositPaid }] });
  }
  return b.id;
}

async function publish(tx: Tx, tenantId: string, doc: unknown, by: string, note: string) {
  const [{ n }] = await tx<{ n: number }[]>`select coalesce(max(number), 0) + 1 as n from page_versions`;
  const [v] = await tx<{ id: string }[]>`insert into page_versions (tenant_id, number, document, draft_version, published_by, note) values (${tenantId}, ${n}, ${tx.json(doc as never)}, 1, ${by}, ${note}) returning id`;
  await tx`update tenants set published_version_id = ${v.id}, status = 'active' where id = ${tenantId}`;
  return v.id;
}

async function main() {
  const [exists] = await sql()`select 1 from tenants where slug = 'noura-salon'`;
  if (exists) {
    console.log('Demo data already present (tenant noura-salon). Nothing to do.');
    return;
  }
  await plans();

  // ── LUMA platform ──
  const lumaOwner = await user('مالكة لوما (تجريبي)', 'platform.owner@luma.demo', 'LUMA platform owner');
  const reviewer = await user('مراجِعة السياسات (تجريبي)', 'policy.reviewer@luma.demo', 'LUMA policy reviewer');
  const support = await user('دعم لوما (تجريبي)', 'support@luma.demo', 'LUMA support admin');
  await sql()`insert into platform_staff (user_id, role, granted_by) values (${lumaOwner.userId}, 'platform_owner', null), (${reviewer.userId}, 'policy_reviewer', ${lumaOwner.userId}), (${support.userId}, 'support_admin', ${lumaOwner.userId})`;

  // ── Noura Salon ──
  const noura = await user('نورة القحطاني', 'noura@noura-salon.demo', 'Noura Salon · owner');
  const t = await createTenant(noura, { name: 'صالون نورة', businessType: 'salon', city: 'الرياض', branchName: 'فرع الملقا', slug: 'noura-salon', locale: 'ar' }, { isDemo: true });
  const c: Ctx = { tenantId: t.tenantId, branchId: t.branchId, run: (fn) => withTenant({ tenantId: t.tenantId, userId: noura.userId }, fn) };
  const manager = await user('ريم العتيبي', 'reem@noura-salon.demo', 'Noura Salon · manager');
  const reception = await user('دانة الشمري', 'dana@noura-salon.demo', 'Noura Salon · receptionist');
  const hanaU = await user('هناء (أخصائية شعر)', 'hana@noura-salon.demo', 'Noura Salon · specialist');
  const lamaU = await user('لمى (أخصائية أظافر)', 'lama@noura-salon.demo', 'Noura Salon · specialist');
  const finance = await user('مها (المالية)', 'maha@noura-salon.demo', 'Noura Salon · finance');

  const ids = await c.run(async (tx) => {
    await tx`update tenants set legal_name = 'مؤسسة صالون نورة (بيانات تجريبية)', status = 'active' where id = ${c.tenantId}`;
    await tx`update branches set address = 'الرياض، حي الملقا (عنوان تجريبي)', latitude = 24.8125, longitude = 46.6158 where id = ${c.branchId}`;
    await tx`update tenant_profiles set tagline = 'جمالكِ بلمسة هادئة', intro = 'صالون نسائي في الرياض يقدّم خدمات الشعر والأظافر والعناية بالبشرة. (محتوى تجريبي)',
             contact_phone = '+966500000001', whatsapp = '+966500000001', contact_email = 'hello@noura-salon.demo', address = 'الرياض، حي الملقا',
             socials = ${tx.json({ instagram: 'noura.salon.demo' } as never)}, brand_character = ${['luxurious', 'warm']} where tenant_id = ${c.tenantId}`;
    await tx`update booking_policies set deposit_mode = 'percent', deposit_value = 3000, allow_on_site = true, allow_full_online = true, min_notice_min = 120,
             cancellation_window_hours = 24, late_cancel_fee_bps = 5000, no_show_fee_bps = 10000,
             policy_text = 'يُطلب عربون 30٪ لتأكيد الموعد. الإلغاء المجاني قبل 24 ساعة. التأخر أكثر من 15 دقيقة قد يُعدّ عدم حضور. (سياسة تجريبية)' where tenant_id = ${c.tenantId}`;
    for (let wd = 0; wd < 7; wd++) if (wd !== 5) await tx`insert into working_hours (tenant_id, branch_id, staff_id, weekday, start_time, end_time) values (${c.tenantId}, ${c.branchId}, null, ${wd}, '10:00', '22:00')`;
    await tx`insert into tenant_memberships (tenant_id, user_id, role, granted_caps) values
      (${c.tenantId}, ${manager.userId}, 'manager', ${['storefront.edit', 'catalog.manage', 'finance.view', 'marketing.view']}),
      (${c.tenantId}, ${reception.userId}, 'receptionist', '{}'),
      (${c.tenantId}, ${finance.userId}, 'finance', '{}')`;
    const work = [0, 1, 2, 3, 4, 6];
    const hana = await staffProfile(tx, c, 'هناء', 'Hana', 'تصفيف وصبغ الشعر', hanaU.userId, ['12:00', '21:00'], work);
    const lama = await staffProfile(tx, c, 'لمى', 'Lama', 'العناية بالأظافر', lamaU.userId, ['14:00', '22:00'], work);
    const sara = await staffProfile(tx, c, 'سارة', 'Sara', 'العناية بالبشرة والمكياج', null, ['10:00', '18:00'], work);
    await tx`insert into tenant_memberships (tenant_id, user_id, role, staff_profile_id) values (${c.tenantId}, ${hanaU.userId}, 'specialist', ${hana}), (${c.tenantId}, ${lamaU.userId}, 'specialist', ${lama})`;
    for (const wd of work) await tx`insert into breaks (tenant_id, staff_id, weekday, start_time, end_time, label) values (${c.tenantId}, ${hana}, ${wd}, '16:00', '16:30', 'استراحة')`;
    const cat = async (name: string, en: string, kind = 'service') => (await tx<{ id: string }[]>`insert into categories (tenant_id, kind, name, name_en) values (${c.tenantId}, ${kind}, ${name}, ${en}) returning id`)[0].id;
    const hair = await cat('الشعر', 'Hair');
    const nails = await cat('الأظافر', 'Nails');
    const skin = await cat('البشرة', 'Skin');
    const haircut = await service(tx, c, { name: 'قص وتصفيف', nameEn: 'Cut & style', cat: hair, price: 18000, dur: 60, after: 15, staff: [hana], cost: 1500 });
    const color = await service(tx, c, { name: 'صبغة كاملة', nameEn: 'Full color', cat: hair, price: 45000, dur: 120, after: 15, staff: [hana], cost: null });
    const gel = await service(tx, c, { name: 'أظافر جل', nameEn: 'Gel nails', cat: nails, price: 15000, dur: 60, staff: [lama], cost: 2000 });
    const mani = await service(tx, c, { name: 'مناكير كلاسيك', nameEn: 'Classic manicure', cat: nails, price: 9000, dur: 45, staff: [lama, sara], cost: 800 });
    const facial = await service(tx, c, { name: 'تنظيف بشرة عميق', nameEn: 'Deep facial', cat: skin, price: 32000, dur: 75, after: 15, staff: [sara], cost: 4500 });
    const makeup = await service(tx, c, { name: 'مكياج سهرة', nameEn: 'Evening makeup', cat: skin, price: 40000, dur: 90, staff: [sara], cost: null });
    await tx`insert into service_variants (tenant_id, service_id, name, name_en, price_minor, duration_min) values (${c.tenantId}, ${color}, 'شعر قصير', 'Short hair', 38000, 100), (${c.tenantId}, ${color}, 'شعر طويل', 'Long hair', 55000, 150)`;
    await tx`insert into service_addons (tenant_id, service_id, name, name_en, price_minor, duration_min) values (${c.tenantId}, ${gel}, 'رسم فني', 'Nail art', 3000, 15)`;
    const [rt] = await tx<{ id: string }[]>`insert into resource_types (tenant_id, name) values (${c.tenantId}, 'غرفة العناية') returning id`;
    await tx`insert into resources (tenant_id, branch_id, resource_type_id, name) values (${c.tenantId}, ${c.branchId}, ${rt.id}, 'غرفة 1')`;
    await tx`insert into service_resource_requirements (tenant_id, service_id, resource_type_id) values (${c.tenantId}, ${facial}, ${rt.id})`;
    await tx`insert into commission_rules (tenant_id, kind, rate_bps, created_by) values (${c.tenantId}, 'percentage', 1000, ${noura.userId})`;
    // products & materials (one product intentionally lacks a cost)
    const pcat = await cat('منتجات العناية', 'Care products', 'product');
    const prod = async (name: string, en: string, price: number, cost: number | null, stock: number) => {
      const [p] = await tx<{ id: string }[]>`insert into products (tenant_id, category_id, name, name_en, price_minor, cost_minor) values (${c.tenantId}, ${pcat}, ${name}, ${en}, ${price}, ${cost}) returning id`;
      const [i] = await tx<{ id: string }[]>`insert into inventory_items (tenant_id, branch_id, usage, product_id, name, on_hand, low_stock_threshold, unit_cost_minor) values (${c.tenantId}, ${c.branchId}, 'retail', ${p.id}, ${name}, ${stock}, 3, ${cost}) returning id`;
      await tx`insert into stock_movements (tenant_id, inventory_item_id, kind, on_hand_delta, reason, ref_type) values (${c.tenantId}, ${i.id}, 'receipt', ${stock}, 'seed opening stock', 'manual')`;
      return p.id;
    };
    const serum = await prod('سيروم الترطيب', 'Hydrating serum', 12000, 5500, 12);
    await prod('شامبو بالأرغان', 'Argan shampoo', 7500, null, 2);
    await prod('طقم طلاء أظافر', 'Nail polish set', 9500, 4000, 1);
    // sealed care products are returnable; the opened-use nail set is not (products default to not returnable)
    await tx`update products set returnable = true where tenant_id = ${c.tenantId} and name in ('سيروم الترطيب', 'شامبو بالأرغان')`;
    // delivery & returns (synthetic): two zones, cash on delivery, 7-day returns
    await tx`insert into delivery_zones (tenant_id, branch_id, name, cities, districts, fee_minor, free_over_minor, min_order_minor, eta_min_hours, eta_max_hours, sort_order) values
      (${c.tenantId}, ${c.branchId}, 'الرياض', ${['الرياض', 'Riyadh']}, '{}', 2500, 30000, 5000, 24, 48, 0),
      (${c.tenantId}, ${c.branchId}, 'شمال الرياض', ${['الرياض', 'Riyadh']}, ${['الملقا', 'النرجس', 'الياسمين']}, 1500, 20000, 0, 6, 24, 1)`;
    await tx`insert into commerce_settings (tenant_id, pickup_enabled, delivery_enabled, cash_on_delivery, delivery_instructions, returns_enabled, return_window_days, return_policy_text, refund_delivery_fee, updated_by)
      values (${c.tenantId}, true, true, true, 'التوصيل من الأحد إلى الخميس بين 4 و10 مساءً. (تعليمات تجريبية)', true, 7,
              'يمكن إرجاع المنتجات غير المفتوحة خلال 7 أيام من الاستلام. منتجات العناية المفتوحة لا تُرجع إلا إذا كانت تالفة. (سياسة تجريبية)', false, ${noura.userId})`;
    // VAT identity for the demo business (synthetic numbers, valid format only)
    await tx`update finance_settings set tax_registered = true, tax_rate_bps = 1500, prices_include_tax = true, tax_label = 'ضريبة القيمة المضافة',
             seller_vat_number = '300000000000003', cr_number = '1010000000', address_street = 'طريق الأمير محمد بن سعد', address_building_no = '1234',
             address_district = 'الملقا', address_city = 'الرياض', address_postal_code = '13521' where tenant_id = ${c.tenantId}`;
    const [dye] = await tx<{ id: string }[]>`insert into inventory_items (tenant_id, branch_id, usage, name, unit, on_hand, low_stock_threshold, unit_cost_minor) values (${c.tenantId}, ${c.branchId}, 'material', 'صبغة شعر (أنبوب)', 'ml', 1200, 300, 15) returning id`;
    await tx`insert into stock_movements (tenant_id, inventory_item_id, kind, on_hand_delta, reason, ref_type) values (${c.tenantId}, ${dye.id}, 'receipt', 1200, 'seed opening stock', 'manual')`;
    await tx`insert into service_material_recipes (tenant_id, service_id, inventory_item_id, quantity, unit, approved_by, approved_at) values (${c.tenantId}, ${color}, ${dye.id}, 60, 'ml', ${noura.userId}, now())`;
    return { hana, lama, sara, haircut, color, gel, mani, facial, makeup, serum };
  });

  // customers
  const amal = await user('أمل (عميلة تجريبية)', 'amal@customer.demo', 'Customer · ordinary');
  const fatimah = await user('فاطمة (عميلة تجريبية)', 'fatimah@customer.demo', 'Customer · experimental require_full decision');
  await user('جود (عميلة جديدة)', 'joud@customer.demo', 'Customer · new, no history');
  const history = await c.run(async (tx) => {
    const amalTc = await ensureTenantCustomer(tx, c.tenantId, { userId: amal.userId, displayName: 'أمل' });
    const fatTc = await ensureTenantCustomer(tx, c.tenantId, { userId: fatimah.userId, displayName: 'فاطمة' });
    const walkins: string[] = [];
    for (let i = 1; i <= 12; i++) walkins.push(await ensureTenantCustomer(tx, c.tenantId, { displayName: `عميلة ${i} (تجريبي)`, phone: `+96650000${String(1000 + i)}`, source: 'walk_in' }));
    await tx`update tenant_customers set private_notes = 'تفضّل المواعيد المسائية. (ملاحظة تجريبية)' where id = ${amalTc}`;
    // six weeks of history
    const today = utcToWall(new Date(), TZ).date;
    const svcs = [
      { id: ids.haircut, name: 'قص وتصفيف', staff: ids.hana, staffName: 'هناء', price: 18000, dur: 60, time: '13:00' },
      { id: ids.color, name: 'صبغة كاملة', staff: ids.hana, staffName: 'هناء', price: 45000, dur: 120, time: '17:00' },
      { id: ids.gel, name: 'أظافر جل', staff: ids.lama, staffName: 'لمى', price: 15000, dur: 60, time: '15:00' },
      { id: ids.mani, name: 'مناكير كلاسيك', staff: ids.lama, staffName: 'لمى', price: 9000, dur: 45, time: '19:00' },
      { id: ids.facial, name: 'تنظيف بشرة عميق', staff: ids.sara, staffName: 'سارة', price: 32000, dur: 75, time: '11:00' },
    ];
    let k = 0;
    let fatimahNoShow: string | null = null;
    for (let d = 42; d >= 1; d--) {
      const date = addDays(today, -d);
      if (new Date(`${date}T12:00:00Z`).getUTCDay() === 5) continue;
      for (let j = 0; j < 2; j++) {
        const s = svcs[(k + j) % svcs.length];
        const roll = (k * 7 + j * 3) % 20;
        const status = roll === 0 ? 'no_show' : roll < 3 ? 'cancelled' : 'completed';
        const isFat = k % 9 === 4 && j === 0;
        const cust = isFat ? fatTc : j === 1 && k % 4 === 0 ? amalTc : walkins[(k + j) % walkins.length];
        const id = await pastBooking(tx, c, {
          customer: cust,
          customerUserId: isFat ? fatimah.userId : cust === amalTc ? amal.userId : null,
          serviceId: s.id, serviceName: s.name, staffId: s.staff, staffName: s.staffName, price: s.price, dur: s.dur,
          start: wallToUtc(date, s.time, TZ), status: isFat ? 'no_show' : status, ownerId: noura.userId,
          depositPaid: isFat || status === 'no_show' ? Math.round(s.price * 0.3) : undefined,
        });
        if (isFat && !fatimahNoShow) fatimahNoShow = id;
      }
      k++;
    }
    return { fatTc, fatimahNoShow, amalTc };
  });

  // reviews tied to completed visits
  await c.run(async (tx) => {
    const done = await tx<{ id: string; tenantCustomerId: string; staffId: string }[]>`
      select b.id, b.tenant_customer_id, i.staff_id from bookings b join booking_items i on i.booking_id = b.id where b.status = 'completed' order by b.starts_at desc limit 8`;
    const comments = ['تجربة هادئة ونتيجة جميلة.', 'التزام بالموعد وخدمة لطيفة.', 'راضية جداً عن النتيجة.', 'المكان نظيف ومريح.'];
    let i = 0;
    for (const b of done) {
      await tx`insert into reviews (tenant_id, booking_id, tenant_customer_id, staff_id, rating, comment, display_name) values (${c.tenantId}, ${b.id}, ${b.tenantCustomerId}, ${b.staffId}, ${i % 5 === 3 ? 4 : 5}, ${comments[i % comments.length] + ' (تقييم تجريبي)'}, ${`عميلة ${i + 1}`})`;
      i++;
    }
  });

  // experimental decision + incident under review + appeal
  await c.run(async (tx) => {
    if (!history.fatimahNoShow) return;
    const [inc] = await tx<{ id: string }[]>`insert into customer_incidents (tenant_id, booking_id, tenant_customer_id, customer_user_id, type, description, occurred_at, submitted_by, status)
      select ${c.tenantId}, id, tenant_customer_id, customer_user_id, 'no_show', 'لم تحضر العميلة ولم تعتذر (بلاغ تجريبي).', starts_at + interval '20 minutes', ${noura.userId}, 'under_review'
      from bookings where id = ${history.fatimahNoShow} returning id`;
    await tx`insert into incident_evidence (tenant_id, incident_id, kind, ref, added_by) values (${c.tenantId}, ${inc.id}, 'note', 'سجل الحجز يظهر عدم الحضور', ${noura.userId})`;
    const [dec] = await tx<{ id: string }[]>`insert into policy_decisions (customer_user_id, scope, tenant_id, action, reason_code, reason_internal, customer_explanation, evidence_refs, reviewer_user_id, reviewer_role, expires_at, review_at, is_experimental)
      values (${fatimah.userId}, 'tenant', ${c.tenantId}, 'require_full_payment', 'repeated_no_show', 'قرار تجريبي للعرض: تكرار عدم الحضور', 'يتطلب هذا الصالون الدفع الكامل مسبقاً لحجوزاتكِ القادمة. يمكنكِ طلب مراجعة القرار.',
              ${[inc.id]}, ${noura.userId}, 'owner', now() + interval '90 days', now() + interval '30 days', true) returning id`;
    await tx`insert into appeals (customer_user_id, decision_id, tenant_id, statement) values (${fatimah.userId}, ${dec.id}, ${c.tenantId}, 'كان لدي ظرف طارئ في ذلك اليوم وأرجو مراجعة القرار. (طلب تجريبي)')`;
  });

  // orders: one collected, one awaiting pickup
  await c.run(async (tx) => {
    for (const [i, status] of (['collected', 'paid'] as const).entries()) {
      const number = await nextNumber(tx, c.tenantId, 'order', 'ORD');
      const [inv] = await tx<{ id: string }[]>`select id from inventory_items where product_id = ${ids.serum}`;
      const [o] = await tx<{ id: string }[]>`insert into orders (tenant_id, branch_id, number, tenant_customer_id, customer_user_id, status, subtotal_minor, total_minor, paid_minor, payment_terms)
        values (${c.tenantId}, ${c.branchId}, ${number}, ${history.amalTc}, ${amal.userId}, ${status}, 12000, 12000, 12000, 'full') returning id`;
      await tx`insert into order_items (tenant_id, order_id, product_id, inventory_item_id, name, unit_price_minor, unit_cost_minor, quantity, line_total_minor) values (${c.tenantId}, ${o.id}, ${ids.serum}, ${inv.id}, 'سيروم الترطيب', 12000, 5500, 1, 12000)`;
      await tx`insert into fulfillments (tenant_id, order_id, status, collected_at) values (${c.tenantId}, ${o.id}, ${status === 'collected' ? 'collected' : 'pending'}, ${status === 'collected' ? new Date() : null})`;
      const [p] = await tx<{ id: string }[]>`insert into payments (tenant_id, purpose, order_id, kind, method, amount_minor, status, provider, collected_by, collection_ref, idempotency_key, succeeded_at)
        values (${c.tenantId}, 'order', ${o.id}, 'on_site', 'cash', 12000, 'succeeded', 'manual', ${reception.userId}, ${`CASH-${number}`}, ${`seed-ord-${o.id}`}, now() - make_interval(days => ${i + 2})) returning id`;
      await post(tx, { tenantId: c.tenantId, refType: 'payment', refId: p.id, memo: 'seed order payment', lines: [{ account: 'cash', debit: 12000 }, { account: 'customer_deposits', credit: 12000 }] });
      if (status === 'collected') {
        await tx`update inventory_items set on_hand = on_hand - 1 where id = ${inv.id}`;
        await tx`insert into stock_movements (tenant_id, inventory_item_id, kind, on_hand_delta, reason, ref_type, ref_id) values (${c.tenantId}, ${inv.id}, 'sale', -1, 'collected', 'order', ${o.id})`;
        await post(tx, { tenantId: c.tenantId, refType: 'order_collected', refId: o.id, lines: [{ account: 'customer_deposits', debit: 12000 }, { account: 'product_revenue', credit: 12000 }] });
        await post(tx, { tenantId: c.tenantId, refType: 'order_cogs', refId: o.id, lines: [{ account: 'cogs', debit: 5500 }, { account: 'inventory', credit: 5500 }] });
      } else {
        await tx`update inventory_items set reserved = reserved + 1 where id = ${inv.id}`;
        await tx`insert into stock_reservations (tenant_id, inventory_item_id, order_id, quantity, expires_at) values (${c.tenantId}, ${inv.id}, ${o.id}, 1, 'infinity')`;
        await tx`insert into stock_movements (tenant_id, inventory_item_id, kind, reserved_delta, reason, ref_type, ref_id) values (${c.tenantId}, ${inv.id}, 'reservation', 1, 'order paid', 'order', ${o.id})`;
      }
    }
    await tx`insert into expenses (tenant_id, branch_id, category, amount_minor, incurred_on, description, recorded_by) values
      (${c.tenantId}, ${c.branchId}, 'rent', 1500000, current_date - 20, 'إيجار الشهر (تجريبي)', ${noura.userId}),
      (${c.tenantId}, ${c.branchId}, 'supplies', 230000, current_date - 9, 'مستلزمات (تجريبي)', ${finance.userId})`;
  });

  // storefront: published v1 + a newer draft; sandbox payments connected
  await c.run(async (tx) => {
    const doc = generateDraft({ businessName: 'صالون نورة', businessType: 'salon', character: ['luxurious', 'warm'], tagline: 'جمالكِ بلمسة هادئة', priorities: ['booking', 'products', 'portfolio'] });
    await publish(tx, c.tenantId, doc, noura.userId, 'seed: first publication');
    const draft = structuredClone(doc);
    draft.layout.pages[0].blocks.splice(1, 0, newBlock('welcome', { message: { ar: 'عرض الافتتاح: خصم على أول زيارة (مسودة غير منشورة)', en: 'Opening offer (unpublished draft)' } }));
    await tx`update storefront_drafts set document = ${tx.json(draft as never)}, version = 2, updated_by = ${noura.userId}, updated_at = now() where tenant_id = ${c.tenantId}`;
    await tx`update onboarding_sessions set completed_steps = '{1,2,3,4,5,6,7}', current_step = 7, completed_at = now() where tenant_id = ${c.tenantId}`;
    if (process.env.PAYMENTS_SANDBOX_ENABLED === '1') {
      await tx`insert into payment_accounts (tenant_id, provider, mode, status, secret_ciphertext, webhook_secret_ciphertext, methods_enabled, verified_at)
               values (${c.tenantId}, 'sandbox', 'test', 'active', ${encryptSecret(randomToken(24))}, ${encryptSecret(randomToken(32))}, ${['sandbox_card']}, now())`;
    }
    await tx`update loyalty_rules set enabled = true, points_per_sar = 1, expiry_days = 365 where tenant_id = ${c.tenantId}`;
    // "Example" marketing plan (AI disconnected) — clearly labeled
    const start = utcToWall(new Date(), TZ).date.slice(0, 8) + '01';
    const [plan] = await tx<{ id: string }[]>`insert into marketing_plans (tenant_id, horizon, period_start, period_end, title, status, source, is_example, created_by)
      values (${c.tenantId}, 'monthly', ${start}, (${start}::date + interval '1 month - 1 day')::date, 'مثال توضيحي: خطة شهرية لملء أوقات الظهيرة', 'draft', 'example', true, ${noura.userId}) returning id`;
    await tx`insert into plan_versions (tenant_id, plan_id, number, content, change_note, created_by) values (${c.tenantId}, ${plan.id}, 1, ${tx.json({
      label: 'EXAMPLE — not generated from your data',
      goal: 'رفع إشغال الفترة 12:00–15:00 في أيام الأحد–الثلاثاء',
      baseline: null, baselineNote: 'يُحسب من بياناتكِ عند ربط المحلل',
      initiatives: [{ title: 'باقة الظهيرة: مناكير + تنظيف بشرة', channel: 'instagram', owner: 'المالكة', budget: null }],
      metrics: ['bookings in 12:00–15:00', 'completed revenue'],
    } as never)}, 'seed example', ${noura.userId})`;
  });

  // ── Lamsa Studio (independent expert, different identity) ──
  const lamsa = await user('لمسة الحربي (خبيرة مكياج)', 'lamsa@lamsa-studio.demo', 'Lamsa Studio · owner (expert)');
  const t2 = await createTenant(lamsa, { name: 'استوديو لمسة', businessType: 'expert', city: 'جدة', slug: 'lamsa-studio', locale: 'ar' }, { isDemo: true });
  const c2: Ctx = { tenantId: t2.tenantId, branchId: t2.branchId, run: (fn) => withTenant({ tenantId: t2.tenantId, userId: lamsa.userId }, fn) };
  await c2.run(async (tx) => {
    await tx`update tenant_profiles set tagline = 'مكياج المناسبات بلمسة طبيعية', intro = 'خبيرة مكياج مستقلة في جدة. (محتوى تجريبي)', contact_phone = '+966500000002', whatsapp = '+966500000002' where tenant_id = ${c2.tenantId}`;
    await tx`update booking_policies set deposit_mode = 'none', allow_on_site = true where tenant_id = ${c2.tenantId}`;
    for (let wd = 0; wd < 7; wd++) await tx`insert into working_hours (tenant_id, branch_id, staff_id, weekday, start_time, end_time) values (${c2.tenantId}, ${c2.branchId}, null, ${wd}, '09:00', '23:00')`;
    const me = await staffProfile(tx, c2, 'لمسة', 'Lamsa', 'مكياج المناسبات', lamsa.userId, ['15:00', '23:00'], [0, 1, 2, 3, 4, 5, 6]);
    await tx`update tenant_memberships set staff_profile_id = ${me} where tenant_id = ${c2.tenantId} and user_id = ${lamsa.userId}`;
    const [cat] = await tx<{ id: string }[]>`insert into categories (tenant_id, kind, name, name_en) values (${c2.tenantId}, 'service', 'المكياج', 'Makeup') returning id`;
    await service(tx, c2, { name: 'مكياج ناعم', nameEn: 'Soft glam', cat: cat.id, price: 35000, dur: 60, staff: [me] });
    await service(tx, c2, { name: 'مكياج عروس', nameEn: 'Bridal makeup', cat: cat.id, price: 150000, dur: 150, staff: [me] });
    const doc = generateDraft({ businessName: 'استوديو لمسة', businessType: 'expert', character: ['minimal', 'natural'], tagline: 'مكياج المناسبات بلمسة طبيعية', priorities: ['portfolio', 'booking'], hasProducts: false });
    await publish(tx, c2.tenantId, doc, lamsa.userId, 'seed: first publication');
    await tx`update onboarding_sessions set completed_steps = '{1,2,3,4,5,6,7}', current_step = 7, completed_at = now() where tenant_id = ${c2.tenantId}`;
  });

  const dir = process.env.STORAGE_LOCAL_DIR ?? './storage';
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/demo-credentials.json`, JSON.stringify({ generatedAt: new Date().toISOString(), note: 'DEMO ONLY — synthetic accounts; unique random passwords; never reuse.', accounts: creds }, null, 2), { mode: 0o600 });
  console.log(`\nDemo data created. Credentials (also in ${dir}/demo-credentials.json):`);
  console.table(creds.map((c) => ({ role: c.role, login: c.identifier, password: c.password })));
  void randomUUID;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
