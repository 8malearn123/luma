-- ═══════════════════════════════════════════════════════════════════════════
-- LUMA · HR & Staff Management Module — Business Logic
-- Migration 0002: availability engine, booking guard, commission calculator
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1) AVAILABILITY CORE
-- staff_is_available(staff, from, to) is the single source of
-- truth used by the slot generator, the booking guard trigger,
-- and the public booking page.
-- A staff member is available for [p_start, p_end) iff:
--   a) her profile is active
--   b) the interval sits inside that weekday's shift
--   c) it does not intersect the configured break
--   d) no APPROVED leave covers that date
--   e) no live booking overlaps (belt & braces — the EXCLUDE
--      constraint already guarantees this at commit time)
-- ─────────────────────────────────────────────────────────────
create or replace function staff_is_available(
  p_staff uuid,
  p_start timestamptz,
  p_end   timestamptz
) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_sched staff_schedules%rowtype;
  v_day   smallint := extract(dow from p_start)::smallint; -- 0=Sun … 6=Sat
begin
  -- (a) active profile
  if not exists (select 1 from staff_profiles
                 where id = p_staff and status = 'active') then
    return false;
  end if;

  -- multi-day bookings are not supported by the slot model
  if p_start::date <> (p_end - interval '1 second')::date then
    return false;
  end if;

  -- (b) shift window for that weekday
  select * into v_sched
  from staff_schedules
  where staff_id = p_staff and weekday = v_day;

  if not found or v_sched.is_day_off then
    return false;
  end if;

  if p_start::time < v_sched.shift_start
     or (p_end - interval '1 second')::time >= v_sched.shift_end then
    return false;
  end if;

  -- (c) break intersection
  if v_sched.break_start is not null
     and (p_start::time, p_end::time) overlaps (v_sched.break_start, v_sched.break_end) then
    return false;
  end if;

  -- (d) approved leave — the "real-time booking sync" rule:
  -- the moment a leave flips to approved, every slot on those days
  -- evaluates to unavailable with no extra sync step needed.
  if exists (
    select 1 from staff_leaves l
    where l.staff_id = p_staff
      and l.status   = 'approved'
      and daterange(l.start_date, l.end_date, '[]') @> p_start::date
  ) then
    return false;
  end if;

  -- (e) overlapping live booking
  if exists (
    select 1 from bookings b
    where b.staff_id = p_staff
      and b.status in ('confirmed', 'completed')
      and tstzrange(b.starts_at, b.ends_at) && tstzrange(p_start, p_end)
  ) then
    return false;
  end if;

  return true;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 2) PUBLIC SLOT GENERATOR
-- Feeds the public booking page. Emits only bookable slots for
-- one staff member on one date, honouring shift, break, approved
-- leaves and existing bookings — blocked slots simply never
-- appear in the result set.
-- ─────────────────────────────────────────────────────────────
create or replace function get_available_slots(
  p_staff        uuid,
  p_date         date,
  p_slot_minutes integer default 30
) returns table (slot_start timestamptz, slot_end timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  v_sched staff_schedules%rowtype;
  v_tz    text := coalesce(current_setting('app.salon_tz', true), 'Asia/Riyadh');
begin
  if p_slot_minutes not between 10 and 240 then
    raise exception 'slot size % out of range (10–240 min)', p_slot_minutes;
  end if;

  select * into v_sched
  from staff_schedules
  where staff_id = p_staff
    and weekday  = extract(dow from p_date)::smallint;

  -- day off / no schedule row → no slots at all
  if not found or v_sched.is_day_off then
    return;
  end if;

  return query
  with grid as (
    select gs                                          as s,
           gs + make_interval(mins => p_slot_minutes)  as e
    from generate_series(
      (p_date::text || ' ' || v_sched.shift_start::text)::timestamp at time zone v_tz,
      (p_date::text || ' ' || v_sched.shift_end::text)::timestamp  at time zone v_tz
        - make_interval(mins => p_slot_minutes),
      make_interval(mins => p_slot_minutes)
    ) gs
  )
  select g.s, g.e
  from grid g
  where staff_is_available(p_staff, g.s, g.e)
  order by g.s;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 3) BOOKING GUARD TRIGGER
