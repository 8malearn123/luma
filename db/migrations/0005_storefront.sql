-- ═══════════════════════════════════════════════════════════════════════════
-- LUMA 0005 — storefront identity, builder drafts/versions, previews,
-- templates, business profile, booking policy, onboarding
--
-- Single source of truth for storefront design (replaces the legacy
-- luma_site / luma_page_cfg / luma_svc_meta browser keys):
--   storefront_drafts.document = { schemaVersion, brand, appearance, layout }
--     brand      — theme tokens (colors, fonts, radius, logo ref)
--     appearance — component display variants (service cards/list, nav style…)
--     layout     — pages → blocks (ordering, visibility, props, actions)
--   page_versions — immutable published snapshots of that same document.
-- Business facts (contact, hours, socials) live in tenant_profiles and are
-- referenced by blocks, never copied into them. Prices come from the catalog.
-- ═══════════════════════════════════════════════════════════════════════════

create table tenant_profiles (
  tenant_id       uuid primary key references tenants(id) on delete cascade,
  tagline         text check (length(tagline) <= 160),
  tagline_en      text check (length(tagline_en) <= 160),
  intro           text check (length(intro) <= 4000),
  intro_en        text check (length(intro_en) <= 4000),
  contact_phone   text,
  contact_email   citext,
  whatsapp        text,
  address         text,
  -- {"instagram":"handle", ...} — validated against an allowlist of networks
  socials         jsonb not null default '{}',
  logo_asset_id   uuid,
  cover_asset_id  uuid,
  wordmark_text   text,                       -- simple text wordmark when no logo
  brand_character text[] not null default '{}',
  brand_description text check (length(brand_description) <= 1000),
  excluded_colors text[] not null default '{}',
  target_audience text check (length(target_audience) <= 500),
  store_priorities text[] not null default '{booking,portfolio,products}',
  updated_at      timestamptz not null default now(),
  foreign key (tenant_id, logo_asset_id) references assets(tenant_id, id),
  foreign key (tenant_id, cover_asset_id) references assets(tenant_id, id)
);

-- Booking & payment policy (the current one; bookings snapshot it).
create table booking_policies (
  tenant_id               uuid primary key references tenants(id) on delete cascade,
  version                 int not null default 1,
  slot_increment_min      int not null default 15 check (slot_increment_min in (5,10,15,20,30,45,60)),
  min_notice_min          int not null default 120 check (min_notice_min between 0 and 20160),
  max_advance_days        int not null default 60 check (max_advance_days between 1 and 365),
  hold_minutes            int not null default 10 check (hold_minutes between 2 and 60),
  cancellation_window_hours int not null default 24 check (cancellation_window_hours between 0 and 336),
  late_cancel_fee_bps     int not null default 0 check (late_cancel_fee_bps between 0 and 10000),
  no_show_grace_min       int not null default 15 check (no_show_grace_min between 0 and 240),
  no_show_fee_bps         int not null default 0 check (no_show_fee_bps between 0 and 10000),
  deposit_mode            text not null default 'none' check (deposit_mode in ('none','percent','fixed')),
  deposit_value           bigint not null default 0 check (deposit_value >= 0),  -- bps or minor units
  allow_on_site           boolean not null default true,
  allow_full_online       boolean not null default true,
  -- declared rule for "any available specialist"
  any_staff_rule          text not null default 'earliest_then_least_booked'
                          check (any_staff_rule in ('earliest_then_least_booked','earliest_then_weight')),
  max_gap_min             int not null default 30 check (max_gap_min between 0 and 240),
  policy_text             text check (length(policy_text) <= 4000),
  policy_text_en          text check (length(policy_text_en) <= 4000),
  require_account         boolean not null default true,
  updated_by              uuid references users(id),
  updated_at              timestamptz not null default now(),
  check (deposit_mode <> 'percent' or deposit_value <= 10000)
);

create table templates (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references tenants(id) on delete cascade,  -- NULL = LUMA-approved template
  name        text not null,
  name_en     text,
  description text,
  document    jsonb not null,
  status      text not null default 'approved' check (status in ('draft','approved','retired')),
  created_by  uuid references users(id),
  created_at  timestamptz not null default now()
);

create table storefront_drafts (
  tenant_id   uuid primary key references tenants(id) on delete cascade,
  document    jsonb not null,
  version     int not null default 1,      -- optimistic concurrency (ETag)
  base_version_id uuid,                    -- published version the draft started from
  updated_by  uuid references users(id),
  updated_at  timestamptz not null default now()
);

create table page_versions (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  number         int not null,
  document       jsonb not null,
  draft_version  int not null,
  published_by   uuid references users(id),
  published_at   timestamptz not null default now(),
  restored_from_id uuid,
  note           text,
  unique (tenant_id, id),
  unique (tenant_id, number)
);
alter table tenants add constraint tenants_published_version_fk
  foreign key (id, published_version_id) references page_versions(tenant_id, id) deferrable initially deferred;

-- immutability of published snapshots
create or replace function app.page_versions_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'page_versions are immutable' using errcode = '42501';
end $$;
create trigger page_versions_no_update before update on page_versions
  for each row execute function app.page_versions_immutable();

create table preview_tokens (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  token_hash    bytea not null unique,
  expires_at    timestamptz not null,
  created_by    uuid not null references users(id),
  revoked_at    timestamptz,
  created_at    timestamptz not null default now(),
  check (expires_at <= created_at + interval '7 days')
);

create table domain_mappings (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  domain      citext not null unique,
  status      text not null default 'pending' check (status in ('pending','verified','disabled')),
  created_at  timestamptz not null default now()
);

create table onboarding_sessions (
  tenant_id       uuid primary key references tenants(id) on delete cascade,
  current_step    int not null default 1 check (current_step between 1 and 8),
  answers         jsonb not null default '{}',     -- {"1": {...}, "2": {...}, ...}
  completed_steps int[] not null default '{}',
  skipped_steps   int[] not null default '{}',
  palette_suggestions jsonb,                       -- from logo; must be accepted explicitly
  draft_generated_at timestamptz,
  completed_at    timestamptz,
  version         int not null default 1,
  updated_by      uuid references users(id),
  updated_at      timestamptz not null default now()
);

select app.enable_tenant_rls('tenant_profiles');
select app.enable_tenant_rls('booking_policies');
select app.enable_tenant_rls('templates', true);
select app.enable_tenant_rls('storefront_drafts');
select app.enable_tenant_rls('page_versions');
select app.enable_tenant_rls('preview_tokens');
select app.enable_tenant_rls('domain_mappings');
select app.enable_tenant_rls('onboarding_sessions');
