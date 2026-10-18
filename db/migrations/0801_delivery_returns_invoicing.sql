-- ═══════════════════════════════════════════════════════════════════════════
-- LUMA 0801 — delivery, returns, tax-invoice data, provider connections,
-- messaging templates, realtime notification signal.
-- Additive only: constraints are relaxed/extended, nothing is dropped that
-- holds data. Existing pickup orders are unaffected.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- DELIVERY
-- ─────────────────────────────────────────────────────────────
-- delivery was "designed for, not enabled" (0004): lift the pickup-only check
alter table orders drop constraint if exists orders_fulfillment_method_check1;
-- total now includes the delivery fee (coupons never discount the fee)
alter table orders add column delivery_fee_minor bigint not null default 0 check (delivery_fee_minor >= 0);
alter table orders drop constraint if exists orders_check;
alter table orders add constraint orders_total_check
  check (total_minor = subtotal_minor - discount_minor + tax_minor + delivery_fee_minor);
alter table orders add column delivery_zone_id uuid;
alter table orders add column delivery_address jsonb;   -- snapshot at checkout; never re-derived
alter table orders add constraint orders_delivery_address
  check (fulfillment_method = 'pickup' or delivery_address is not null);

-- per-tenant commerce settings: fulfillment methods + return policy
create table commerce_settings (
  tenant_id              uuid primary key references tenants(id) on delete cascade,
  pickup_enabled         boolean not null default true,
  delivery_enabled       boolean not null default false,
  cash_on_delivery       boolean not null default false,
  delivery_instructions  text check (length(delivery_instructions) <= 1000),
  returns_enabled        boolean not null default false,
  return_window_days     int not null default 7 check (return_window_days between 0 and 90),
  return_policy_text     text check (length(return_policy_text) <= 4000),
  return_shipping_paid_by text not null default 'customer' check (return_shipping_paid_by in ('customer','business')),
  refund_delivery_fee    boolean not null default false,
  updated_by             uuid references users(id),
  updated_at             timestamptz not null default now(),
  check (pickup_enabled or delivery_enabled)
);

create table delivery_zones (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  branch_id        uuid not null,
  name             text not null check (length(trim(name)) between 1 and 80),
  cities           text[] not null default '{}',     -- matched case-insensitively against the address city
  districts        text[] not null default '{}',     -- empty = whole city
  fee_minor        bigint not null check (fee_minor >= 0),
  free_over_minor  bigint check (free_over_minor is null or free_over_minor > 0),
  min_order_minor  bigint not null default 0 check (min_order_minor >= 0),
  eta_min_hours    int not null default 24 check (eta_min_hours between 1 and 720),
  eta_max_hours    int not null default 72 check (eta_max_hours between 1 and 720),
  is_active        boolean not null default true,
  sort_order       int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (eta_max_hours >= eta_min_hours),
  check (cardinality(cities) between 1 and 30),
  unique (tenant_id, id),
  foreign key (tenant_id, branch_id) references branches(tenant_id, id)
);
alter table orders add constraint orders_delivery_zone_fk foreign key (tenant_id, delivery_zone_id) references delivery_zones(tenant_id, id);

