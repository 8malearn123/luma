-- ═══════════════════════════════════════════════════════════════════════════
-- LUMA 0003 — bookings, allocations (anti-double-booking), events, waitlist,
-- reviews, group sessions, commission entries
--
-- Double-booking is impossible at the database level: booking_allocations has
-- EXCLUDE constraints over (tenant, staff|resource, time range) for active rows.
-- A "hold" is a booking in status 'held' whose allocations carry expires_at.
-- Expired-but-not-yet-swept holds are released inside the allocating
-- transaction before inserting (see server/services/booking).
-- ═══════════════════════════════════════════════════════════════════════════

create table group_sessions (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  branch_id   uuid not null,
  service_id  uuid not null,
  staff_id    uuid not null,
  resource_id uuid,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  capacity    int not null check (capacity between 1 and 200),
  seats_taken int not null default 0 check (seats_taken >= 0),
  price_minor bigint not null check (price_minor >= 0),
  status      text not null default 'scheduled' check (status in ('scheduled','cancelled','completed')),
  created_by  uuid references users(id),
  created_at  timestamptz not null default now(),
  check (ends_at > starts_at),
  check (seats_taken <= capacity),
  unique (tenant_id, id),
  foreign key (tenant_id, branch_id) references branches(tenant_id, id),
  foreign key (tenant_id, service_id) references services(tenant_id, id),
  foreign key (tenant_id, staff_id) references staff_profiles(tenant_id, id),
  foreign key (tenant_id, resource_id) references resources(tenant_id, id)
);

create table bookings (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants(id),
  branch_id          uuid not null,
  number             text not null,
  tenant_customer_id uuid not null,
  customer_user_id   uuid references users(id),
  status             text not null check (status in ('draft','held','pending_payment','confirmed','checked_in','in_service','completed','expired','cancelled','no_show')),
  financial_status   text not null default 'unpaid' check (financial_status in ('unpaid','deposit_paid','partially_paid','paid','refund_pending','partially_refunded','refunded','not_required')),
  source             text not null check (source in ('online','staff','walk_in','waitlist','reschedule')),
  starts_at          timestamptz not null,
  ends_at            timestamptz not null,
  currency           char(3) not null default 'SAR',
  subtotal_minor     bigint not null check (subtotal_minor >= 0),
  discount_minor     bigint not null default 0 check (discount_minor >= 0),
  tax_minor          bigint not null default 0 check (tax_minor >= 0),
  total_minor        bigint not null check (total_minor >= 0),
  deposit_due_minor  bigint not null default 0 check (deposit_due_minor >= 0),
  paid_minor         bigint not null default 0 check (paid_minor >= 0),
  refunded_minor     bigint not null default 0 check (refunded_minor >= 0),
  payment_terms      text not null default 'on_site' check (payment_terms in ('full','deposit','on_site','manual_approval','none')),
  -- frozen at booking time: cancellation/no-show policy, payment policy, decision reason
  terms_snapshot     jsonb not null default '{}',
  hold_expires_at    timestamptz,
  customer_note      text check (length(customer_note) <= 1000),
  internal_note      text check (length(internal_note) <= 2000),
  rescheduled_from_id uuid,
  rescheduled_to_id  uuid,
  coupon_code        text,
  checked_in_at      timestamptz,
  service_started_at timestamptz,
  completed_at       timestamptz,
  cancelled_at       timestamptz,
  cancelled_by       uuid references users(id),
  cancel_source      text check (cancel_source in ('customer','business','system','platform')),
  cancel_reason      text,
  no_show_at         timestamptz,
  created_by         uuid references users(id),
  version            int not null default 1,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (ends_at > starts_at),
  check (total_minor = subtotal_minor - discount_minor + tax_minor),
  check (deposit_due_minor <= total_minor),
  unique (tenant_id, id),
  unique (tenant_id, number),
  foreign key (tenant_id, branch_id) references branches(tenant_id, id),
  foreign key (tenant_id, tenant_customer_id) references tenant_customers(tenant_id, id)
);
create index bookings_tenant_starts on bookings(tenant_id, starts_at);
create index bookings_customer on bookings(customer_user_id, starts_at desc);
create index bookings_hold_expiry on bookings(hold_expires_at) where status in ('held','pending_payment');
create trigger bookings_touch before update on bookings for each row execute function app.touch_updated_at();

