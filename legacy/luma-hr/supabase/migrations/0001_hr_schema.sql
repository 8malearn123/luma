-- ═══════════════════════════════════════════════════════════════════════════
-- LUMA · HR & Staff Management Module — Database Schema
-- Target: PostgreSQL 15+ / Supabase
-- Migration 0001: tables, enums, constraints, indexes, RLS policies
-- ═══════════════════════════════════════════════════════════════════════════

-- btree_gist is required for the anti-overlap EXCLUDE constraints below
-- (double-booking prevention and overlapping-leave prevention).
create extension if not exists btree_gist;

-- ─────────────────────────────────────────────────────────────
-- ENUMS
-- ─────────────────────────────────────────────────────────────
create type staff_role as enum (
  'hair_stylist', 'makeup_artist', 'esthetician',
  'nail_artist',  'lash_artist',   'photographer',
  'receptionist', 'manager'
);

create type staff_status as enum ('active', 'suspended', 'archived');

create type leave_type   as enum ('annual', 'sick', 'emergency', 'unpaid');

-- 'cancelled' lets an employee withdraw a pending request without
-- deleting the row (keeps the audit trail intact).
create type leave_status as enum ('pending', 'approved', 'rejected', 'cancelled');

create type commission_type as enum ('percentage', 'fixed_rate');

create type booking_status  as enum ('confirmed', 'completed', 'cancelled', 'no_show');

