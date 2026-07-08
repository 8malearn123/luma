-- ═══════════════════════════════════════════════════════════════════════════
-- LUMA · HR Module Upgrade — Migration 0003
-- Closed-loop HR ecosystem: leave balances, booking conflict rerouting,
-- attendance tracking, multi-source tiered commissions, advances/tips,
-- and month-end settlement (frozen payroll ledger).
-- Depends on: 0001_hr_schema.sql, 0002_hr_logic.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1) LEAVE BALANCE TRACKER
-- Each employee carries an annual quota; the balance is always
-- derived (never stored) so it can never drift out of sync.
-- Only 'annual' leave consumes the quota.
-- ─────────────────────────────────────────────────────────────
alter table staff_profiles
  add column if not exists annual_leave_quota smallint not null default 21
    check (annual_leave_quota between 0 and 90);

create or replace function leave_balance(p_staff uuid, p_year int default null)
returns table (quota smallint, used int, remaining int)
language sql stable security definer set search_path = public as $$
  with y as (select coalesce(p_year, extract(year from current_date)::int) as yr)
  select
    sp.annual_leave_quota,
    coalesce((
      select sum(l.end_date - l.start_date + 1)::int
      from staff_leaves l, y
      where l.staff_id = p_staff
        and l.status = 'approved'
        and l.type   = 'annual'
        and extract(year from l.start_date) = y.yr
    ), 0),
    sp.annual_leave_quota - coalesce((
      select sum(l.end_date - l.start_date + 1)::int
      from staff_leaves l, y
      where l.staff_id = p_staff
        and l.status = 'approved'
        and l.type   = 'annual'
        and extract(year from l.start_date) = y.yr
    ), 0)
  from staff_profiles sp
  where sp.id = p_staff;
$$;

-- Guard: an annual leave cannot be approved past the remaining balance.
create or replace function leave_balance_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_days int := new.end_date - new.start_date + 1;
  v_rem  int;
begin
  if new.status = 'approved' and old.status = 'pending' and new.type = 'annual' then
    select remaining into v_rem from leave_balance(new.staff_id);
    -- the request being approved is not yet counted (old.status=pending)
    if v_days > v_rem then
      raise exception 'INSUFFICIENT_LEAVE_BALANCE: requested % days, % remaining', v_days, v_rem;
    end if;
  end if;
  return new;
end $$;

create trigger leaves_balance_check
  before update on staff_leaves
  for each row execute function leave_balance_guard();

-- ─────────────────────────────────────────────────────────────
-- 2) BOOKING CONFLICTS: DETECT → AUTO-DISTRIBUTE or NOTIFY
-- Approval no longer silently cancels bookings (0002 behaviour);
-- instead the API surfaces the conflicts and the owner picks the
-- resolution in the modal.
-- ─────────────────────────────────────────────────────────────
drop trigger if exists leaves_transition on staff_leaves;

create or replace function leave_transition_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_salon uuid;
begin
  if new.status = old.status then return new; end if;
  select salon_id into v_salon from staff_profiles where id = new.staff_id;

  if old.status <> 'pending' then
    raise exception 'LEAVE_ALREADY_FINALIZED: % → % is not allowed', old.status, new.status;
  end if;

  if new.status in ('approved','rejected') then
    if not is_salon_owner(v_salon) then raise exception 'ONLY_OWNER_MAY_REVIEW'; end if;
    new.reviewed_by := auth.uid(); new.reviewed_at := now();
  elsif new.status = 'cancelled' then
    if (select user_id from staff_profiles where id = new.staff_id) <> auth.uid()
       and not is_salon_owner(v_salon) then
      raise exception 'ONLY_REQUESTER_MAY_CANCEL';
    end if;
  end if;
  return new;  -- conflicts are resolved explicitly via the functions below
end $$;

create trigger leaves_transition
  before update on staff_leaves
  for each row execute function leave_transition_guard();

-- Bookings that collide with a leave window (for the conflicts modal).
create or replace function leave_conflicts(p_leave uuid)
returns table (booking_id uuid, client_name text, client_phone text,
               service_name text, starts_at timestamptz, price numeric)