-- central customer address book (belongs to the person, not to a business)
create table customer_addresses (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references users(id) on delete cascade,
  label          text check (length(label) <= 40),
  recipient_name text not null check (length(trim(recipient_name)) between 1 and 120),
  phone          text not null check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  city           text not null check (length(trim(city)) between 1 and 80),
  district       text check (length(district) <= 80),
  street         text not null check (length(trim(street)) between 1 and 200),
  building_no    text check (length(building_no) <= 20),
  postal_code    text check (postal_code is null or postal_code ~ '^[0-9]{5}$'),
  notes          text check (length(notes) <= 300),
  is_default     boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index customer_addresses_user on customer_addresses(user_id);
create unique index customer_addresses_one_default on customer_addresses(user_id) where is_default;
alter table customer_addresses enable row level security;
alter table customer_addresses force row level security;
create policy owner_only on customer_addresses
  using (app.is_system() or user_id = app.user_id())
  with check (app.is_system() or user_id = app.user_id());

-- fulfillment: delivery stages + courier/tracking
alter table fulfillments drop constraint if exists fulfillments_status_check;
alter table fulfillments add constraint fulfillments_status_check
  check (status in ('pending','ready','out_for_delivery','failed_attempt','collected','delivered','cancelled'));
alter table fulfillments add column courier_name text check (length(courier_name) <= 80);
alter table fulfillments add column tracking_ref text check (length(tracking_ref) <= 80);
alter table fulfillments add column tracking_url text check (tracking_url is null or (length(tracking_url) <= 500 and tracking_url ~ '^https://[^[:space:]]+$'));
alter table fulfillments add column dispatched_at timestamptz;
alter table fulfillments add column delivered_at timestamptz;
alter table fulfillments add column attempts int not null default 0;

-- timeline shown to the customer and staff (append-only)
create table fulfillment_events (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  order_id      uuid not null,
  status        text not null,
  note          text check (length(note) <= 500),
  actor_user_id uuid references users(id),
  created_at    timestamptz not null default now(),
  foreign key (tenant_id, order_id) references orders(tenant_id, id)
);
create index fulfillment_events_order on fulfillment_events(tenant_id, order_id, created_at);

-- delivery fee revenue is kept apart from product revenue
alter table financial_entries drop constraint if exists financial_entries_account_check;
alter table financial_entries add constraint financial_entries_account_check check (account in (
  'cash','card_clearing','provider_clearing',
  'customer_deposits','gift_card_liability','membership_liability',
  'service_revenue','product_revenue','delivery_revenue','discounts','refunds',
  'processing_fees','expenses','commission_expense','commission_payable',
  'cogs','inventory','tax_payable','accounts_payable'));

-- ─────────────────────────────────────────────────────────────
-- RETURNS
-- ─────────────────────────────────────────────────────────────
alter table returns drop constraint if exists returns_status_check;
alter table returns add constraint returns_status_check
  check (status in ('requested','approved','rejected','received','completed','cancelled'));
alter table returns add column request_number text;
alter table returns add column customer_user_id uuid references users(id);
alter table returns add column requested_by uuid references users(id);
alter table returns add column reason_code text not null default 'other'
  check (reason_code in ('damaged','wrong_item','not_as_described','changed_mind','allergy','other'));
alter table returns add column decision_note text check (length(decision_note) <= 500);
alter table returns add column refund_amount_minor bigint check (refund_amount_minor is null or refund_amount_minor >= 0);
alter table returns add column decided_at timestamptz;
alter table returns add column received_at timestamptz;
alter table returns add column completed_at timestamptz;
alter table returns add column updated_at timestamptz not null default now();
alter table returns add constraint returns_reason_len check (length(reason) between 1 and 500);
create index returns_tenant_status on returns(tenant_id, status, created_at desc);
create index returns_order on returns(tenant_id, order_id);
create trigger returns_touch before update on returns for each row execute function app.touch_updated_at();
select app.enable_customer_read('returns');

-- ─────────────────────────────────────────────────────────────
-- TAX INVOICES (ZATCA-shaped data; NOT connected to the e-invoicing platform)
-- ─────────────────────────────────────────────────────────────
alter table finance_settings add column seller_vat_number text check (seller_vat_number is null or seller_vat_number ~ '^3[0-9]{13}3$');
alter table finance_settings add column cr_number text check (cr_number is null or cr_number ~ '^[0-9]{10}$');
alter table finance_settings add column address_street text check (length(address_street) <= 120);
alter table finance_settings add column address_building_no text check (address_building_no is null or address_building_no ~ '^[0-9]{4}$');
alter table finance_settings add column address_district text check (length(address_district) <= 80);
alter table finance_settings add column address_city text check (length(address_city) <= 80);
alter table finance_settings add column address_postal_code text check (address_postal_code is null or address_postal_code ~ '^[0-9]{5}$');
alter table finance_settings add column address_additional_no text check (address_additional_no is null or address_additional_no ~ '^[0-9]{4}$');
alter table finance_settings add column einvoicing_status text not null default 'not_connected'
  check (einvoicing_status in ('not_connected'));   -- widened when a Fatoora integration is built and verified

alter table invoices add column invoice_type text not null default 'simplified' check (invoice_type in ('simplified','standard'));
alter table invoices add column icv int;                 -- invoice counter value, per tenant, gap-free
alter table invoices add column previous_hash text;      -- internal tamper-evidence chain (SHA-256), NOT the ZATCA cryptographic stamp
alter table invoices add column content_hash text;
alter table invoices add column qr_tlv text;             -- base64 TLV (seller, VAT no., timestamp, total, VAT) when VAT-registered
alter table invoices add column credit_reason text check (length(credit_reason) <= 300);
alter table invoices add column return_id uuid;
alter table invoices add column einvoicing_status text not null default 'not_submitted' check (einvoicing_status in ('not_submitted'));
create unique index invoices_icv on invoices(tenant_id, icv) where icv is not null;
alter table invoices add constraint invoices_credit_fk foreign key (tenant_id, credit_for_id) references invoices(tenant_id, id);
alter table returns add constraint returns_tenant_id_key unique (tenant_id, id);
alter table invoices add constraint invoices_return_fk foreign key (tenant_id, return_id) references returns(tenant_id, id);

-- ─────────────────────────────────────────────────────────────
-- PAYMENT PROVIDER CONNECTION (Moyasar keys entered by the business)
-- ─────────────────────────────────────────────────────────────
alter table payment_accounts add column last_test_at timestamptz;
alter table payment_accounts add column last_test_result text check (last_test_result in ('ok','failed','unreachable'));
alter table payment_accounts add column last_test_detail text check (length(last_test_detail) <= 300);
alter table payment_accounts add column key_hint text check (length(key_hint) <= 24);   -- e.g. "sk_test_…a1b2"; never the key
alter table payment_accounts add column configured_by uuid references users(id);
create unique index payment_accounts_one_pending on payment_accounts(tenant_id, provider)
  where status = 'pending_verification' and tenant_id is not null;

-- ─────────────────────────────────────────────────────────────
-- MESSAGING: per-business channel preferences + templates
-- ─────────────────────────────────────────────────────────────
create table messaging_settings (
  tenant_id            uuid primary key references tenants(id) on delete cascade,
  sender_name          text check (length(sender_name) <= 40),
  reply_to_email       citext,
  email_enabled        boolean not null default false,
  sms_enabled          boolean not null default false,
  whatsapp_enabled     boolean not null default false,
  reminder_hours       int[] not null default '{24}',
  quiet_start          time,
  quiet_end            time,
  updated_by           uuid references users(id),
  updated_at           timestamptz not null default now(),
  check (cardinality(reminder_hours) <= 3 and 0 < all(reminder_hours) and 169 > all(reminder_hours))
);

create table message_templates (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references tenants(id) on delete cascade,     -- NULL = LUMA default
  key         text not null check (key in ('booking_confirmed','booking_reminder','booking_cancelled','booking_rescheduled',
                                             'order_confirmed','order_ready','order_out_for_delivery','order_delivered',
                                             'return_update','waitlist_offer','verification_code')),
  channel     text not null check (channel in ('email','sms','whatsapp')),
  locale      text not null check (locale in ('ar','en')),
  subject     text check (length(subject) <= 150),
  body        text not null check (length(trim(body)) between 1 and 2000),
  is_active   boolean not null default true,
  version     int not null default 1,
  updated_by  uuid references users(id),
  updated_at  timestamptz not null default now(),
  -- verification codes are platform-owned: a business can never rewrite them
  check (tenant_id is null or key <> 'verification_code')
);
create unique index message_templates_key on message_templates(coalesce(tenant_id, '00000000-0000-0000-0000-000000000000'::uuid), key, channel, locale);
alter table message_templates enable row level security;
alter table message_templates force row level security;
create policy tenant_or_default on message_templates
  using (app.is_system() or tenant_id = app.tenant_id() or tenant_id is null)
  with check (app.is_system() or (tenant_id is not null and tenant_id = app.tenant_id()));

insert into message_templates (tenant_id, key, channel, locale, subject, body) values
  (null, 'booking_confirmed', 'whatsapp', 'ar', null, 'مرحباً {customer_name}، تم تأكيد حجزك رقم {booking_number} لدى {business_name} يوم {date} الساعة {time}.'),
  (null, 'booking_confirmed', 'whatsapp', 'en', null, 'Hi {customer_name}, your booking {booking_number} at {business_name} is confirmed for {date} at {time}.'),
  (null, 'booking_confirmed', 'sms', 'ar', null, 'تم تأكيد حجزك {booking_number} لدى {business_name} يوم {date} {time}.'),
  (null, 'booking_confirmed', 'sms', 'en', null, 'Booking {booking_number} at {business_name} confirmed: {date} {time}.'),
  (null, 'booking_confirmed', 'email', 'ar', 'تأكيد حجزك لدى {business_name}', E'مرحباً {customer_name}،\nتم تأكيد حجزك رقم {booking_number} يوم {date} الساعة {time}.\nالخدمات: {services}'),
  (null, 'booking_confirmed', 'email', 'en', 'Your booking at {business_name} is confirmed', E'Hi {customer_name},\nYour booking {booking_number} is confirmed for {date} at {time}.\nServices: {services}'),
  (null, 'booking_reminder', 'whatsapp', 'ar', null, 'تذكير: موعدك لدى {business_name} يوم {date} الساعة {time}. رقم الحجز {booking_number}.'),
  (null, 'booking_reminder', 'whatsapp', 'en', null, 'Reminder: your appointment at {business_name} is on {date} at {time}. Booking {booking_number}.'),
  (null, 'booking_reminder', 'sms', 'ar', null, 'تذكير بموعدك لدى {business_name}: {date} {time}.'),
  (null, 'booking_reminder', 'sms', 'en', null, 'Reminder: {business_name}, {date} {time}.'),
  (null, 'booking_cancelled', 'whatsapp', 'ar', null, 'تم إلغاء حجزك رقم {booking_number} لدى {business_name}.'),
  (null, 'booking_cancelled', 'whatsapp', 'en', null, 'Your booking {booking_number} at {business_name} was cancelled.'),
  (null, 'booking_rescheduled', 'whatsapp', 'ar', null, 'تم تغيير موعد حجزك {booking_number} إلى {date} الساعة {time}.'),
  (null, 'booking_rescheduled', 'whatsapp', 'en', null, 'Your booking {booking_number} was moved to {date} at {time}.'),
  (null, 'order_confirmed', 'whatsapp', 'ar', null, 'شكراً {customer_name}، استلمنا طلبك رقم {order_number} من {business_name}.'),
  (null, 'order_confirmed', 'whatsapp', 'en', null, 'Thanks {customer_name}, we received your order {order_number} from {business_name}.'),
  (null, 'order_ready', 'whatsapp', 'ar', null, 'طلبك رقم {order_number} جاهز للاستلام من {business_name}.'),
  (null, 'order_ready', 'whatsapp', 'en', null, 'Your order {order_number} is ready for pickup at {business_name}.'),
  (null, 'order_out_for_delivery', 'whatsapp', 'ar', null, 'طلبك رقم {order_number} في الطريق إليك. التتبع: {tracking}'),
  (null, 'order_out_for_delivery', 'whatsapp', 'en', null, 'Your order {order_number} is on its way. Tracking: {tracking}'),
  (null, 'order_delivered', 'whatsapp', 'ar', null, 'تم توصيل طلبك رقم {order_number}. شكراً لتسوقك من {business_name}.'),
  (null, 'order_delivered', 'whatsapp', 'en', null, 'Your order {order_number} was delivered. Thank you for shopping at {business_name}.'),
  (null, 'return_update', 'whatsapp', 'ar', null, 'تحديث على طلب الإرجاع {return_number}: {status}.'),
  (null, 'return_update', 'whatsapp', 'en', null, 'Update on return {return_number}: {status}.'),
  (null, 'waitlist_offer', 'whatsapp', 'ar', null, 'توفر موعد لدى {business_name} يوم {date} الساعة {time}. أكّدي خلال المهلة من حسابك.'),
  (null, 'waitlist_offer', 'whatsapp', 'en', null, 'A slot opened at {business_name} on {date} at {time}. Confirm from your account before it expires.'),
  (null, 'verification_code', 'sms', 'ar', null, 'رمز التحقق في لوما: {code}. لا تشاركيه مع أحد.'),
  (null, 'verification_code', 'sms', 'en', null, 'Your LUMA verification code: {code}. Do not share it.'),
  (null, 'verification_code', 'email', 'ar', 'رمز التحقق في لوما', E'رمز التحقق: {code}\nصالح لمدة 10 دقائق. إذا لم تطلبيه فتجاهلي هذه الرسالة.'),
  (null, 'verification_code', 'email', 'en', 'Your LUMA verification code', E'Your code: {code}\nValid for 10 minutes. If you did not request it, ignore this message.');

-- delivery log: who triggered it + the rendered preview (simulated sends)
alter table notification_deliveries add column preview text check (length(preview) <= 2000);
alter table notification_deliveries add column is_test boolean not null default false;
create index notification_deliveries_tenant on notification_deliveries(tenant_id, created_at desc);

-- ─────────────────────────────────────────────────────────────
-- REALTIME: signal new notifications (LISTEN luma_notifications)
-- payload carries only the user id — clients re-fetch through the API
-- ─────────────────────────────────────────────────────────────
create or replace function app.notify_new_notification() returns trigger language plpgsql as $$
begin
  perform pg_notify('luma_notifications', new.user_id::text);
  return null;
end $$;
create trigger notifications_signal after insert or update of read_at on notifications
  for each row execute function app.notify_new_notification();

select app.enable_tenant_rls('commerce_settings');
select app.enable_tenant_rls('delivery_zones');
select app.enable_tenant_rls('fulfillment_events');
select app.enable_tenant_rls('messaging_settings');

-- hosted-checkout providers (Moyasar invoices) return a checkout reference first and the
-- real charge id later; refunds and webhook matching need the charge id
alter table payments add column provider_charge_id text;
create unique index payments_provider_charge on payments(provider, provider_charge_id) where provider_charge_id is not null;
