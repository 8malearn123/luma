-- ═══════════════════════════════════════════════════════════════════════════
-- LUMA 0001 — core: helpers, identity, platform, plans, tenancy, RBAC,
-- customers, infrastructure (audit, outbox, jobs, idempotency, notifications)
--
-- Conventions
--   * Every business-owned table carries tenant_id and UNIQUE (tenant_id, id)
--     so children reference parents with composite FKs (tenant_id, parent_id).
--     A row can therefore never point at another tenant's entity.
--   * Money: bigint minor units (halalas) + currency char(3).
--   * Instants: timestamptz (stored UTC). Business timezone lives on tenants.
--   * RLS: the application connects as a NON-owner role. Each transaction sets
--     app.tenant_id / app.user_id via set_config(..., true). Policies are
--     installed by app.enable_tenant_rls(). app.system='on' is reserved for
--     narrowly-scoped trusted server code (auth, webhooks, job dispatch).
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pgcrypto;
create extension if not exists btree_gist;
create extension if not exists citext;

create schema if not exists app;

create or replace function app.tenant_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.tenant_id', true), '')::uuid
$$;

create or replace function app.user_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

create or replace function app.is_system() returns boolean
language sql stable as $$
  select coalesce(current_setting('app.system', true), '') = 'on'
$$;

create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Installs tenant isolation on a table that has a tenant_id column.
-- allow_null_tenant: rows with tenant_id IS NULL are global (read-only for tenants).
create or replace function app.enable_tenant_rls(tbl regclass, allow_null_tenant boolean default false)
returns void language plpgsql as $$
begin
  execute format('alter table %s enable row level security', tbl);
  execute format('alter table %s force row level security', tbl);
  execute format('drop policy if exists tenant_isolation on %s', tbl);
  if allow_null_tenant then
    execute format($p$create policy tenant_isolation on %s
      using (app.is_system() or tenant_id = app.tenant_id() or tenant_id is null)
      with check (app.is_system() or tenant_id = app.tenant_id())$p$, tbl);
  else
    execute format($p$create policy tenant_isolation on %s
      using (app.is_system() or tenant_id = app.tenant_id())
      with check (app.is_system() or tenant_id = app.tenant_id())$p$, tbl);
  end if;
end $$;

-- Customer self-access across tenants (read only): rows whose customer_user_id is the caller.
create or replace function app.enable_customer_read(tbl regclass)
returns void language plpgsql as $$
begin
  execute format('drop policy if exists customer_self_read on %s', tbl);
  execute format($p$create policy customer_self_read on %s for select
    using (customer_user_id is not null and customer_user_id = app.user_id())$p$, tbl);
end $$;

-- ─────────────────────────────────────────────────────────────
-- IDENTITY
-- ─────────────────────────────────────────────────────────────
create table users (
  id                 uuid primary key default gen_random_uuid(),
  email              citext unique,
  phone              text unique check (phone ~ '^\+[1-9][0-9]{7,14}$'),
  email_verified_at  timestamptz,
  phone_verified_at  timestamptz,
  password_hash      text,
  display_name       text not null check (length(trim(display_name)) between 1 and 120),
  locale             text not null default 'ar' check (locale in ('ar','en')),
  status             text not null default 'active' check (status in ('active','locked','disabled')),
  failed_login_count int not null default 0,
  locked_until       timestamptz,
  password_changed_at timestamptz,
  is_demo            boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint users_contact check (email is not null or phone is not null)
);
create trigger users_touch before update on users for each row execute function app.touch_updated_at();

create table sessions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  token_hash    bytea not null unique,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  expires_at    timestamptz not null,
  idle_expires_at timestamptz not null,
  revoked_at    timestamptz,
  revoked_reason text,
  step_up_at    timestamptz,
  ip            inet,
  user_agent    text
);
create index sessions_user_idx on sessions(user_id) where revoked_at is null;

create table verification_codes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references users(id) on delete cascade,
  channel       text not null check (channel in ('email','sms')),
  destination   text not null,
  purpose       text not null check (purpose in ('verify_contact','login','recovery','step_up')),
  code_hash     bytea not null,
  expires_at    timestamptz not null,
  attempts      int not null default 0,
  max_attempts  int not null default 5,
  consumed_at   timestamptz,
  delivery_mode text not null check (delivery_mode in ('provider','dev_outbox')),
  created_at    timestamptz not null default now()
);
create index verification_codes_lookup on verification_codes(destination, purpose) where consumed_at is null;