create table booking_items (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null,
  booking_id         uuid not null,
  seq                int not null,
  service_id         uuid not null,
  variant_id         uuid,
  staff_id           uuid not null,
  group_session_id   uuid,
  -- snapshot at booking time; never re-derived from the live catalog
  service_name       text not null,
  service_name_en    text,
  variant_name       text,
  staff_name         text not null,
  price_minor        bigint not null check (price_minor >= 0),
  addons             jsonb not null default '[]',  -- [{id,name,price_minor,duration_min}]
  addons_minor       bigint not null default 0 check (addons_minor >= 0),
  duration_min       int not null check (duration_min > 0),
  buffer_before_min  int not null default 0,
  buffer_after_min   int not null default 0,
  starts_at          timestamptz not null,
  ends_at            timestamptz not null,
  status             text not null default 'active' check (status in ('active','cancelled')),
  actual_start_at    timestamptz,
  actual_end_at      timestamptz,
  materials_deducted_at timestamptz,
  check (ends_at > starts_at),
  unique (tenant_id, id),
  unique (tenant_id, booking_id, seq),
  foreign key (tenant_id, booking_id) references bookings(tenant_id, id),
  foreign key (tenant_id, service_id) references services(tenant_id, id),
  foreign key (tenant_id, variant_id) references service_variants(tenant_id, id),
  foreign key (tenant_id, staff_id) references staff_profiles(tenant_id, id),
  foreign key (tenant_id, group_session_id) references group_sessions(tenant_id, id)
);
create index booking_items_staff on booking_items(tenant_id, staff_id, starts_at);

create table booking_allocations (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null,
  booking_id       uuid,
  booking_item_id  uuid,
  group_session_id uuid,
  staff_id         uuid,
  resource_id      uuid,
  during           tstzrange not null,       -- includes buffers
  active           boolean not null default true,
  expires_at       timestamptz,              -- non-null while it is only a hold
  released_at      timestamptz,
  release_reason   text,
  created_at       timestamptz not null default now(),
  check ((staff_id is null) <> (resource_id is null)),
  check (not isempty(during)),
  check ((booking_item_id is not null) <> (group_session_id is not null)),
  check (active or released_at is not null),
  foreign key (tenant_id, booking_id) references bookings(tenant_id, id),
  foreign key (tenant_id, booking_item_id) references booking_items(tenant_id, id),
  foreign key (tenant_id, group_session_id) references group_sessions(tenant_id, id),
  foreign key (tenant_id, staff_id) references staff_profiles(tenant_id, id),
  foreign key (tenant_id, resource_id) references resources(tenant_id, id),
  constraint alloc_staff_no_overlap exclude using gist (
    tenant_id with =, staff_id with =, during with &&
  ) where (active and staff_id is not null),
  constraint alloc_resource_no_overlap exclude using gist (
    tenant_id with =, resource_id with =, during with &&
  ) where (active and resource_id is not null)
);
create index booking_allocations_expiry on booking_allocations(expires_at) where active and expires_at is not null;
create index booking_allocations_booking on booking_allocations(tenant_id, booking_id);

create table group_session_bookings (
  tenant_id        uuid not null,
  group_session_id uuid not null,
  booking_id       uuid not null,
  seats            int not null default 1 check (seats between 1 and 10),
  status           text not null default 'active' check (status in ('active','released')),
  created_at       timestamptz not null default now(),
  primary key (tenant_id, group_session_id, booking_id),
  foreign key (tenant_id, group_session_id) references group_sessions(tenant_id, id),
  foreign key (tenant_id, booking_id) references bookings(tenant_id, id)
);

create table booking_events (
  id            bigserial primary key,
  tenant_id     uuid not null,
  booking_id    uuid not null,
  from_status   text,
  to_status     text,
  kind          text not null,         -- transition | payment | note | reschedule | notification
  actor_user_id uuid references users(id),
  actor_role    text,
  source        text,
  reason        text,
  data          jsonb not null default '{}',
  at            timestamptz not null default now(),
  foreign key (tenant_id, booking_id) references bookings(tenant_id, id)
);
create index booking_events_booking on booking_events(tenant_id, booking_id, at);

