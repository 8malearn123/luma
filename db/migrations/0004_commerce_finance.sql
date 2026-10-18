-- ═══════════════════════════════════════════════════════════════════════════
-- LUMA 0004 — products, inventory ledger, carts, orders, payments, refunds,
-- provider events, finance journal, invoices
-- ═══════════════════════════════════════════════════════════════════════════

create table products (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id) on delete cascade,
  category_id         uuid,
  sku                 text,
  barcode             text,
  name                text not null check (length(trim(name)) between 1 and 160),
  name_en             text,
  description         text check (length(description) <= 4000),
  description_en      text check (length(description_en) <= 4000),
  price_minor         bigint not null check (price_minor >= 0),
  cost_minor          bigint check (cost_minor >= 0),          -- private; NULL = unknown
  currency            char(3) not null default 'SAR',
  status              text not null default 'active' check (status in ('active','inactive','archived')),
  is_visible          boolean not null default true,
  hide_when_out_of_stock boolean not null default false,
  max_per_order       int not null default 10 check (max_per_order between 1 and 100),
  returnable          boolean not null default false,
  sort                int not null default 0,
  version             int not null default 1,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, category_id) references categories(tenant_id, id)
);
create unique index products_sku on products(tenant_id, sku) where sku is not null;

create table product_images (
  tenant_id  uuid not null,
  product_id uuid not null,
  asset_id   uuid not null,
  sort       int not null default 0,
  primary key (tenant_id, product_id, asset_id),
  foreign key (tenant_id, product_id) references products(tenant_id, id),
  foreign key (tenant_id, asset_id) references assets(tenant_id, id)
);

create table product_variants (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  product_id  uuid not null,
  name        text not null,
  name_en     text,
  sku         text,
  price_minor bigint check (price_minor >= 0),   -- NULL = product price
  cost_minor  bigint check (cost_minor >= 0),
  status      text not null default 'active' check (status in ('active','archived')),
  unique (tenant_id, id),
  foreign key (tenant_id, product_id) references products(tenant_id, id)
);

-- Stock-keeping unit at a branch. Retail items link to a product; service
-- materials may exist without one. on_hand/reserved are maintained in the same
-- transaction as stock_movements; CHECKs make overselling impossible.
create table inventory_items (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null,
  branch_id           uuid not null,
  usage               text not null check (usage in ('retail','material','both')),
  product_id          uuid,
  variant_id          uuid,
  name                text not null,
  unit                text not null default 'piece' check (unit in ('piece','ml','l','g','kg')),
  on_hand             numeric(14,3) not null default 0,
  reserved            numeric(14,3) not null default 0,
  low_stock_threshold numeric(14,3),
  unit_cost_minor     bigint check (unit_cost_minor >= 0),
  status              text not null default 'active' check (status in ('active','archived')),
  updated_at          timestamptz not null default now(),
  check (on_hand >= 0),
  check (reserved >= 0 and reserved <= on_hand),
  check (usage = 'material' or product_id is not null),
  unique (tenant_id, id),
  foreign key (tenant_id, branch_id) references branches(tenant_id, id),
  foreign key (tenant_id, product_id) references products(tenant_id, id),
  foreign key (tenant_id, variant_id) references product_variants(tenant_id, id)
);
create unique index inventory_items_product on inventory_items(tenant_id, branch_id, product_id,
  coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid)) where product_id is not null;

create table stock_movements (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null,
  inventory_item_id uuid not null,
  kind              text not null check (kind in ('receipt','reservation','sale','release','return','adjustment','consumption')),
  on_hand_delta     numeric(14,3) not null default 0,
  reserved_delta    numeric(14,3) not null default 0,
  reason            text,
  ref_type          text,         -- order | booking_item | manual | return
  ref_id            uuid,
  actor_user_id     uuid references users(id),
  created_at        timestamptz not null default now(),
  foreign key (tenant_id, inventory_item_id) references inventory_items(tenant_id, id)
);
create index stock_movements_item on stock_movements(tenant_id, inventory_item_id, created_at desc);
-- exactly-once guarantee for system-generated movements
create unique index stock_movements_once on stock_movements(tenant_id, inventory_item_id, kind, ref_type, ref_id)
  where ref_id is not null and kind in ('reservation','sale','release','consumption','return');