language sql stable security definer set search_path = public as $$
  select b.id, b.client_name, b.client_phone, b.service_name, b.starts_at, b.price
  from staff_leaves l
  join bookings b on b.staff_id = l.staff_id
  where l.id = p_leave
    and b.status = 'confirmed'
    and b.starts_at::date between l.start_date and l.end_date
  order by b.starts_at;
$$;

-- "توزيع الحجوزات تلقائياً": move each conflicting booking to another
-- ACTIVE staff member in the same salon with the SAME role who is
-- available at that exact time. Unplaceable bookings are flagged for
-- the notify/reschedule flow instead of being dropped silently.
create table if not exists booking_reroute_log (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null references bookings (id) on delete cascade,
  from_staff  uuid not null references staff_profiles (id),
  to_staff    uuid references staff_profiles (id),      -- null = needs reschedule
  leave_id    uuid references staff_leaves (id),
  outcome     text not null check (outcome in ('rerouted','needs_reschedule','client_notified')),
  created_at  timestamptz not null default now()
);
alter table booking_reroute_log enable row level security;
create policy reroute_owner_all on booking_reroute_log
  for all using (is_salon_owner((select salon_id from staff_profiles where id = from_staff)))
  with check  (is_salon_owner((select salon_id from staff_profiles where id = from_staff)));

create or replace function auto_distribute_bookings(p_leave uuid)
returns table (booking_id uuid, outcome text, new_staff_name text)
language plpgsql security definer set search_path = public as $$
declare
  v_leave staff_leaves%rowtype;
  v_owner staff_profiles%rowtype;
  b record; cand record; placed boolean;
begin
  select * into v_leave from staff_leaves where id = p_leave;
  select * into v_owner from staff_profiles where id = v_leave.staff_id;

  if not is_salon_owner(v_owner.salon_id) then
    raise exception 'ONLY_OWNER_MAY_DISTRIBUTE';
  end if;

  for b in select * from bookings
           where staff_id = v_leave.staff_id and status = 'confirmed'
             and starts_at::date between v_leave.start_date and v_leave.end_date
           order by starts_at
  loop
    placed := false;
    -- same salon, same specialty, active, not the leaving employee
    for cand in select sp.* from staff_profiles sp
                where sp.salon_id = v_owner.salon_id
                  and sp.id <> v_leave.staff_id
                  and sp.role = v_owner.role
                  and sp.status = 'active'
                order by sp.created_at
    loop
      if staff_is_available(cand.id, b.starts_at, b.ends_at) then
        update bookings set staff_id = cand.id where id = b.id;
        insert into booking_reroute_log (booking_id, from_staff, to_staff, leave_id, outcome)
        values (b.id, v_leave.staff_id, cand.id, p_leave, 'rerouted');
        booking_id := b.id; outcome := 'rerouted'; new_staff_name := cand.full_name;
        placed := true; return next; exit;
      end if;
    end loop;

    if not placed then
      insert into booking_reroute_log (booking_id, from_staff, to_staff, leave_id, outcome)
      values (b.id, v_leave.staff_id, null, p_leave, 'needs_reschedule');
      booking_id := b.id; outcome := 'needs_reschedule'; new_staff_name := null;
      return next;
    end if;
  end loop;
end $$;