-- ─────────────────────────────────────────────────────────────
-- SALONS (tenant root — referenced by every HR table)
-- If your platform already has a salons table, drop this block
-- and point the FKs at your existing table instead.
-- ─────────────────────────────────────────────────────────────
create table if not exists salons (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  city       text,
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- STAFF PROFILES
-- One row per employee. user_id is nullable so an owner can
-- register an employee before she creates her login account;
-- once she signs up, link the row to auth.users.
-- ─────────────────────────────────────────────────────────────
create table staff_profiles (
  id          uuid primary key default gen_random_uuid(),
  salon_id    uuid not null references salons (id) on delete cascade,
  user_id     uuid unique references auth.users (id) on delete set null,
  full_name   text not null check (length(trim(full_name)) between 2 and 120),
  role        staff_role not null,
  -- free-form specialties on top of the main role, e.g. {'bridal','keratin'}
  specialties text[] not null default '{}',
  phone       text check (phone ~ '^\+?[0-9\s-]{7,20}$'),
  email       text check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  avatar_url  text,
  status      staff_status not null default 'active',
  hired_at    date not null default current_date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index staff_profiles_salon_idx  on staff_profiles (salon_id) where status = 'active';
create index staff_profiles_user_idx   on staff_profiles (user_id);

-- ─────────────────────────────────────────────────────────────
-- STAFF SCHEDULES
-- Exactly one row per (staff, weekday). weekday: 0=Sunday … 6=Saturday
-- (Sunday-first matches the Saudi work week).
-- A day off is a row with is_day_off = true and null shift times.
-- ─────────────────────────────────────────────────────────────
create table staff_schedules (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references staff_profiles (id) on delete cascade,
  weekday     smallint not null check (weekday between 0 and 6),
  is_day_off  boolean not null default false,
  shift_start time,
  shift_end   time,
  -- optional unpaid break inside the shift (e.g. prayer/lunch)
  break_start time,
  break_end   time,
  updated_at  timestamptz not null default now(),

  unique (staff_id, weekday),

  -- a working day must have a valid shift; a day off must have none
  constraint schedule_shape check (
    (is_day_off and shift_start is null and shift_end is null)
    or
    (not is_day_off and shift_start is not null and shift_end is not null
      and shift_end > shift_start)
  ),
  -- break, when present, must sit inside the shift
  constraint break_inside_shift check (
    (break_start is null and break_end is null)
    or
    (not is_day_off and break_start >= shift_start and break_end <= shift_end
      and break_end > break_start)
  )
);

create index staff_schedules_staff_idx on staff_schedules (staff_id);

-- ─────────────────────────────────────────────────────────────
-- STAFF LEAVES
-- Inclusive date range [start_date, end_date].
-- The EXCLUDE constraint stops a staff member from holding two
-- overlapping requests that are still alive (pending/approved) —
-- this is the "no double leave" edge case, enforced by the DB
-- itself so no API race can slip through.
-- ─────────────────────────────────────────────────────────────
create table staff_leaves (
  id          uuid primary key default gen_random_uuid(),
  staff_id    uuid not null references staff_profiles (id) on delete cascade,
  start_date  date not null,
  end_date    date not null check (end_date >= start_date),
  type        leave_type not null,
  status      leave_status not null default 'pending',
  reason      text check (length(reason) <= 500),
  -- review audit trail
  reviewed_by uuid references auth.users (id),
  reviewed_at timestamptz,
  review_note text,
  created_at  timestamptz not null default now(),

  constraint no_overlapping_live_leaves exclude using gist (
    staff_id with =,
    daterange(start_date, end_date, '[]') with &&
  ) where (status in ('pending', 'approved'))
);

create index staff_leaves_staff_idx  on staff_leaves (staff_id, status);
create index staff_leaves_range_idx on staff_leaves using gist (daterange(start_date, end_date, '[]'))
  where status = 'approved';

-- ─────────────────────────────────────────────────────────────
-- STAFF COMMISSIONS
-- One active config row per staff member.
--   percentage : commission_value is a % of each completed booking (0–100)
--   fixed_rate : commission_value is a flat amount per completed booking
-- ─────────────────────────────────────────────────────────────
create table staff_commissions (
  staff_id         uuid primary key references staff_profiles (id) on delete cascade,
  base_salary      numeric(10,2) not null default 0 check (base_salary >= 0),
  commission_type  commission_type not null default 'percentage',
  commission_value numeric(10,2) not null default 0 check (commission_value >= 0),
  effective_from   date not null default current_date,
  updated_at       timestamptz not null default now(),

  constraint pct_within_bounds check (
    commission_type <> 'percentage' or commission_value <= 100
  )
);

-- ─────────────────────────────────────────────────────────────
-- BOOKINGS (reference implementation)
-- If Luma already has a bookings table, keep yours and just add
-- the EXCLUDE constraint + the guard trigger from migration 0002.
-- ─────────────────────────────────────────────────────────────
create table if not exists bookings (
  id           uuid primary key default gen_random_uuid(),
  salon_id     uuid not null references salons (id) on delete cascade,
  staff_id     uuid not null references staff_profiles (id) on delete restrict,
  client_name  text not null,
  client_phone text,
  service_name text not null,
  price        numeric(10,2) not null check (price >= 0),
  starts_at    timestamptz not null,
  ends_at      timestamptz not null,
  status       booking_status not null default 'confirmed',
  created_at   timestamptz not null default now(),

  constraint booking_positive_duration check (ends_at > starts_at),

  -- HARD double-booking guard: two live bookings for the same staff
  -- member can never overlap, even under concurrent inserts.
  constraint no_double_booking exclude using gist (
    staff_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status in ('confirmed', 'completed'))
);

create index bookings_staff_time_idx on bookings (staff_id, starts_at);
create index bookings_salon_time_idx on bookings (salon_id, starts_at);

-- ─────────────────────────────────────────────────────────────
-- updated_at maintenance
-- ─────────────────────────────────────────────────────────────
create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger staff_profiles_touch    before update on staff_profiles    for each row execute function touch_updated_at();
create trigger staff_schedules_touch   before update on staff_schedules   for each row execute function touch_updated_at();
create trigger staff_commissions_touch before update on staff_commissions for each row execute function touch_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- Two actors:
--   • Salon owner  — full control over rows belonging to her salon
--   • Staff member — read own data; create/cancel own leave requests
-- ═══════════════════════════════════════════════════════════════════════════
alter table salons            enable row level security;
alter table staff_profiles    enable row level security;
alter table staff_schedules   enable row level security;
alter table staff_leaves      enable row level security;
alter table staff_commissions enable row level security;
alter table bookings          enable row level security;

-- helper: does the current user own this salon?
create or replace function is_salon_owner(p_salon uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from salons s where s.id = p_salon and s.owner_id = auth.uid());
$$;

-- helper: the staff_profile id of the current user (null for owners/strangers)
create or replace function my_staff_id() returns uuid
language sql stable security definer set search_path = public as $$
  select sp.id from staff_profiles sp where sp.user_id = auth.uid() limit 1;
$$;

-- salons: owner only
create policy salons_owner_all on salons
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- staff_profiles
create policy staff_owner_all on staff_profiles
  for all using (is_salon_owner(salon_id)) with check (is_salon_owner(salon_id));
create policy staff_self_read on staff_profiles
  for select using (user_id = auth.uid());

-- staff_schedules
create policy sched_owner_all on staff_schedules
  for all using (is_salon_owner((select salon_id from staff_profiles where id = staff_id)))
  with check  (is_salon_owner((select salon_id from staff_profiles where id = staff_id)));
create policy sched_self_read on staff_schedules
  for select using (staff_id = my_staff_id());

-- staff_leaves — staff may create their own PENDING requests and read their
-- history; only the owner may approve/reject (enforced again by trigger below).
create policy leaves_owner_all on staff_leaves
  for all using (is_salon_owner((select salon_id from staff_profiles where id = staff_id)))
  with check  (is_salon_owner((select salon_id from staff_profiles where id = staff_id)));
create policy leaves_self_read on staff_leaves
  for select using (staff_id = my_staff_id());
create policy leaves_self_insert on staff_leaves
  for insert with check (staff_id = my_staff_id() and status = 'pending');
create policy leaves_self_cancel on staff_leaves
  for update using (staff_id = my_staff_id() and status = 'pending')
  with check (staff_id = my_staff_id() and status = 'cancelled');

-- staff_commissions — owner writes, staff reads own config
create policy comm_owner_all on staff_commissions
  for all using (is_salon_owner((select salon_id from staff_profiles where id = staff_id)))
  with check  (is_salon_owner((select salon_id from staff_profiles where id = staff_id)));
create policy comm_self_read on staff_commissions
  for select using (staff_id = my_staff_id());

-- bookings — owner manages; staff reads own agenda
create policy bookings_owner_all on bookings
  for all using (is_salon_owner(salon_id)) with check (is_salon_owner(salon_id));
create policy bookings_self_read on bookings
  for select using (staff_id = my_staff_id());