create table unit_conversions (
  from_unit text not null,
  to_unit   text not null,
  factor    numeric(18,6) not null check (factor > 0),
  primary key (from_unit, to_unit)
);
insert into unit_conversions values ('l','ml',1000),('ml','l',0.001),('kg','g',1000),('g','kg',0.001);

create table service_material_recipes (
  tenant_id         uuid not null,
  service_id        uuid not null,
  inventory_item_id uuid not null,
  quantity          numeric(14,3) not null check (quantity > 0),
  unit              text not null check (unit in ('piece','ml','l','g','kg')),
  approved_by       uuid references users(id),
  approved_at       timestamptz,
  primary key (tenant_id, service_id, inventory_item_id),
  foreign key (tenant_id, service_id) references services(tenant_id, id),
  foreign key (tenant_id, inventory_item_id) references inventory_items(tenant_id, id)
);

-- ─────────────────────────────────────────────────────────────
-- CARTS & ORDERS (one tenant per cart: one financial beneficiary)
-- ─────────────────────────────────────────────────────────────
create table carts (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  user_id     uuid references users(id),
  anon_key_hash bytea,
  status      text not null default 'open' check (status in ('open','converted','abandoned')),
  expires_at  timestamptz not null default now() + interval '7 days',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, id),
  check (user_id is not null or anon_key_hash is not null)
);
create table cart_items (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  cart_id     uuid not null,
  product_id  uuid not null,
  variant_id  uuid,
  quantity    int not null check (quantity between 1 and 100),
  seen_price_minor bigint not null,
  unique (tenant_id, id),
  foreign key (tenant_id, cart_id) references carts(tenant_id, id) on delete cascade,
  foreign key (tenant_id, product_id) references products(tenant_id, id),
  foreign key (tenant_id, variant_id) references product_variants(tenant_id, id)
);
create unique index cart_items_line on cart_items(tenant_id, cart_id, product_id,
  coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table orders (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants(id),
  branch_id          uuid not null,
  number             text not null,
  tenant_customer_id uuid not null,
  customer_user_id   uuid references users(id),
  status             text not null check (status in ('draft','pending_payment','paid','preparing','ready','collected','cancelled')),
  refund_status      text not null default 'none' check (refund_status in ('none','pending','partial','full')),
  fulfillment_method text not null default 'pickup' check (fulfillment_method in ('pickup','delivery')),
  booking_id         uuid,             -- collect during a visit
  currency           char(3) not null default 'SAR',
  subtotal_minor     bigint not null check (subtotal_minor >= 0),
  discount_minor     bigint not null default 0 check (discount_minor >= 0),
  tax_minor          bigint not null default 0 check (tax_minor >= 0),
  total_minor        bigint not null check (total_minor >= 0),
  paid_minor         bigint not null default 0 check (paid_minor >= 0),
  refunded_minor     bigint not null default 0 check (refunded_minor >= 0),
  payment_terms      text not null default 'full' check (payment_terms in ('full','on_site','manual_approval')),
  terms_snapshot     jsonb not null default '{}',
  hold_expires_at    timestamptz,
  stock_released_at  timestamptz,
  cancelled_at       timestamptz,
  cancel_reason      text,
  created_by         uuid references users(id),
  version            int not null default 1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (total_minor = subtotal_minor - discount_minor + tax_minor),
  check (fulfillment_method = 'pickup'),   -- delivery is designed for, not enabled
  unique (tenant_id, id),
  unique (tenant_id, number),
  foreign key (tenant_id, branch_id) references branches(tenant_id, id),
  foreign key (tenant_id, tenant_customer_id) references tenant_customers(tenant_id, id),
  foreign key (tenant_id, booking_id) references bookings(tenant_id, id)
);
create index orders_tenant_created on orders(tenant_id, created_at desc);
create index orders_customer on orders(customer_user_id, created_at desc);
create trigger orders_touch before update on orders for each row execute function app.touch_updated_at();

create table order_items (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null,
  order_id          uuid not null,
  product_id        uuid not null,
  variant_id        uuid,
  inventory_item_id uuid not null,
  name              text not null,
  variant_name      text,
  unit_price_minor  bigint not null check (unit_price_minor >= 0),
  unit_cost_minor   bigint,                   -- snapshot; NULL = unknown
  quantity          int not null check (quantity between 1 and 100),
  line_total_minor  bigint not null,
  returned_qty      int not null default 0,
  check (line_total_minor = unit_price_minor * quantity),
  check (returned_qty between 0 and quantity),
  unique (tenant_id, id),
  foreign key (tenant_id, order_id) references orders(tenant_id, id),
  foreign key (tenant_id, product_id) references products(tenant_id, id),
  foreign key (tenant_id, variant_id) references product_variants(tenant_id, id),
  foreign key (tenant_id, inventory_item_id) references inventory_items(tenant_id, id)
);
create unique index order_items_line on order_items(tenant_id, order_id, product_id,
  coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table stock_reservations (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null,
  inventory_item_id uuid not null,
  order_id          uuid not null,
  quantity          numeric(14,3) not null check (quantity > 0),
  status            text not null default 'active' check (status in ('active','consumed','released')),
  expires_at        timestamptz not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (tenant_id, order_id, inventory_item_id),
  foreign key (tenant_id, inventory_item_id) references inventory_items(tenant_id, id),
  foreign key (tenant_id, order_id) references orders(tenant_id, id)
);

create table fulfillments (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  order_id     uuid not null,
  method       text not null default 'pickup' check (method in ('pickup','delivery')),
  status       text not null default 'pending' check (status in ('pending','ready','collected','cancelled')),
  ready_at     timestamptz,
  collected_at timestamptz,
  collected_by uuid references users(id),
  unique (tenant_id, order_id),
  foreign key (tenant_id, order_id) references orders(tenant_id, id)
);

create table returns (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  order_id      uuid not null,
  order_item_id uuid not null,
  quantity      int not null check (quantity > 0),
  reason        text not null,
  status        text not null default 'requested' check (status in ('requested','approved','rejected','completed')),
  restock       boolean not null default false,
  refund_id     uuid,
  decided_by    uuid references users(id),
  created_at    timestamptz not null default now(),
  foreign key (tenant_id, order_id) references orders(tenant_id, id),
  foreign key (tenant_id, order_item_id) references order_items(tenant_id, id)
);

-- ─────────────────────────────────────────────────────────────
-- PAYMENTS
-- ─────────────────────────────────────────────────────────────
create table payment_accounts (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid references tenants(id) on delete cascade,  -- NULL = LUMA platform (subscriptions)
  provider         text not null check (provider in ('sandbox','moyasar','manual')),
  mode             text not null default 'test' check (mode in ('test','live')),
  status           text not null default 'disconnected' check (status in ('disconnected','pending_verification','active','disabled')),
  publishable_key  text,
  secret_ciphertext text,        -- AES-256-GCM with LUMA_ENCRYPTION_KEY; never returned to clients
  webhook_secret_ciphertext text,
  -- methods verified as supported by the provider AND enabled by the business
  methods_enabled  text[] not null default '{}',
  settlement_owner text not null default 'tenant' check (settlement_owner in ('tenant','platform')),
  verified_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (tenant_id, id)
);
create unique index payment_accounts_one_active on payment_accounts(coalesce(tenant_id,'00000000-0000-0000-0000-000000000000'::uuid))
  where status = 'active';

create table payments (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references tenants(id),
  payment_account_id  uuid,
  purpose             text not null check (purpose in ('booking','order','gift_card','membership')),
  booking_id          uuid,
  order_id            uuid,
  ref_id              uuid,                    -- gift card / membership id
  kind                text not null check (kind in ('full','deposit','balance','on_site')),
  method              text,                    -- mada | applepay | creditcard | cash | card_terminal | sandbox
  amount_minor        bigint not null check (amount_minor > 0),
  currency            char(3) not null default 'SAR',
  status              text not null default 'pending' check (status in ('pending','processing','succeeded','failed','cancelled','expired','needs_review')),
  provider            text not null,
  provider_payment_id text,
  checkout_url        text,
  collected_by        uuid references users(id),   -- on-site collection
  collection_ref      text,
  idempotency_key     text not null,
  failure_reason      text,
  refunded_minor      bigint not null default 0 check (refunded_minor >= 0),
  succeeded_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (refunded_minor <= amount_minor),
  check ((purpose = 'booking') = (booking_id is not null)),
  check ((purpose = 'order') = (order_id is not null)),
  unique (tenant_id, id),
  unique (tenant_id, idempotency_key),
  foreign key (tenant_id, payment_account_id) references payment_accounts(tenant_id, id),
  foreign key (tenant_id, booking_id) references bookings(tenant_id, id),
  foreign key (tenant_id, order_id) references orders(tenant_id, id)
);
create unique index payments_provider_ref on payments(provider, provider_payment_id) where provider_payment_id is not null;
create index payments_booking on payments(tenant_id, booking_id);
create index payments_order on payments(tenant_id, order_id);
create trigger payments_touch before update on payments for each row execute function app.touch_updated_at();

create table payment_attempts (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  payment_id   uuid not null,
  provider     text not null,
  action       text not null,                 -- create | status_check | webhook
  status       text not null,
  provider_ref text,
  error        text,
  created_at   timestamptz not null default now(),
  foreign key (tenant_id, payment_id) references payments(tenant_id, id)
);

create table refunds (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null,
  payment_id         uuid not null,
  amount_minor       bigint not null check (amount_minor > 0),
  currency           char(3) not null default 'SAR',
  status             text not null default 'pending' check (status in ('pending','processing','succeeded','failed','cancelled')),
  reason             text not null,
  terms_basis        jsonb not null default '{}',  -- the booking-time terms used to compute it
  provider_refund_id text,
  requested_by       uuid references users(id),
  idempotency_key    text not null,
  failure_reason     text,
  completed_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, idempotency_key),
  foreign key (tenant_id, payment_id) references payments(tenant_id, id)
);
create unique index refunds_provider_ref on refunds(provider_refund_id) where provider_refund_id is not null;

alter table returns add constraint returns_refund_fk foreign key (tenant_id, refund_id) references refunds(tenant_id, id);

-- raw webhook/provider events: dedup by (provider, event_id)
create table provider_events (
  id              uuid primary key default gen_random_uuid(),
  provider        text not null,
  event_id        text not null,
  event_type      text not null,
  tenant_id       uuid references tenants(id),
  signature_valid boolean not null,
  payload         jsonb not null,
  received_at     timestamptz not null default now(),
  processed_at    timestamptz,
  outcome         text,
  error           text,
  unique (provider, event_id)
);

create table payouts (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id),
  provider          text not null,
  provider_payout_id text not null,
  amount_minor      bigint not null,
  fees_minor        bigint not null default 0,
  currency          char(3) not null default 'SAR',
  settled_at        timestamptz,
  created_at        timestamptz not null default now(),
  unique (provider, provider_payout_id)
);