-- Application code can forget to check; the database cannot.
-- Any INSERT (or reschedule UPDATE) of a live booking that lands
-- on an approved leave day or outside the shift is rejected with
-- a descriptive error the API can surface to the client.
-- ─────────────────────────────────────────────────────────────
create or replace function booking_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- only guard live bookings; cancelling is always allowed
  if new.status not in ('confirmed', 'completed') then
    return new;
  end if;

  -- skip the availability re-check when nothing time-related changed
  if tg_op = 'UPDATE'
     and new.staff_id = old.staff_id
     and new.starts_at = old.starts_at
     and new.ends_at   = old.ends_at then
    return new;
  end if;

  if not staff_is_available(new.staff_id, new.starts_at, new.ends_at) then
    raise exception using
      errcode = 'P0001',
      message = 'STAFF_UNAVAILABLE',
      detail  = format('Staff %s is not bookable between %s and %s (leave, day off, break, or outside shift).',
                       new.staff_id, new.starts_at, new.ends_at);
  end if;

  return new;
end $$;

create trigger bookings_guard
  before insert or update on bookings
  for each row execute function booking_guard();

-- ─────────────────────────────────────────────────────────────
-- 4) LEAVE APPROVAL WORKFLOW
-- Locks the state machine down at the DB layer:
--   pending → approved | rejected   (owner only)
--   pending → cancelled             (the employee herself)
-- Approving a leave also CANCELS the staff member's confirmed
-- bookings inside the leave window — the exact edge case where a
-- client already booked before the leave existed. Cancelled
-- bookings should then be re-offered/reassigned by the app layer.
-- ─────────────────────────────────────────────────────────────
create or replace function leave_transition_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_salon uuid;
begin
  if new.status = old.status then
    return new;  -- metadata edit only
  end if;

  select salon_id into v_salon from staff_profiles where id = new.staff_id;

  if old.status <> 'pending' then
    raise exception 'LEAVE_ALREADY_FINALIZED: % → % is not allowed', old.status, new.status;
  end if;

  if new.status in ('approved', 'rejected') then
    if not is_salon_owner(v_salon) then
      raise exception 'ONLY_OWNER_MAY_REVIEW';
    end if;
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();

  elsif new.status = 'cancelled' then
    if (select user_id from staff_profiles where id = new.staff_id) <> auth.uid()
       and not is_salon_owner(v_salon) then
      raise exception 'ONLY_REQUESTER_MAY_CANCEL';
    end if;
  end if;

  -- side effect on approval: free the calendar
  if new.status = 'approved' then
    update bookings b
    set status = 'cancelled'
    where b.staff_id = new.staff_id
      and b.status   = 'confirmed'
      and b.starts_at::date between new.start_date and new.end_date;
  end if;

  return new;
end $$;

create trigger leaves_transition
  before update on staff_leaves
  for each row execute function leave_transition_guard();