-- "إشعار اعتذار وإعادة جدولة": cancel the conflicting bookings and log
-- them as client_notified. Hook your SMS/WhatsApp provider onto this log
-- (or a Supabase Edge Function listening to inserts).
create or replace function notify_and_reschedule(p_leave uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v_leave staff_leaves%rowtype; v_cnt int := 0; b record;
begin
  select * into v_leave from staff_leaves where id = p_leave;
  if not is_salon_owner((select salon_id from staff_profiles where id = v_leave.staff_id)) then
    raise exception 'ONLY_OWNER_MAY_DISTRIBUTE';
  end if;
  for b in select * from bookings
           where staff_id = v_leave.staff_id and status = 'confirmed'
             and starts_at::date between v_leave.start_date and v_leave.end_date
  loop
    update bookings set status = 'cancelled' where id = b.id;
    insert into booking_reroute_log (booking_id, from_staff, leave_id, outcome)
    values (b.id, v_leave.staff_id, p_leave, 'client_notified');
    v_cnt := v_cnt + 1;
  end loop;
  return v_cnt;
end $$;

-- ─────────────────────────────────────────────────────────────
-- 3) ATTENDANCE (clock-in / clock-out) + DEVIATION FLAGS
-- ─────────────────────────────────────────────────────────────
create table if not exists staff_attendance (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references staff_profiles (id) on delete cascade,
  work_date  date not null default current_date,
  clock_in   timestamptz,
  clock_out  timestamptz,
  unique (staff_id, work_date),
  check (clock_out is null or clock_in is null or clock_out > clock_in)
);
alter table staff_attendance enable row level security;
create policy att_owner_all on staff_attendance
  for all using (is_salon_owner((select salon_id from staff_profiles where id = staff_id)))
  with check  (is_salon_owner((select salon_id from staff_profiles where id = staff_id)));
create policy att_self_rw on staff_attendance
  for all using (staff_id = my_staff_id()) with check (staff_id = my_staff_id());

-- Per-day deviation vs the scheduled shift; the grid paints soft-red
-- from this. late_minutes counts clock_in after shift_start; absent =
-- scheduled working day with no clock_in and no approved leave.
create or replace function attendance_deviations(p_staff uuid, p_month date)
returns table (work_date date, late_minutes int, absent boolean)
language sql stable security definer set search_path = public as $$
  with days as (
    select d::date as d
    from generate_series(date_trunc('month', p_month),
                         least(date_trunc('month', p_month) + interval '1 month - 1 day', current_date),
                         interval '1 day') d
  )
  select
    days.d,
    greatest(0, coalesce(
      extract(epoch from (a.clock_in - (days.d + ss.shift_start)::timestamptz)) / 60, 0))::int,
    (a.clock_in is null
      and not exists (select 1 from staff_leaves l
                      where l.staff_id = p_staff and l.status = 'approved'
                        and days.d between l.start_date and l.end_date))
  from days
  join staff_schedules ss
    on ss.staff_id = p_staff
   and ss.weekday  = extract(dow from days.d)::smallint
   and not ss.is_day_off
  left join staff_attendance a on a.staff_id = p_staff and a.work_date = days.d;
$$;

-- Month aggregate consumed by the payroll calculator.
create or replace function attendance_summary(p_staff uuid, p_month date)
returns table (total_late_minutes bigint, absences bigint)
language sql stable security definer set search_path = public as $$
  select coalesce(sum(late_minutes), 0), count(*) filter (where absent)
  from attendance_deviations(p_staff, p_month);
$$;

-- ─────────────────────────────────────────────────────────────
-- 4) MULTI-SOURCE COMMISSIONS + ADJUSTMENTS + TIPS
-- ─────────────────────────────────────────────────────────────
alter table staff_commissions
  add column if not exists service_pct  numeric(5,2) not null default 10 check (service_pct between 0 and 100),
  add column if not exists product_pct  numeric(5,2) not null default 15 check (product_pct between 0 and 100),
  -- ordered tiers: [{"threshold": 15000, "pct": 12}, …] — the highest
  -- crossed threshold overrides service_pct for the WHOLE month's services.
  add column if not exists tiers jsonb not null default '[]'::jsonb;

-- Retail counter sales (products) attributed to a staff member.
create table if not exists product_sales (
  id         uuid primary key default gen_random_uuid(),
  salon_id   uuid not null references salons (id) on delete cascade,
  staff_id   uuid not null references staff_profiles (id) on delete restrict,
  item_name  text not null,
  amount     numeric(10,2) not null check (amount >= 0),
  sold_at    timestamptz not null default now()
);
create index product_sales_staff_idx on product_sales (staff_id, sold_at);
alter table product_sales enable row level security;
create policy psales_owner_all on product_sales
  for all using (is_salon_owner(salon_id)) with check (is_salon_owner(salon_id));
