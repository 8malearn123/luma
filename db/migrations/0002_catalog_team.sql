-- ═══════════════════════════════════════════════════════════════════════════
-- LUMA 0002 — catalog, team, schedules, resources, commissions
-- ═══════════════════════════════════════════════════════════════════════════

create table assets (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  kind          text not null check (kind in ('image','document')),
  status        text not null default 'pending' check (status in ('pending','ready','rejected','deleted')),
  storage_key   text not null unique,
  mime_type     text,
  byte_size     bigint check (byte_size >= 0),
  width         int,
  height        int,
  alt_text      text check (length(alt_text) <= 300),
  alt_text_en   text check (length(alt_text_en) <= 300),
  purpose       text not null default 'general' check (purpose in ('general','logo','cover','service','product','staff','gallery','evidence','invoice')),
  variants      jsonb not null default '{}',   -- {"w480": "<key>", "w1200": "<key>"}
  dominant_colors text[] not null default '{}',
  uploaded_by   uuid references users(id),
  created_at    timestamptz not null default now(),
  finalized_at  timestamptz,
  deleted_at    timestamptz,
  unique (tenant_id, id)
);

create table categories (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  kind       text not null check (kind in ('service','product')),
  name       text not null check (length(trim(name)) between 1 and 80),
  name_en    text,
  sort       int not null default 0,
  status     text not null default 'active' check (status in ('active','hidden','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, id)
);

create table staff_profiles (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  user_id        uuid references users(id) on delete set null,   -- optional login identity
  display_name   text not null check (length(trim(display_name)) between 1 and 120),
  display_name_en text,
  specialty      text,
  bio            text check (length(bio) <= 2000),
  photo_asset_id uuid,
  status         text not null default 'active' check (status in ('active','inactive','archived')),
  public_visible boolean not null default true,
  sort           int not null default 0,
  allocation_weight int not null default 100 check (allocation_weight between 0 and 1000),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  version        int not null default 1,
  unique (tenant_id, id),
  foreign key (tenant_id, photo_asset_id) references assets(tenant_id, id)
);
create unique index staff_profiles_user on staff_profiles(tenant_id, user_id) where user_id is not null;

alter table tenant_memberships
  add constraint memberships_staff_fk foreign key (tenant_id, staff_profile_id) references staff_profiles(tenant_id, id);
alter table invitations
  add constraint invitations_staff_fk foreign key (tenant_id, staff_profile_id) references staff_profiles(tenant_id, id);

create table staff_branch_assignments (
  tenant_id  uuid not null,
  staff_id   uuid not null,
  branch_id  uuid not null,
  primary key (tenant_id, staff_id, branch_id),
  foreign key (tenant_id, staff_id) references staff_profiles(tenant_id, id),
  foreign key (tenant_id, branch_id) references branches(tenant_id, id)
);

create table services (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants(id) on delete cascade,
  branch_id          uuid,                       -- NULL = offered at all branches
  category_id        uuid,
  name               text not null check (length(trim(name)) between 1 and 120),
  name_en            text,
  description        text check (length(description) <= 4000),
  description_en     text check (length(description_en) <= 4000),
  price_minor        bigint not null check (price_minor >= 0),
  price_is_from      boolean not null default false,   -- "from" pricing when variants differ
  currency           char(3) not null default 'SAR',
  duration_min       int not null check (duration_min between 5 and 720),
  buffer_before_min  int not null default 0 check (buffer_before_min between 0 and 240),
  buffer_after_min   int not null default 0 check (buffer_after_min between 0 and 240),
  image_asset_id     uuid,
  status             text not null default 'active' check (status in ('active','inactive','archived')),
  is_visible         boolean not null default true,
  -- explicit policy: may staff book a hidden service internally?
  internal_booking_when_hidden boolean not null default true,
  min_notice_min     int check (min_notice_min between 0 and 20160),
  max_advance_days   int check (max_advance_days between 1 and 365),
  group_capacity     int check (group_capacity between 2 and 200),  -- non-null = group session service
  material_cost_minor bigint check (material_cost_minor >= 0),  -- private; NULL = unknown
  sort               int not null default 0,
  version            int not null default 1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, branch_id) references branches(tenant_id, id),
  foreign key (tenant_id, category_id) references categories(tenant_id, id),
  foreign key (tenant_id, image_asset_id) references assets(tenant_id, id)
);
create index services_tenant_public on services(tenant_id, sort) where status = 'active' and is_visible;

create table service_variants (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  service_id   uuid not null,
  name         text not null,
  name_en      text,
  price_minor  bigint not null check (price_minor >= 0),
  duration_min int not null check (duration_min between 5 and 720),
  status       text not null default 'active' check (status in ('active','archived')),
  sort         int not null default 0,
  unique (tenant_id, id),
  foreign key (tenant_id, service_id) references services(tenant_id, id)
);

create table service_addons (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  service_id   uuid not null,
  name         text not null,
  name_en      text,
  price_minor  bigint not null check (price_minor >= 0),
  duration_min int not null default 0 check (duration_min between 0 and 240),
  status       text not null default 'active' check (status in ('active','archived')),
  unique (tenant_id, id),
  foreign key (tenant_id, service_id) references services(tenant_id, id)
);

-- Qualified staff per service.
create table service_staff (
  tenant_id  uuid not null,
  service_id uuid not null,
  staff_id   uuid not null,
  primary key (tenant_id, service_id, staff_id),
  foreign key (tenant_id, service_id) references services(tenant_id, id),
  foreign key (tenant_id, staff_id) references staff_profiles(tenant_id, id)
);

-- Price/duration overrides without duplicating services.
-- Resolution (most specific wins): variant+staff > staff > variant > base.
create table service_price_rules (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  service_id   uuid not null,
  variant_id   uuid,
  staff_id     uuid,
  price_minor  bigint check (price_minor >= 0),
  duration_min int check (duration_min between 5 and 720),
  unique (tenant_id, id),
  foreign key (tenant_id, service_id) references services(tenant_id, id),
  foreign key (tenant_id, variant_id) references service_variants(tenant_id, id),
  foreign key (tenant_id, staff_id) references staff_profiles(tenant_id, id),
  check (variant_id is not null or staff_id is not null),
  check (price_minor is not null or duration_min is not null)
);
create unique index service_price_rules_uq on service_price_rules(
  tenant_id, service_id,
  coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(staff_id,   '00000000-0000-0000-0000-000000000000'::uuid));

-- Price changes are proposed and approved; confirmed bookings keep their snapshot.
create table service_price_changes (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null,
  service_id         uuid not null,
  current_price_minor bigint not null,
  proposed_price_minor bigint not null check (proposed_price_minor >= 0),
  reason             text,
  source             text not null default 'manual' check (source in ('manual','recommendation')),
  status             text not null default 'pending' check (status in ('pending','approved','rejected','superseded')),
  proposed_by        uuid references users(id),
  decided_by         uuid references users(id),
  decided_at         timestamptz,
  created_at         timestamptz not null default now(),
  foreign key (tenant_id, service_id) references services(tenant_id, id)
);

create table packages (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  name         text not null,
  name_en      text,
  description  text,
  price_minor  bigint not null check (price_minor >= 0),
  status       text not null default 'active' check (status in ('active','hidden','archived')),
  created_at   timestamptz not null default now(),
  unique (tenant_id, id)
);
create table package_items (
  tenant_id  uuid not null,
  package_id uuid not null,
  service_id uuid not null,
  quantity   int not null default 1 check (quantity between 1 and 50),
  sort       int not null default 0,
  primary key (tenant_id, package_id, service_id),
  foreign key (tenant_id, package_id) references packages(tenant_id, id),
  foreign key (tenant_id, service_id) references services(tenant_id, id)
);

-- ─────────────────────────────────────────────────────────────
-- RESOURCES (rooms, chairs, devices)
-- ─────────────────────────────────────────────────────────────
create table resource_types (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name      text not null,
  unique (tenant_id, id)
);
create table resources (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null,
  branch_id        uuid not null,
  resource_type_id uuid not null,
  name             text not null,
  status           text not null default 'active' check (status in ('active','archived')),
  unique (tenant_id, id),
  foreign key (tenant_id, branch_id) references branches(tenant_id, id),
  foreign key (tenant_id, resource_type_id) references resource_types(tenant_id, id)
);
create table service_resource_requirements (
  tenant_id        uuid not null,
  service_id       uuid not null,
  resource_type_id uuid not null,
  quantity         int not null default 1 check (quantity between 1 and 5),
  primary key (tenant_id, service_id, resource_type_id),
  foreign key (tenant_id, service_id) references services(tenant_id, id),
  foreign key (tenant_id, resource_type_id) references resource_types(tenant_id, id)
);

-- ─────────────────────────────────────────────────────────────
-- SCHEDULES — wall-clock times interpreted in the branch timezone
-- weekday: 0=Sunday … 6=Saturday
-- ─────────────────────────────────────────────────────────────
create table working_hours (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  branch_id  uuid not null,
  staff_id   uuid,                 -- NULL = branch opening hours
  weekday    smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time   time not null,
  check (end_time > start_time),
  unique (tenant_id, id),
  foreign key (tenant_id, branch_id) references branches(tenant_id, id),
  foreign key (tenant_id, staff_id) references staff_profiles(tenant_id, id)
);
create index working_hours_lookup on working_hours(tenant_id, branch_id, staff_id, weekday);

create table shift_overrides (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  branch_id  uuid not null,
  staff_id   uuid,                 -- NULL = whole branch (e.g. holiday closure)
  on_date    date not null,
  kind       text not null check (kind in ('closed','custom')),
  start_time time,
  end_time   time,
  note       text,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  check ((kind = 'closed' and start_time is null and end_time is null)
      or (kind = 'custom' and start_time is not null and end_time > start_time)),
  foreign key (tenant_id, branch_id) references branches(tenant_id, id),
  foreign key (tenant_id, staff_id) references staff_profiles(tenant_id, id)
);
create index shift_overrides_lookup on shift_overrides(tenant_id, branch_id, on_date);

create table breaks (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  staff_id   uuid not null,
  weekday    smallint check (weekday between 0 and 6),   -- recurring weekly
  on_date    date,                                       -- or a single date
  start_time time not null,
  end_time   time not null,
  label      text,
  check (end_time > start_time),
  check ((weekday is null) <> (on_date is null)),
  foreign key (tenant_id, staff_id) references staff_profiles(tenant_id, id)
);

create table leave_requests (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  staff_id    uuid not null,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  type        text not null check (type in ('annual','sick','emergency','unpaid','other')),
  status      text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  reason      text check (length(reason) <= 1000),
  requested_by uuid references users(id),
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  review_note text,
  created_at  timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (tenant_id, id),
  foreign key (tenant_id, staff_id) references staff_profiles(tenant_id, id),
  constraint leave_no_overlap exclude using gist (
    tenant_id with =, staff_id with =, tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('pending','approved'))
);

create table blocked_times (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  staff_id    uuid,
  resource_id uuid,
  during      tstzrange not null,
  reason      text,
  created_by  uuid references users(id),
  created_at  timestamptz not null default now(),
  check ((staff_id is null) <> (resource_id is null)),
  check (not isempty(during)),
  foreign key (tenant_id, staff_id) references staff_profiles(tenant_id, id),
  foreign key (tenant_id, resource_id) references resources(tenant_id, id)
);
create index blocked_times_staff on blocked_times using gist (tenant_id, staff_id, during);

create table attendance_events (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  staff_id    uuid not null,
  kind        text not null check (kind in ('clock_in','clock_out')),
  at          timestamptz not null default now(),
  source      text not null default 'portal' check (source in ('portal','manager','kiosk')),
  recorded_by uuid references users(id),
  note        text,
  corrects_id uuid,
  foreign key (tenant_id, staff_id) references staff_profiles(tenant_id, id)
);
create index attendance_staff_at on attendance_events(tenant_id, staff_id, at desc);

create table staff_requests (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  staff_id    uuid not null,
  kind        text not null check (kind in ('schedule_change','advance','equipment','other')),
  details     text not null check (length(details) <= 2000),
  status      text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  reviewed_by uuid references users(id),
  reviewed_at timestamptz,
  review_note text,
  created_at  timestamptz not null default now(),
  foreign key (tenant_id, staff_id) references staff_profiles(tenant_id, id)
);

create table commission_rules (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  staff_id       uuid,              -- NULL = all staff
  service_id     uuid,              -- NULL = all services
  kind           text not null check (kind in ('percentage','fixed')),
  rate_bps       int check (rate_bps between 0 and 10000),
  fixed_minor    bigint check (fixed_minor >= 0),
  effective_from date not null default current_date,
  effective_to   date,
  created_by     uuid references users(id),
  created_at     timestamptz not null default now(),
  check ((kind = 'percentage' and rate_bps is not null) or (kind = 'fixed' and fixed_minor is not null)),
  foreign key (tenant_id, staff_id) references staff_profiles(tenant_id, id),
  foreign key (tenant_id, service_id) references services(tenant_id, id)
);

select app.enable_tenant_rls('assets');
select app.enable_tenant_rls('categories');
select app.enable_tenant_rls('staff_profiles');
select app.enable_tenant_rls('staff_branch_assignments');
select app.enable_tenant_rls('services');
select app.enable_tenant_rls('service_variants');
select app.enable_tenant_rls('service_addons');
select app.enable_tenant_rls('service_staff');
select app.enable_tenant_rls('service_price_rules');
select app.enable_tenant_rls('service_price_changes');
select app.enable_tenant_rls('packages');
select app.enable_tenant_rls('package_items');
select app.enable_tenant_rls('resource_types');
select app.enable_tenant_rls('resources');
select app.enable_tenant_rls('service_resource_requirements');
select app.enable_tenant_rls('working_hours');
select app.enable_tenant_rls('shift_overrides');
select app.enable_tenant_rls('breaks');
select app.enable_tenant_rls('leave_requests');
select app.enable_tenant_rls('blocked_times');
select app.enable_tenant_rls('attendance_events');
select app.enable_tenant_rls('staff_requests');
select app.enable_tenant_rls('commission_rules');
