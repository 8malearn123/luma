-- ═══════════════════════════════════════════════════════════════════════════
-- LUMA · اختبارات المخطط — تُشغَّل على PostgreSQL محلي قبل أي نشر
--   psql -f supabase/tests/schema_test.sql
-- تغطّي: منع الحجز المزدوج · حدود الدوام بتوقيت الصالون · تداخل الإجازات
--         · الحجز أثناء إجازة معتمدة · عزل بيانات كل صالون بـ RLS
-- ═══════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP off
\pset format unaligned
\pset tuples_only on
set time zone 'UTC';          -- كما هي جلسة Supabase افتراضياً

create temporary table if not exists _res(name text, ok boolean, note text);

create or replace function _expect_fail(p_sql text, p_name text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
    insert into _res values (p_name, false, 'نجح وكان يجب أن يُرفض');
  exception when others then
    insert into _res values (p_name, true, sqlerrm);
  end;
end $$;

create or replace function _expect_ok(p_sql text, p_name text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
    insert into _res values (p_name, true, '');
  exception when others then
    insert into _res values (p_name, false, sqlerrm);
  end;
end $$;

-- ── بيانات أساسية: مالكتان، صالونان، خبيرتان ──
insert into auth.users (id,email) values
  ('11111111-1111-1111-1111-111111111111','owner1@luma.test'),
  ('22222222-2222-2222-2222-222222222222','owner2@luma.test') on conflict do nothing;
insert into salons (id,owner_id,name,city) values
  ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','صالون لمسة','جدة'),
  ('aaaaaaaa-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','صالون بليجر','الرياض') on conflict do nothing;
insert into staff_profiles (id,salon_id,full_name,role) values
  ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','أمل','makeup_artist'),
  ('cccccccc-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000002','سارة','hair_stylist') on conflict do nothing;
-- دوام 10:00–22:00 بتوقيت الصالون، والجمعة (dow=5) إجازة
insert into staff_schedules (staff_id,weekday,is_day_off,shift_start,shift_end)
select s.id, d, (d=5), case when d=5 then null else time '10:00' end, case when d=5 then null else time '22:00' end
from staff_profiles s, generate_series(0,6) d on conflict do nothing;

-- 2026-10-08 خميس (يوم عمل)
select _expect_ok($$insert into bookings (salon_id,staff_id,client_name,service_name,price,starts_at,ends_at)
  values ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','نوف','مكياج عروس',850,
          '2026-10-08 17:00+03','2026-10-08 20:00+03')$$, 'حجز داخل الدوام ينجح');

select _expect_fail($$insert into bookings (salon_id,staff_id,client_name,service_name,price,starts_at,ends_at)
  values ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','لينا','منيكير',160,
          '2026-10-08 18:00+03','2026-10-08 18:30+03')$$, 'حجز متداخل يُرفض');

select _expect_ok($$insert into bookings (salon_id,staff_id,client_name,service_name,price,starts_at,ends_at)
  values ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','جود','تسريحة',200,
          '2026-10-08 20:00+03','2026-10-08 21:00+03')$$, 'حجز ملاصق بلا تداخل ينجح');

-- الحالة التي كشفت العطل: 23:30 بتوقيت الرياض = 20:30 UTC — داخل نافذة UTC وخارج الدوام المحلي
select _expect_fail($$insert into bookings (salon_id,staff_id,client_name,service_name,price,starts_at,ends_at)
  values ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','مها','تنظيف',320,
          '2026-10-08 23:30+03','2026-10-08 23:59+03')$$, 'حجز بعد إغلاق الصالون يُرفض (بتوقيت الصالون لا UTC)');

select _expect_fail($$insert into bookings (salon_id,staff_id,client_name,service_name,price,starts_at,ends_at)
  values ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','ريم','قص',150,
          '2026-10-09 12:00+03','2026-10-09 13:00+03')$$, 'حجز في يوم الإجازة الأسبوعية يُرفض');

select _expect_ok($$insert into staff_leaves (staff_id,type,start_date,end_date,status)
  values ('bbbbbbbb-0000-0000-0000-000000000001','annual','2026-11-10','2026-11-14','approved')$$, 'إجازة أولى تنجح');

select _expect_fail($$insert into staff_leaves (staff_id,type,start_date,end_date,status)
  values ('bbbbbbbb-0000-0000-0000-000000000001','sick','2026-11-12','2026-11-13','pending')$$, 'إجازة متداخلة تُرفض');

select _expect_fail($$insert into bookings (salon_id,staff_id,client_name,service_name,price,starts_at,ends_at)
  values ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','هند','صبغة',550,
          '2026-11-11 12:00+03','2026-11-11 13:00+03')$$, 'حجز داخل إجازة معتمدة يُرفض');

-- مولّد الخانات يتفق مع الحارس: آخر خانة 30 دقيقة تنتهي 22:00
insert into _res
select 'مولّد الخانات يقف عند إغلاق الصالون',
       max(slot_start at time zone 'Asia/Riyadh')::time = time '21:30',
       'آخر خانة: '||max(slot_start at time zone 'Asia/Riyadh')::time
from get_available_booking_slots('cccccccc-0000-0000-0000-000000000001'::uuid,'2026-10-08'::date,30);

-- ── عزل البيانات بين الصوالين (RLS) ──
-- المالك يتجاوز RLS في PostgreSQL، لذا نختبر بدور authenticated
-- كما تفعل Supabase تماماً، وداخل معاملة حتى يسري SET LOCAL.
grant usage on schema public to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on all tables in schema public to anon;

do $$
declare v1 int; v2 int; v3 int; v4 int;
begin
  -- ما تراه المالكة الأولى
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111',true);
  select count(*) into v1 from salons;
  -- محاولة رؤية موظفات صالون غيرها
  perform set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',true);
  select count(*) into v2 from staff_profiles where salon_id='aaaaaaaa-0000-0000-0000-000000000001';
  select count(*) into v3 from salons;
  -- زائرة بلا هوية: يجب مسح الادعاء أيضاً، وإلا بقيت auth.uid() تعيد
  -- هوية المالكة السابقة فتبدو السياسة وكأنها تسرّب
  perform set_config('role','anon',true);
  perform set_config('request.jwt.claim.sub','',true);
  select count(*) into v4 from salons;
  perform set_config('role','luma',true);

  insert into _res values ('كل مالكة ترى صالونها وحده', v1=1 and v3=1, 'الأولى='||v1||' الثانية='||v3);
  insert into _res values ('لا تصل مالكة لبيانات صالون غيرها', v2=0, 'صفوف مسرَّبة='||v2);
  insert into _res values ('الزائرة بلا هوية لا ترى شيئاً', v4=0, 'صفوف='||v4);
end $$;

\echo ''
\echo '════════ النتائج ════════'
select case when ok then '  ✓ ' else '  ✗ ' end || name || case when ok then '' else '  ← '||note end from _res;
\echo ''
select '  المجموع: '||count(*) filter (where ok)||'/'||count(*)||' ناجح' from _res;
select case when count(*) filter (where not ok)=0 then '  كل اختبارات المخطط خضراء' else '  ✗ فشل '||count(*) filter (where not ok) end from _res;