-- DEVELOPMENT ONLY: messages that would have been sent by a provider.
-- The code that writes here refuses to run when NODE_ENV=production.
create table dev_outbox_messages (
  id          uuid primary key default gen_random_uuid(),
  channel     text not null,
  destination text not null,
  subject     text,
  body        text not null,
  created_at  timestamptz not null default now()
);

create table rate_limit_buckets (
  key          text primary key,
  window_start timestamptz not null,
  count        int not null
);

-- ─────────────────────────────────────────────────────────────
-- PLATFORM ADMINISTRATION
-- ─────────────────────────────────────────────────────────────
create table platform_staff (
  user_id     uuid primary key references users(id) on delete cascade,
  role        text not null check (role in ('platform_owner','support_admin','policy_reviewer','tech_admin')),
  status      text not null default 'active' check (status in ('active','revoked')),
  granted_by  uuid references users(id),
  created_at  timestamptz not null default now()
);

create table plans (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique check (code ~ '^[a-z0-9_]+$'),
  name_ar          text not null,
  name_en          text not null,
  -- NULL price = not configured yet ("incomplete configuration"). Test prices
  -- must set price_is_test = true and are shown with a visible label.
  price_monthly_minor bigint check (price_monthly_minor >= 0),
  price_yearly_minor  bigint check (price_yearly_minor >= 0),
  price_is_test    boolean not null default true,
  currency         char(3) not null default 'SAR',
  trial_days       int not null default 14 check (trial_days between 0 and 90),
  grace_days       int not null default 7 check (grace_days between 0 and 60),
  powered_by_required boolean not null default true,
  status           text not null default 'active' check (status in ('draft','active','archived')),
  sort             int not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table plan_features (
  plan_id     uuid not null references plans(id) on delete cascade,
  feature_key text not null,
  enabled     boolean not null default true,
  limit_value int check (limit_value >= 0),     -- NULL = unlimited when enabled
  primary key (plan_id, feature_key)
);

-- ─────────────────────────────────────────────────────────────
-- TENANTS
-- ─────────────────────────────────────────────────────────────
create table tenants (
  id             uuid primary key default gen_random_uuid(),
  slug           citext not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$'),
  name           text not null check (length(trim(name)) between 2 and 120),
  business_type  text not null check (business_type in ('salon','expert','spa','clinic','studio')),
  city           text,
  status         text not null default 'onboarding' check (status in ('onboarding','active','suspended','archived')),
  timezone       text not null default 'Asia/Riyadh',
  default_locale text not null default 'ar' check (default_locale in ('ar','en')),
  currency       char(3) not null default 'SAR',
  legal_name     text,
  tax_number     text,
  is_demo        boolean not null default false,
  published_version_id uuid,                 -- FK added in 0005
  created_by     uuid references users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create trigger tenants_touch before update on tenants for each row execute function app.touch_updated_at();

create table support_access_grants (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  platform_user_id uuid not null references users(id),
  reason           text not null check (length(trim(reason)) >= 10),
  access_level     text not null default 'read' check (access_level in ('read','write')),
  starts_at        timestamptz not null default now(),
  expires_at       timestamptz not null,
  revoked_at       timestamptz,
  created_by       uuid not null references users(id),
  created_at       timestamptz not null default now(),
  check (expires_at > starts_at and expires_at <= starts_at + interval '24 hours')
);
create index support_grants_active on support_access_grants(platform_user_id, tenant_id) where revoked_at is null;

create table subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references tenants(id) on delete cascade,
  plan_id              uuid not null references plans(id),
  status               text not null check (status in ('trialing','active','past_due','paused','cancelled','expired')),
  trial_ends_at        timestamptz,
  current_period_start timestamptz,
  current_period_end   timestamptz,
  grace_until          timestamptz,
  cancel_at            timestamptz,
  -- downgrade overage: data is preserved; creation of new over-limit items is blocked
  overage_state        text not null default 'none' check (overage_state in ('none','over_limit')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (tenant_id, id)
);
create unique index subscriptions_one_live on subscriptions(tenant_id)
  where status in ('trialing','active','past_due','paused');
create trigger subscriptions_touch before update on subscriptions for each row execute function app.touch_updated_at();

create table subscription_events (
  id              bigserial primary key,
  tenant_id       uuid not null references tenants(id) on delete cascade,
  subscription_id uuid not null,
  type            text not null,
  from_status     text,
  to_status       text,
  data            jsonb not null default '{}',
  actor_user_id   uuid references users(id),
  created_at      timestamptz not null default now(),
  foreign key (tenant_id, subscription_id) references subscriptions(tenant_id, id)
);

create table usage_counters (
  tenant_id  uuid not null references tenants(id) on delete cascade,
  metric     text not null,
  period     date not null,
  value      bigint not null default 0,
  primary key (tenant_id, metric, period)
);

create table platform_invoices (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id),
  subscription_id uuid not null,
  number          text not null unique,
  amount_minor    bigint not null check (amount_minor >= 0),
  currency        char(3) not null default 'SAR',
  status          text not null check (status in ('draft','open','paid','void','uncollectible')),
  is_test         boolean not null default true,
  issued_at       timestamptz not null default now(),
  paid_at         timestamptz,
  provider_ref    text,
  foreign key (tenant_id, subscription_id) references subscriptions(tenant_id, id)
);

create table branches (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 120),
  city        text,
  address     text,
  phone       text,
  timezone    text,                              -- NULL = tenant timezone
  is_primary  boolean not null default false,
  status      text not null default 'active' check (status in ('active','archived')),
  latitude    numeric(9,6),
  longitude   numeric(9,6),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, id)
);
create unique index branches_one_primary on branches(tenant_id) where is_primary and status = 'active';