create policy psales_self_read on product_sales
  for select using (staff_id = my_staff_id());

-- Advances (سلف), deductions and bonuses applied to a specific month.
create table if not exists staff_adjustments (
  id         uuid primary key default gen_random_uuid(),
  staff_id   uuid not null references staff_profiles (id) on delete cascade,
  month      date not null,            -- first day of the month it applies to
  kind       text not null check (kind in ('advance','deduction','bonus')),
  amount     numeric(10,2) not null check (amount > 0),
  note       text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);
create index staff_adjustments_idx on staff_adjustments (staff_id, month);
alter table staff_adjustments enable row level security;
create policy adj_owner_all on staff_adjustments
  for all using (is_salon_owner((select salon_id from staff_profiles where id = staff_id)))
  with check  (is_salon_owner((select salon_id from staff_profiles where id = staff_id)));
create policy adj_self_read on staff_adjustments
  for select using (staff_id = my_staff_id());

-- Digital tips ride on the booking row (paid via POS/link at checkout).
alter table bookings
  add column if not exists tip_amount numeric(10,2) not null default 0 check (tip_amount >= 0);

-- ─────────────────────────────────────────────────────────────
-- 5) PAYOUT CALCULATOR v2 — the absolute-truth ledger row
--   net = base
--       + service commission (tiered rate × completed-service gross)
--       + product commission (product_pct × product sales)
--       + digital tips (100%, no commission deduction)
--       + bonuses − advances − deductions
-- Lateness is reported alongside (policy-free): owners decide what to
-- deduct and record it as a 'deduction' adjustment — keeping the math
-- auditable instead of hiding policy in a formula.
-- ─────────────────────────────────────────────────────────────
create or replace function calculate_monthly_payout_v2(p_staff uuid, p_month date)
returns table (
  staff_id uuid, month text, base_salary numeric,
  service_gross numeric, service_rate numeric, service_commission numeric,
  product_gross numeric, product_rate numeric, product_commission numeric,
  tips numeric, bonuses numeric, advances numeric, deductions numeric,
  late_minutes bigint, absences bigint, net_payout numeric
)
language sql stable security definer set search_path = public as $$
  with cfg as (
    select sp.id,
           coalesce(sc.base_salary, 0)  as base_salary,
           coalesce(sc.service_pct, 10) as service_pct,
           coalesce(sc.product_pct, 15) as product_pct,
           coalesce(sc.tiers, '[]')     as tiers
    from staff_profiles sp
    left join staff_commissions sc on sc.staff_id = sp.id
    where sp.id = p_staff
  ),
  svc as (
    select coalesce(sum(price), 0) as gross,
           coalesce(sum(tip_amount), 0) as tips
    from bookings
    where staff_id = p_staff and status = 'completed'
      and date_trunc('month', starts_at) = date_trunc('month', p_month::timestamptz)
  ),
  rate as ( -- highest tier whose threshold the month's service gross crossed
    select coalesce((
      select max((t->>'pct')::numeric)
      from cfg, jsonb_array_elements(cfg.tiers) t
      where (select gross from svc) >= (t->>'threshold')::numeric
    ), (select service_pct from cfg)) as service_rate
  ),
  prod as (
    select coalesce(sum(amount), 0) as gross
    from product_sales
    where staff_id = p_staff
      and date_trunc('month', sold_at) = date_trunc('month', p_month::timestamptz)
  ),
  adj as (
    select coalesce(sum(amount) filter (where kind = 'bonus'), 0)     as bonuses,
           coalesce(sum(amount) filter (where kind = 'advance'), 0)   as advances,
           coalesce(sum(amount) filter (where kind = 'deduction'), 0) as deductions
    from staff_adjustments
    where staff_id = p_staff
      and date_trunc('month', month) = date_trunc('month', p_month)
  ),
  att as (select * from attendance_summary(p_staff, p_month))
  select
    cfg.id, to_char(p_month, 'YYYY-MM'), cfg.base_salary,
    svc.gross, rate.service_rate,
    round(svc.gross * rate.service_rate / 100, 2),
    prod.gross, cfg.product_pct,
    round(prod.gross * cfg.product_pct / 100, 2),
    svc.tips, adj.bonuses, adj.advances, adj.deductions,
    att.total_late_minutes, att.absences,
    round(cfg.base_salary
        + svc.gross  * rate.service_rate / 100
        + prod.gross * cfg.product_pct  / 100
        + svc.tips + adj.bonuses - adj.advances - adj.deductions, 2)
  from cfg, svc, rate, prod, adj, att;
