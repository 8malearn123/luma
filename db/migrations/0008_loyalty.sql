-- ═══════════════════════════════════════════════════════════════════════════
-- LUMA 0008 — loyalty ledger, coupons, gift cards, memberships/prepaid
-- packages with entitlement reservations. Tenant-scoped by default.
-- ═══════════════════════════════════════════════════════════════════════════

create table loyalty_rules (
  tenant_id          uuid primary key references tenants(id) on delete cascade,
  enabled            boolean not null default false,
  points_per_sar     numeric(8,3) not null default 1 check (points_per_sar >= 0),
  earn_on            text not null default 'completed_paid' check (earn_on in ('completed_paid')),
  expiry_days        int check (expiry_days between 30 and 1095),
  -- [{"name":"Silver","min_points":500}] informational tiers
  tiers              jsonb not null default '[]',
  reverse_on_refund  boolean not null default true,
  updated_at         timestamptz not null default now()
);

create table loyalty_rewards (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  name          text not null,
  points_cost   int not null check (points_cost > 0),
  reward_kind   text not null check (reward_kind in ('discount_fixed','discount_percent','free_service')),
  reward_value  bigint not null check (reward_value >= 0),
  service_id    uuid,
  status        text not null default 'active' check (status in ('active','archived')),
  unique (tenant_id, id),
  foreign key (tenant_id, service_id) references services(tenant_id, id)
);

create table loyalty_accounts (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants(id) on delete cascade,
  tenant_customer_id uuid not null,
  customer_user_id   uuid references users(id),
  balance            int not null default 0 check (balance >= 0),  -- cache of the ledger, same txn
  created_at         timestamptz not null default now(),
  unique (tenant_id, id),
  unique (tenant_id, tenant_customer_id),
  foreign key (tenant_id, tenant_customer_id) references tenant_customers(tenant_id, id)
);

create table points_entries (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  account_id      uuid not null,
  kind            text not null check (kind in ('earn','redeem','reverse','expire','adjust')),
  points          int not null check (points <> 0),
  ref_type        text,
  ref_id          uuid,
  reason          text,
  expires_at      timestamptz,
  actor_user_id   uuid references users(id),
  created_at      timestamptz not null default now(),
  foreign key (tenant_id, account_id) references loyalty_accounts(tenant_id, id)
);
create unique index points_entries_once on points_entries(tenant_id, account_id, kind, ref_type, ref_id)
  where ref_id is not null and kind in ('earn','reverse','redeem');

create table coupons (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  code           citext not null,
  kind           text not null check (kind in ('percent','fixed')),
  value          bigint not null check (value > 0),
  min_total_minor bigint not null default 0,
  max_redemptions int,
  redeemed_count int not null default 0,
  per_customer_limit int not null default 1,
  starts_at      timestamptz,
  ends_at        timestamptz,
  status         text not null default 'active' check (status in ('active','paused','archived')),
  campaign_id    uuid,
  created_at     timestamptz not null default now(),
  check (kind <> 'percent' or value <= 10000),
  check (max_redemptions is null or redeemed_count <= max_redemptions),
  unique (tenant_id, id),
  unique (tenant_id, code)
);

create table reward_redemptions (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null,
  tenant_customer_id uuid not null,
  coupon_id          uuid,
  reward_id          uuid,
  points_entry_id    uuid,
  booking_id         uuid,
  order_id           uuid,
  discount_minor     bigint not null check (discount_minor >= 0),
  status             text not null default 'applied' check (status in ('applied','reversed')),
  created_at         timestamptz not null default now(),
  check (coupon_id is not null or reward_id is not null),
  foreign key (tenant_id, tenant_customer_id) references tenant_customers(tenant_id, id),
  foreign key (tenant_id, coupon_id) references coupons(tenant_id, id),
  foreign key (tenant_id, reward_id) references loyalty_rewards(tenant_id, id),
  foreign key (tenant_id, booking_id) references bookings(tenant_id, id),
  foreign key (tenant_id, order_id) references orders(tenant_id, id)
);