-- ─────────────────────────────────────────────────────────────
-- RBAC — fixed roles + capability keys, delegation per membership
-- ─────────────────────────────────────────────────────────────
create table permissions (
  key          text primary key,
  category     text not null,
  description  text not null,
  -- roles that may receive this capability through owner delegation
  -- (membership.granted_caps). Empty = never delegable.
  delegable_to text[] not null default '{}'
);

create table roles (
  key         text primary key check (key in ('owner','manager','receptionist','specialist','finance')),
  name_ar     text not null,
  name_en     text not null
);

create table role_permissions (
  role_key        text not null references roles(key),
  permission_key  text not null references permissions(key),
  primary key (role_key, permission_key)
);

create table tenant_memberships (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  user_id          uuid not null references users(id) on delete cascade,
  role             text not null references roles(key),
  status           text not null default 'active' check (status in ('active','suspended','removed')),
  granted_caps     text[] not null default '{}',
  revoked_caps     text[] not null default '{}',
  staff_profile_id uuid,                          -- FK added in 0002
  branch_ids       uuid[],                        -- NULL = all branches
  invited_by       uuid references users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (tenant_id, user_id),
  unique (tenant_id, id)
);
create unique index memberships_one_owner on tenant_memberships(tenant_id) where role = 'owner' and status = 'active';
create index memberships_user_idx on tenant_memberships(user_id) where status = 'active';
create trigger memberships_touch before update on tenant_memberships for each row execute function app.touch_updated_at();

create table invitations (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  email            citext,
  phone            text,
  role             text not null references roles(key) check (role <> 'owner'),
  staff_profile_id uuid,
  token_hash       bytea not null unique,
  expires_at       timestamptz not null,
  accepted_at      timestamptz,
  accepted_by      uuid references users(id),
  revoked_at       timestamptz,
  invited_by       uuid not null references users(id),
  created_at       timestamptz not null default now(),
  unique (tenant_id, id),
  check (email is not null or phone is not null)
);