create table waitlist_entries (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null,
  branch_id          uuid not null,
  tenant_customer_id uuid not null,
  customer_user_id   uuid references users(id),
  service_id         uuid not null,
  staff_id           uuid,
  desired_from       date not null,
  desired_to         date not null,
  -- [{"start":"16:00","end":"20:00"}] wall-clock windows in branch timezone; [] = any time
  time_windows       jsonb not null default '[]',
  notify_consent     boolean not null default false,
  status             text not null default 'active' check (status in ('active','offered','fulfilled','expired','cancelled')),
  expires_at         timestamptz not null,
  created_at         timestamptz not null default now(),
  check (desired_to >= desired_from),
  unique (tenant_id, id),
  foreign key (tenant_id, branch_id) references branches(tenant_id, id),
  foreign key (tenant_id, tenant_customer_id) references tenant_customers(tenant_id, id),
  foreign key (tenant_id, service_id) references services(tenant_id, id),
  foreign key (tenant_id, staff_id) references staff_profiles(tenant_id, id)
);

create table waitlist_offers (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null,
  waitlist_entry_id uuid not null,
  customer_user_id  uuid references users(id),
  staff_id          uuid not null,
  slot_start        timestamptz not null,
  slot_end          timestamptz not null,
  rank_reason       text not null,
  status            text not null default 'offered' check (status in ('offered','accepted','declined','expired','superseded')),
  expires_at        timestamptz not null,
  booking_id        uuid,
  created_at        timestamptz not null default now(),
  responded_at      timestamptz,
  unique (tenant_id, id),
  foreign key (tenant_id, waitlist_entry_id) references waitlist_entries(tenant_id, id),
  foreign key (tenant_id, staff_id) references staff_profiles(tenant_id, id),
  foreign key (tenant_id, booking_id) references bookings(tenant_id, id)
);
-- one live offer per slot: the same opening is never offered to everyone at once
create unique index waitlist_offers_one_live on waitlist_offers(tenant_id, staff_id, slot_start) where status = 'offered';

create table reviews (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null,
  booking_id         uuid not null,
  tenant_customer_id uuid not null,
  customer_user_id   uuid references users(id),
  staff_id           uuid,
  rating             smallint not null check (rating between 1 and 5),
  comment            text check (length(comment) <= 2000),
  display_name       text not null,          -- customer-chosen public name (e.g. first name)
  status             text not null default 'published' check (status in ('published','hidden','flagged')),
  business_response  text check (length(business_response) <= 2000),
  created_at         timestamptz not null default now(),
  unique (tenant_id, booking_id),            -- one review per completed visit
  unique (tenant_id, id),
  foreign key (tenant_id, booking_id) references bookings(tenant_id, id),
  foreign key (tenant_id, tenant_customer_id) references tenant_customers(tenant_id, id),
  foreign key (tenant_id, staff_id) references staff_profiles(tenant_id, id)
);

create table commission_entries (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  staff_id        uuid not null,
  booking_item_id uuid not null,
  kind            text not null check (kind in ('earned','reversal','correction')),
  basis_minor     bigint not null,
  amount_minor    bigint not null,            -- negative for reversals
  rule_snapshot   jsonb not null,
  reverses_id     uuid,
  reason          text,
  created_by      uuid references users(id),
  created_at      timestamptz not null default now(),
  unique (tenant_id, id),
  foreign key (tenant_id, staff_id) references staff_profiles(tenant_id, id),
  foreign key (tenant_id, booking_item_id) references booking_items(tenant_id, id)
);
create unique index commission_earned_once on commission_entries(tenant_id, booking_item_id) where kind = 'earned';
create unique index commission_reversed_once on commission_entries(tenant_id, reverses_id) where kind = 'reversal';

-- per-tenant readable sequences for human numbers (BKG-…, ORD-…, INV-…)
create table tenant_counters (
  tenant_id uuid not null references tenants(id) on delete cascade,
  name      text not null,
  value     bigint not null default 0,
  primary key (tenant_id, name)
);

select app.enable_tenant_rls('group_sessions');
select app.enable_tenant_rls('bookings');
select app.enable_customer_read('bookings');
select app.enable_tenant_rls('booking_items');
select app.enable_tenant_rls('booking_allocations');
select app.enable_tenant_rls('group_session_bookings');
select app.enable_tenant_rls('booking_events');
select app.enable_tenant_rls('waitlist_entries');
select app.enable_customer_read('waitlist_entries');
select app.enable_tenant_rls('waitlist_offers');
select app.enable_customer_read('waitlist_offers');
select app.enable_tenant_rls('reviews');
select app.enable_tenant_rls('commission_entries');
select app.enable_tenant_rls('tenant_counters');