-- ─────────────────────────────────────────────────────────────
-- 5) AUTOMATED COMMISSION CALCULATOR
-- One employee, one calendar month:
--   percentage → commission = Σ(price) × value / 100
--   fixed_rate → commission = count(bookings) × value
-- Only COMPLETED bookings count — no-shows and cancellations never
-- generate commission.
-- ─────────────────────────────────────────────────────────────
create or replace function calculate_monthly_payout(
  p_staff uuid,
  p_month date  -- any date inside the target month, e.g. '2026-07-01'
) returns table (
  staff_id         uuid,
  month            text,
  base_salary      numeric,
  commission_type  commission_type,
  commission_value numeric,
  bookings_count   bigint,
  gross_sales      numeric,
  commission       numeric,
  total_payout     numeric
)
language sql stable security definer set search_path = public as $$
  with cfg as (
    -- staff with no commission row default to salary-only (0 / percentage)
    select
      sp.id as staff_id,
      coalesce(sc.base_salary, 0)                 as base_salary,
      coalesce(sc.commission_type, 'percentage')  as commission_type,
      coalesce(sc.commission_value, 0)            as commission_value
    from staff_profiles sp
    left join staff_commissions sc on sc.staff_id = sp.id
    where sp.id = p_staff
  ),
  done as (
    select count(*) as cnt, coalesce(sum(b.price), 0) as gross
    from bookings b
    where b.staff_id = p_staff
      and b.status   = 'completed'
      and date_trunc('month', b.starts_at) = date_trunc('month', p_month::timestamptz)
  )
  select
    cfg.staff_id,
    to_char(p_month, 'YYYY-MM')                                as month,
    cfg.base_salary,
    cfg.commission_type,
    cfg.commission_value,
    done.cnt                                                   as bookings_count,
    done.gross                                                 as gross_sales,
    round(case cfg.commission_type
            when 'percentage' then done.gross * cfg.commission_value / 100.0
            else                   done.cnt   * cfg.commission_value
          end, 2)                                              as commission,
    round(cfg.base_salary
        + case cfg.commission_type
            when 'percentage' then done.gross * cfg.commission_value / 100.0
            else                   done.cnt   * cfg.commission_value
          end, 2)                                              as total_payout
  from cfg, done;
$$;

-- ─────────────────────────────────────────────────────────────
-- 6) SALON-WIDE MONTHLY PAYROLL REPORT
-- One row per active employee — powers the owner's payroll tab.
-- ─────────────────────────────────────────────────────────────
create or replace function salon_monthly_payroll(
  p_salon uuid,
  p_month date
) returns table (
  staff_id         uuid,
  full_name        text,
  role             staff_role,
  base_salary      numeric,
  commission_type  commission_type,
  commission_value numeric,
  bookings_count   bigint,
  gross_sales      numeric,
  commission       numeric,
  total_payout     numeric
)
language sql stable security definer set search_path = public as $$
  select
    sp.id,
    sp.full_name,
    sp.role,
    p.base_salary,
    p.commission_type,
    p.commission_value,
    p.bookings_count,
    p.gross_sales,
    p.commission,
    p.total_payout
  from staff_profiles sp
  cross join lateral calculate_monthly_payout(sp.id, p_month) p
  where sp.salon_id = p_salon
    and sp.status   = 'active'
    and is_salon_owner(p_salon)   -- defence in depth on top of RLS
  order by p.total_payout desc;
$$;

-- ─────────────────────────────────────────────────────────────
-- 7) STAFF PORTAL HELPER
-- Everything the employee's mobile view needs in one round trip:
-- next bookings + month-to-date earnings.
-- ─────────────────────────────────────────────────────────────
create or replace function my_portal_snapshot()
returns table (
  staff_id       uuid,
  full_name      text,
  upcoming       jsonb,   -- next 10 bookings
  month_payout   jsonb,   -- calculate_monthly_payout for current month
  pending_leaves jsonb
)
language sql stable security definer set search_path = public as $$
  select
    sp.id,
    sp.full_name,
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', b.id, 'client', b.client_name, 'service', b.service_name,
               'starts_at', b.starts_at, 'ends_at', b.ends_at, 'price', b.price)
             order by b.starts_at)
      from (select * from bookings
            where staff_id = sp.id and status = 'confirmed' and starts_at >= now()
            order by starts_at limit 10) b
    ), '[]'::jsonb),
    (select to_jsonb(p) from calculate_monthly_payout(sp.id, current_date) p),
    coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', l.id, 'start_date', l.start_date, 'end_date', l.end_date,
               'type', l.type, 'status', l.status))
      from staff_leaves l
      where l.staff_id = sp.id and l.status in ('pending','approved')
        and l.end_date >= current_date
    ), '[]'::jsonb)
  from staff_profiles sp
  where sp.user_id = auth.uid();
$$;