-- ─────────────────────────────────────────────────────────────
-- CUSTOMERS — central identity + per-tenant relationship
-- ─────────────────────────────────────────────────────────────
create table customer_profiles (
  user_id          uuid primary key references users(id) on delete cascade,
  full_name        text not null,
  preferred_locale text not null default 'ar',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table tenant_customers (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  user_id        uuid references users(id),       -- NULL for walk-ins without an account
  customer_user_id uuid generated always as (user_id) stored,
  display_name   text not null check (length(trim(display_name)) between 1 and 120),
  phone          text,
  email          citext,
  private_notes  text check (length(private_notes) <= 4000),
  tags           text[] not null default '{}',
  source         text,
  first_seen_at  timestamptz not null default now(),
  archived_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (tenant_id, id)
);
create unique index tenant_customers_user on tenant_customers(tenant_id, user_id) where user_id is not null;
create index tenant_customers_phone on tenant_customers(tenant_id, phone);

create table customer_consents (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid references tenants(id) on delete cascade,  -- NULL = LUMA platform scope
  user_id            uuid references users(id) on delete cascade,
  tenant_customer_id uuid,
  channel            text not null check (channel in ('email','sms','whatsapp','push')),
  purpose            text not null default 'marketing' check (purpose in ('marketing','reminders','waitlist')),
  status             text not null check (status in ('granted','revoked')),
  source             text not null,
  recorded_at        timestamptz not null default now(),
  foreign key (tenant_id, tenant_customer_id) references tenant_customers(tenant_id, id),
  check (user_id is not null or tenant_customer_id is not null)
);
create index consents_lookup on customer_consents(tenant_id, tenant_customer_id, channel, purpose, recorded_at desc);

create table suppression_list (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references tenants(id) on delete cascade,
  channel     text not null,
  destination_hash bytea not null,
  reason      text not null,
  created_at  timestamptz not null default now(),
  unique (tenant_id, channel, destination_hash)
);

create table customer_preferences (
  tenant_id          uuid not null references tenants(id) on delete cascade,
  tenant_customer_id uuid not null,
  key                text not null,
  value              jsonb not null,
  updated_at         timestamptz not null default now(),
  primary key (tenant_id, tenant_customer_id, key),
  foreign key (tenant_id, tenant_customer_id) references tenant_customers(tenant_id, id)
);

-- ─────────────────────────────────────────────────────────────
-- INFRASTRUCTURE
-- ─────────────────────────────────────────────────────────────
create table audit_logs (
  id            bigserial primary key,
  at            timestamptz not null default now(),
  actor_user_id uuid references users(id),
  actor_kind    text not null check (actor_kind in ('user','platform','support','system','customer')),
  tenant_id     uuid references tenants(id),
  action        text not null,
  target_type   text,
  target_id     text,
  request_id    text,
  reason        text,
  metadata      jsonb not null default '{}',
  ip            inet
);
create index audit_tenant_at on audit_logs(tenant_id, at desc);
create index audit_action_at on audit_logs(action, at desc);

create table outbox_events (
  id           bigserial primary key,
  tenant_id    uuid references tenants(id),
  topic        text not null,
  payload      jsonb not null,
  dedupe_key   text unique,
  available_at timestamptz not null default now(),
  attempts     int not null default 0,
  processed_at timestamptz,
  last_error   text,
  created_at   timestamptz not null default now()
);
create index outbox_pending on outbox_events(available_at) where processed_at is null;

create table job_runs (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid references tenants(id),
  kind            text not null,
  idempotency_key text not null unique,
  payload         jsonb not null default '{}',
  status          text not null default 'queued' check (status in ('queued','running','succeeded','failed','cancelled')),
  attempts        int not null default 0,
  max_attempts    int not null default 3,
  run_at          timestamptz not null default now(),
  locked_at       timestamptz,
  locked_by       text,
  finished_at     timestamptz,
  error           text,
  result          jsonb,
  created_by      uuid references users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index job_runs_ready on job_runs(run_at) where status = 'queued';
create index job_runs_tenant on job_runs(tenant_id, kind, created_at desc);

create table idempotency_records (
  scope           text not null,              -- e.g. 'user:<id>' or 'tenant:<id>'
  key             text not null check (length(key) between 8 and 128),
  request_hash    text not null,
  status          text not null default 'in_progress' check (status in ('in_progress','completed')),
  response_status int,
  response_body   jsonb,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '24 hours',
  primary key (scope, key)
);

create table notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  tenant_id   uuid references tenants(id) on delete cascade,
  type        text not null,
  title       text not null,
  body        text,
  -- only relative in-app paths; validated by the server before insert
  target_path text check (target_path is null or target_path ~ '^/[^/\\]'),
  dedupe_key  text,
  read_at     timestamptz,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '180 days'
);
create index notifications_user on notifications(user_id, created_at desc);
create unique index notifications_dedupe on notifications(user_id, dedupe_key) where dedupe_key is not null;

create table notification_deliveries (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid references tenants(id) on delete cascade,
  channel      text not null check (channel in ('email','sms','whatsapp','push','in_app')),
  template     text not null,
  recipient_user_id uuid references users(id),
  recipient_ref text,                          -- masked destination for display
  status       text not null check (status in ('simulated','queued','sent','delivered','failed','suppressed')),
  provider     text,
  provider_ref text,
  attempts     int not null default 0,
  dedupe_key   text not null unique,
  error        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- RLS on tenant tables of this migration
-- ─────────────────────────────────────────────────────────────
select app.enable_tenant_rls('branches');
select app.enable_tenant_rls('tenant_memberships');
-- a signed-in person can list her own memberships (business selector)
create policy member_self_read on tenant_memberships for select using (user_id = app.user_id());
select app.enable_tenant_rls('invitations');
select app.enable_tenant_rls('tenant_customers');
select app.enable_customer_read('tenant_customers');
select app.enable_tenant_rls('customer_preferences');
select app.enable_tenant_rls('subscriptions');
select app.enable_tenant_rls('subscription_events');
select app.enable_tenant_rls('usage_counters');
select app.enable_tenant_rls('customer_consents', true);
select app.enable_tenant_rls('suppression_list', true);
select app.enable_tenant_rls('support_access_grants');
select app.enable_tenant_rls('platform_invoices');