create table reconciliation_runs (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid references tenants(id),
  kind         text not null check (kind in ('payments','holds','stock')),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  checked      int not null default 0,
  mismatches   jsonb not null default '[]',
  actions      jsonb not null default '[]',
  status       text not null default 'running' check (status in ('running','succeeded','failed'))
);

-- ─────────────────────────────────────────────────────────────
-- FINANCE — append-only double-entry journal
-- Each txn_id must balance (sum debit = sum credit); enforced by a deferred
-- constraint trigger. Corrections are new offsetting entries.
-- ─────────────────────────────────────────────────────────────
create table financial_entries (
  id           bigserial primary key,
  tenant_id    uuid not null references tenants(id),
  txn_id       uuid not null,
  at           timestamptz not null default now(),
  account      text not null check (account in (
                 'cash','card_clearing','provider_clearing',
                 'customer_deposits','gift_card_liability','membership_liability',
                 'service_revenue','product_revenue','discounts','refunds',
                 'processing_fees','expenses','commission_expense','commission_payable',
                 'cogs','inventory','tax_payable','accounts_payable')),
  debit_minor  bigint not null default 0 check (debit_minor >= 0),
  credit_minor bigint not null default 0 check (credit_minor >= 0),
  currency     char(3) not null default 'SAR',
  ref_type     text not null,
  ref_id       uuid,
  memo         text,
  actor_user_id uuid references users(id),
  check ((debit_minor = 0) <> (credit_minor = 0))
);
create index financial_entries_tenant_at on financial_entries(tenant_id, at);
create index financial_entries_txn on financial_entries(txn_id);
create unique index financial_entries_once on financial_entries(tenant_id, ref_type, ref_id, account, (debit_minor > 0))
  where ref_type in ('payment','refund','service_completed','order_collected','commission');