$$;

-- ─────────────────────────────────────────────────────────────
-- 6) MONTH-END SETTLEMENT — "تصفية واعتماد الرواتب"
-- Freezes the month into an immutable ledger + one slip per employee
-- (the PDF generator reads slips; the accounting module reads the
-- settlement row). A month can be closed exactly once per salon.
-- ─────────────────────────────────────────────────────────────
create table if not exists payroll_settlements (
  id         uuid primary key default gen_random_uuid(),
  salon_id   uuid not null references salons (id) on delete cascade,
  month      date not null,
  total_net  numeric(12,2) not null,
  staff_count int not null,
  closed_by  uuid not null references auth.users (id),
  closed_at  timestamptz not null default now(),
  unique (salon_id, month)
);
create table if not exists payroll_slips (
  id            uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references payroll_settlements (id) on delete cascade,
  staff_id      uuid not null references staff_profiles (id),
  breakdown     jsonb not null,   -- frozen calculate_monthly_payout_v2 row
  net_payout    numeric(10,2) not null,
  unique (settlement_id, staff_id)
);
alter table payroll_settlements enable row level security;
alter table payroll_slips enable row level security;
create policy settle_owner_all on payroll_settlements
  for all using (is_salon_owner(salon_id)) with check (is_salon_owner(salon_id));
create policy slips_owner_all on payroll_slips
  for all using (is_salon_owner((select salon_id from payroll_settlements where id = settlement_id)))
  with check  (is_salon_owner((select salon_id from payroll_settlements where id = settlement_id)));
create policy slips_self_read on payroll_slips
  for select using (staff_id = my_staff_id());

create or replace function close_month(p_salon uuid, p_month date)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_total numeric := 0; v_cnt int := 0; s record; p record;
begin
  if not is_salon_owner(p_salon) then raise exception 'ONLY_OWNER_MAY_CLOSE'; end if;
  if exists (select 1 from payroll_settlements
             where salon_id = p_salon and month = date_trunc('month', p_month)) then
    raise exception 'MONTH_ALREADY_CLOSED';
  end if;

  insert into payroll_settlements (salon_id, month, total_net, staff_count, closed_by)
  values (p_salon, date_trunc('month', p_month), 0, 0, auth.uid())
  returning id into v_id;

  for s in select id from staff_profiles where salon_id = p_salon and status = 'active'
  loop
    select * into p from calculate_monthly_payout_v2(s.id, p_month);
    insert into payroll_slips (settlement_id, staff_id, breakdown, net_payout)
    values (v_id, s.id, to_jsonb(p), p.net_payout);
    v_total := v_total + p.net_payout; v_cnt := v_cnt + 1;
  end loop;

  update payroll_settlements set total_net = v_total, staff_count = v_cnt where id = v_id;
  return v_id;
end $$;

-- Adjustments become immutable once their month is settled.
create or replace function adjustments_freeze_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_row staff_adjustments;
begin
  v_row := coalesce(new, old);
  if exists (
    select 1 from payroll_settlements ps
    join staff_profiles sp on sp.salon_id = ps.salon_id
    where sp.id = v_row.staff_id
      and ps.month = date_trunc('month', v_row.month)
  ) then
    raise exception 'MONTH_ALREADY_CLOSED: adjustments are frozen';
  end if;
  return coalesce(new, old);
end $$;

create trigger adjustments_freeze
  before insert or update or delete on staff_adjustments
  for each row execute function adjustments_freeze_guard();