create table gift_cards (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants(id) on delete cascade,
  code_hash          bytea not null unique,     -- the full code is shown once at issue
  code_last4         text not null,
  initial_minor      bigint not null check (initial_minor > 0),
  balance_minor      bigint not null check (balance_minor >= 0),
  currency           char(3) not null default 'SAR',
  status             text not null default 'pending' check (status in ('pending','active','redeemed','expired','void')),
  template_key       text not null default 'classic',
  recipient_name     text,
  message            text check (length(message) <= 300),
  purchaser_customer_id uuid,
  expires_at         timestamptz,
  activated_at       timestamptz,
  issued_by          uuid references users(id),
  created_at         timestamptz not null default now(),
  check (balance_minor <= initial_minor),
  unique (tenant_id, id),
  foreign key (tenant_id, purchaser_customer_id) references tenant_customers(tenant_id, id)
);

create table gift_card_entries (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  gift_card_id  uuid not null,
  kind          text not null check (kind in ('issue','redeem','refund','expire','void')),
  amount_minor  bigint not null,                -- signed effect on balance
  ref_type      text,
  ref_id        uuid,
  actor_user_id uuid references users(id),
  created_at    timestamptz not null default now(),
  foreign key (tenant_id, gift_card_id) references gift_cards(tenant_id, id)
);
create unique index gift_card_entries_once on gift_card_entries(tenant_id, gift_card_id, kind, ref_type, ref_id)
  where ref_id is not null;

create table membership_plans (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  name            text not null,
  name_en         text,
  price_minor     bigint not null check (price_minor >= 0),
  validity_days   int not null check (validity_days between 7 and 730),
  -- [{"service_id": "...", "sessions": 4}]
  entitlements    jsonb not null,
  status          text not null default 'active' check (status in ('active','archived')),
  created_at      timestamptz not null default now(),
  unique (tenant_id, id)
);

create table memberships (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants(id) on delete cascade,
  plan_id            uuid not null,
  tenant_customer_id uuid not null,
  customer_user_id   uuid references users(id),
  status             text not null default 'active' check (status in ('pending_payment','active','expired','cancelled')),
  starts_at          timestamptz not null default now(),
  ends_at            timestamptz not null,
  created_at         timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, plan_id) references membership_plans(tenant_id, id),
  foreign key (tenant_id, tenant_customer_id) references tenant_customers(tenant_id, id)
);

create table membership_entitlements (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  membership_id  uuid not null,
  service_id     uuid not null,
  total          int not null check (total > 0),
  reserved       int not null default 0 check (reserved >= 0),
  consumed       int not null default 0 check (consumed >= 0),
  check (reserved + consumed <= total),
  unique (tenant_id, id),
  unique (tenant_id, membership_id, service_id),
  foreign key (tenant_id, membership_id) references memberships(tenant_id, id),
  foreign key (tenant_id, service_id) references services(tenant_id, id)
);

create table entitlement_reservations (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  entitlement_id uuid not null,
  booking_item_id uuid not null,
  status         text not null default 'reserved' check (status in ('reserved','consumed','released')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (tenant_id, booking_item_id),
  foreign key (tenant_id, entitlement_id) references membership_entitlements(tenant_id, id),
  foreign key (tenant_id, booking_item_id) references booking_items(tenant_id, id)
);

select app.enable_tenant_rls('loyalty_rules');
select app.enable_tenant_rls('loyalty_rewards');
select app.enable_tenant_rls('loyalty_accounts');
select app.enable_customer_read('loyalty_accounts');
select app.enable_tenant_rls('points_entries');
select app.enable_tenant_rls('coupons');
select app.enable_tenant_rls('reward_redemptions');
select app.enable_tenant_rls('gift_cards');
select app.enable_tenant_rls('gift_card_entries');
select app.enable_tenant_rls('membership_plans');
select app.enable_tenant_rls('memberships');
select app.enable_customer_read('memberships');
select app.enable_tenant_rls('membership_entitlements');
select app.enable_tenant_rls('entitlement_reservations');