create or replace function app.check_journal_balance() returns trigger
language plpgsql as $$
declare d bigint; c bigint;
begin
  select coalesce(sum(debit_minor),0), coalesce(sum(credit_minor),0) into d, c
    from financial_entries where txn_id = new.txn_id;
  if d <> c then
    raise exception 'financial journal txn % is unbalanced (debit %, credit %)', new.txn_id, d, c
      using errcode = '23514';
  end if;
  return null;
end $$;
create constraint trigger financial_entries_balanced
  after insert on financial_entries deferrable initially deferred
  for each row execute function app.check_journal_balance();

create table expenses (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id),
  branch_id     uuid,
  category      text not null check (category in ('rent','salaries','supplies','utilities','marketing','maintenance','other')),
  amount_minor  bigint not null check (amount_minor > 0),
  currency      char(3) not null default 'SAR',
  incurred_on   date not null,
  description   text,
  receipt_asset_id uuid,
  recorded_by   uuid references users(id),
  voided_at     timestamptz,
  void_reason   text,
  created_at    timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, branch_id) references branches(tenant_id, id),
  foreign key (tenant_id, receipt_asset_id) references assets(tenant_id, id)
);

create table invoices (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id),
  number           text not null,
  kind             text not null check (kind in ('invoice','receipt','credit_note')),
  booking_id       uuid,
  order_id         uuid,
  payment_id       uuid,
  seller_snapshot  jsonb not null,     -- legal name / tax number / address at issue time
  buyer_snapshot   jsonb not null,
  currency         char(3) not null default 'SAR',
  subtotal_minor   bigint not null,
  discount_minor   bigint not null default 0,
  tax_minor        bigint not null default 0,
  total_minor      bigint not null,
  tax_rule_snapshot jsonb not null default '{}',
  status           text not null default 'issued' check (status in ('issued','void')),
  credit_for_id    uuid,
  issued_at        timestamptz not null default now(),
  issued_by        uuid references users(id),
  unique (tenant_id, id),
  unique (tenant_id, number),
  foreign key (tenant_id, booking_id) references bookings(tenant_id, id),
  foreign key (tenant_id, order_id) references orders(tenant_id, id),
  foreign key (tenant_id, payment_id) references payments(tenant_id, id)
);
create table invoice_items (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null,
  invoice_id       uuid not null,
  description      text not null,
  quantity         numeric(10,3) not null,
  unit_price_minor bigint not null,
  line_total_minor bigint not null,
  tax_minor        bigint not null default 0,
  foreign key (tenant_id, invoice_id) references invoices(tenant_id, id)
);

