-- ═══════════════════════════════════════════════════════════════════════════
-- LUMA · Public Landing Pages & Custom Booking Links
-- Migration 0004: salon_custom_pages, salon_services, slug hygiene,
-- and the HR-integrated public availability function.
-- Depends on: 0001 (salons, staff_*), 0002 (staff_is_available)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- 1) SALON CUSTOM PAGES — one public landing page per salon
--    (luma.beauty/<slug>)
-- ─────────────────────────────────────────────────────────────
create table salon_custom_pages (
  id               uuid primary key default gen_random_uuid(),
  salon_id         uuid not null unique references salons (id) on delete cascade,
  slug             text not null,
  title            text not null check (length(trim(title)) between 2 and 80),
  bio              text check (length(bio) <= 600),
  logo_url         text,
  cover_image_url  text,
  -- {"preset":"dark-luxury","bg":"#09090b","accent":"#e5c158","font":"IBM Plex Sans Arabic"}
  theme_config     jsonb not null default '{"preset":"dark-luxury"}'::jsonb,
  -- {"instagram":"…","tiktok":"…","whatsapp":"9665…"}
  social_links     jsonb not null default '{}'::jsonb,
  is_published     boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- No two salons can ever claim the same link.
create unique index salon_pages_slug_uidx on salon_custom_pages (slug);
create index salon_pages_pub_idx on salon_custom_pages (slug) where is_published;

-- ─────────────────────────────────────────────────────────────
-- 2) SLUG SANITIZER — normalize on every write, at the DB layer
--    so no API path can slip an unsafe slug through.
--    "Lama Salon!!" → "lama-salon"
-- ─────────────────────────────────────────────────────────────
create or replace function sanitize_slug() returns trigger
language plpgsql as $$
begin
  new.slug := lower(trim(new.slug));
  new.slug := regexp_replace(new.slug, '\s+', '-', 'g');        -- spaces → hyphen
  new.slug := regexp_replace(new.slug, '[^a-z0-9-]', '', 'g');  -- ascii-safe only
  new.slug := regexp_replace(new.slug, '-{2,}', '-', 'g');      -- collapse ---
  new.slug := trim(both '-' from new.slug);
  if length(new.slug) < 3 then
    raise exception 'SLUG_TOO_SHORT: at least 3 valid characters required';
  end if;
  -- reserved paths that must never become salon links
  if new.slug in ('admin','api','app','login','signup','luma','www','help') then
    raise exception 'SLUG_RESERVED: % is not available', new.slug;
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger salon_pages_slug_sanitize
  before insert or update on salon_custom_pages
  for each row execute function sanitize_slug();

-- ─────────────────────────────────────────────────────────────
-- 3) SALON SERVICES — the public catalog the booking page lists
-- ─────────────────────────────────────────────────────────────
create table salon_services (
  id               uuid primary key default gen_random_uuid(),
  salon_id         uuid not null references salons (id) on delete cascade,
  name             text not null check (length(trim(name)) between 2 and 80),
  description      text check (length(description) <= 300),
  price            numeric(10,2) not null check (price >= 0),
  duration_minutes smallint not null check (duration_minutes between 15 and 480),
  category         text not null check (category in ('hair','makeup','nails','skin','spa','photo','other')),
  is_active        boolean not null default true,
  sort_order       smallint not null default 0,
  created_at       timestamptz not null default now()
);
create index salon_services_salon_idx on salon_services (salon_id, category) where is_active;

-- ─────────────────────────────────────────────────────────────
-- RLS: owners manage their page/services; the public may READ
-- published pages and active services (anonymous role included) —
-- that is what makes luma.beauty/<slug> work without a session.
-- ─────────────────────────────────────────────────────────────
alter table salon_custom_pages enable row level security;
alter table salon_services     enable row level security;

create policy pages_owner_all on salon_custom_pages
  for all using (is_salon_owner(salon_id)) with check (is_salon_owner(salon_id));
create policy pages_public_read on salon_custom_pages
  for select using (is_published);

create policy services_owner_all on salon_services
  for all using (is_salon_owner(salon_id)) with check (is_salon_owner(salon_id));
create policy services_public_read on salon_services
  for select using (
    is_active and exists (select 1 from salon_custom_pages p
                          where p.salon_id = salon_services.salon_id and p.is_published)
  );

-- ─────────────────────────────────────────────────────────────
-- 4) HR INTEGRATION — public availability for one staff member
--    on one date, leave-aware by construction:
--      a. approved leave covering the date → zero rows, immediately
--      b. otherwise: that weekday's shift from staff_schedules,
--         sliced into 15/30-minute intervals, minus breaks and
--         existing live bookings (via staff_is_available from 0002)
-- ─────────────────────────────────────────────────────────────
create or replace function get_available_booking_slots(
  p_staff_id       uuid,
  p_date           date,
  p_slot_minutes   integer default 30   -- 15 or 30
) returns table (slot_start timestamptz, slot_end timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  v_sched staff_schedules%rowtype;
  v_tz    text := coalesce(current_setting('app.salon_tz', true), 'Asia/Riyadh');
begin
  if p_slot_minutes not in (15, 30) then
    raise exception 'SLOT_SIZE_INVALID: use 15 or 30 minutes';
  end if;

  -- (a) approved leave wins over everything: the whole day is closed.
  if exists (
    select 1 from staff_leaves l
    where l.staff_id = p_staff_id
      and l.status   = 'approved'
      and p_date between l.start_date and l.end_date
  ) then
    return;  -- 0 rows → the page shows "على إجازة" and offers alternatives
  end if;

  -- (b) the weekday's shift; day off or missing row → no slots.
  select * into v_sched
  from staff_schedules
  where staff_id = p_staff_id
    and weekday  = extract(dow from p_date)::smallint;

  if not found or v_sched.is_day_off then
    return;
  end if;

  return query
  with grid as (
    select gs as s, gs + make_interval(mins => p_slot_minutes) as e
    from generate_series(
      (p_date::text || ' ' || v_sched.shift_start::text)::timestamp at time zone v_tz,
      (p_date::text || ' ' || v_sched.shift_end::text)::timestamp  at time zone v_tz
        - make_interval(mins => p_slot_minutes),
      make_interval(mins => p_slot_minutes)
    ) gs
  )
  select g.s, g.e
  from grid g
  where g.s > now()                                  -- never offer the past
    and staff_is_available(p_staff_id, g.s, g.e)     -- breaks + live bookings
  order by g.s;
end $$;

-- Resolve a public slug to everything the landing page needs in one call.
create or replace function get_public_page(p_slug text)
returns table (
  salon_id uuid, title text, bio text, logo_url text, cover_image_url text,
  theme_config jsonb, social_links jsonb,
  services jsonb, staff jsonb
)
language sql stable security definer set search_path = public as $$
  select
    p.salon_id, p.title, p.bio, p.logo_url, p.cover_image_url,
    p.theme_config, p.social_links,
    coalesce((select jsonb_agg(jsonb_build_object(
        'id',s.id,'name',s.name,'price',s.price,
        'duration',s.duration_minutes,'category',s.category) order by s.sort_order)
      from salon_services s
      where s.salon_id = p.salon_id and s.is_active),'[]'::jsonb),
    coalesce((select jsonb_agg(jsonb_build_object(
        'id',sp.id,'name',sp.full_name,'role',sp.role) order by sp.created_at)
      from staff_profiles sp
      where sp.salon_id = p.salon_id and sp.status = 'active'),'[]'::jsonb)
  from salon_custom_pages p
  where p.slug = lower(p_slug) and p.is_published;
$$;