-- tenant finance settings (tax rules are configuration, documented, not hardcoded)
create table finance_settings (
  tenant_id          uuid primary key references tenants(id) on delete cascade,
  prices_include_tax boolean not null default true,
  tax_rate_bps       int not null default 0 check (tax_rate_bps between 0 and 10000),
  tax_label          text not null default 'VAT',
  tax_registered     boolean not null default false,
  rounding           text not null default 'half_up' check (rounding in ('half_up','half_even')),
  legal_address      text,
  invoice_footer     text,
  updated_at         timestamptz not null default now()
);

select app.enable_tenant_rls('products');
select app.enable_tenant_rls('product_images');
select app.enable_tenant_rls('product_variants');
select app.enable_tenant_rls('inventory_items');
select app.enable_tenant_rls('stock_movements');
select app.enable_tenant_rls('service_material_recipes');
select app.enable_tenant_rls('carts');
select app.enable_tenant_rls('cart_items');
select app.enable_tenant_rls('orders');
select app.enable_customer_read('orders');
select app.enable_tenant_rls('order_items');
select app.enable_tenant_rls('stock_reservations');
select app.enable_tenant_rls('fulfillments');
select app.enable_tenant_rls('returns');
select app.enable_tenant_rls('payment_accounts');  -- platform (NULL tenant) rows only via system context
select app.enable_tenant_rls('payments');
select app.enable_tenant_rls('payment_attempts');
select app.enable_tenant_rls('refunds');
select app.enable_tenant_rls('payouts');
select app.enable_tenant_rls('reconciliation_runs');
select app.enable_tenant_rls('financial_entries');
select app.enable_tenant_rls('expenses');
select app.enable_tenant_rls('invoices');
select app.enable_tenant_rls('invoice_items');
select app.enable_tenant_rls('finance_settings');
