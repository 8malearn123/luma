-- ═══════════ LUMA · Accounting core (PostgreSQL / Supabase) ═══════════
-- نظير قواعد luma-acc-*.js على مستوى قاعدة البيانات. الطبقة نفسها والقواعد
-- نفسها، لكن مفروضة هنا بـ CHECK و TRIGGER فلا يستطيع أي عميل خرقها.
-- آمنة للتشغيل المتكرر (IF NOT EXISTS) ولا تمسّ أي جدول قائم.

create extension if not exists "pgcrypto";

-- ─────────── التصنيفات ───────────
do $$ begin
  create type acc_type   as enum ('asset','liability','equity','revenue','expense');
exception when duplicate_object then null; end $$;
do $$ begin
  create type acc_nature as enum ('debit','credit');
exception when duplicate_object then null; end $$;
do $$ begin
  create type je_status  as enum ('draft','posted','reversed','void');
exception when duplicate_object then null; end $$;
do $$ begin
  create type party_kind as enum ('customer','supplier','staff');
exception when duplicate_object then null; end $$;

-- ─────────── مراكز التكلفة (الفروع والأقسام) ───────────
create table if not exists cost_centers (
  id          uuid primary key default gen_random_uuid(),
  salon_id    uuid not null,
  code        text not null,
  name        text not null,
  kind        text not null default 'branch' check (kind in ('branch','department')),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (salon_id, code)
);

-- ─────────── دليل الحسابات ───────────
create table if not exists accounts (
  id          uuid primary key default gen_random_uuid(),
  salon_id    uuid not null,
  code        text not null,
  name        text not null,
  type        acc_type   not null,
  nature      acc_nature not null,
  is_group    boolean not null default false,
  is_contra   boolean not null default false,
  parent_id   uuid references accounts(id) on delete restrict,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (salon_id, code)
);
create index if not exists accounts_salon_idx  on accounts(salon_id);
create index if not exists accounts_parent_idx on accounts(parent_id);

-- ─────────── الجهات (عملاء/موردون/موظفات) ───────────
create table if not exists parties (
  id          uuid primary key default gen_random_uuid(),
  salon_id    uuid not null,
  kind        party_kind not null,
  name        text not null,
  phone       text,
  vat_number  text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create index if not exists parties_salon_kind_idx on parties(salon_id, kind);

-- ─────────── الفترات المحاسبية ───────────
create table if not exists accounting_periods (
  id          uuid primary key default gen_random_uuid(),
  salon_id    uuid not null,
  name        text not null,
  date_from   date not null,
  date_to     date not null,
  status      text not null default 'open' check (status in ('open','closed')),
  closed_at   timestamptz,
  closed_by   uuid,
  created_at  timestamptz not null default now(),
  check (date_to >= date_from)
);
create index if not exists periods_salon_idx on accounting_periods(salon_id, date_from, date_to);

-- ─────────── القيود ───────────
create table if not exists journal_entries (
  id            uuid primary key default gen_random_uuid(),
  salon_id      uuid not null,
  entry_no      text not null,
  entry_date    date not null,
  description   text not null default '',
  reference     text not null default '',
  source        text not null default 'manual',
  source_id     text,
  cost_center_id uuid references cost_centers(id),
  party_id      uuid references parties(id),
  status        je_status not null default 'draft',
  reversal_of   uuid references journal_entries(id),
  reversed_by   uuid references journal_entries(id),
  void_reason   text,
  created_by    uuid,
  created_at    timestamptz not null default now(),
  posted_by     uuid,
  posted_at     timestamptz,
  unique (salon_id, entry_no)
);
create index if not exists je_salon_date_idx on journal_entries(salon_id, entry_date);
create index if not exists je_status_idx     on journal_entries(salon_id, status);
-- عملية واحدة → قيد واحد: يمنع الازدواج على مستوى القاعدة
create unique index if not exists je_source_uniq
  on journal_entries(salon_id, source, source_id)
  where source_id is not null and status <> 'void';

create table if not exists journal_lines (
  id          uuid primary key default gen_random_uuid(),
  entry_id    uuid not null references journal_entries(id) on delete cascade,
  account_id  uuid not null references accounts(id) on delete restrict,
  debit       bigint not null default 0,   -- هللات
  credit      bigint not null default 0,   -- هللات
  description text not null default '',
  cost_center_id uuid references cost_centers(id),
  party_id    uuid references parties(id),
  line_no     int not null default 0,
  -- السطر إما مدين أو دائن، موجب، لا الاثنان ولا صفر
  check (debit >= 0 and credit >= 0),
  check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);
create index if not exists jl_entry_idx   on journal_lines(entry_id);
create index if not exists jl_account_idx on journal_lines(account_id);

-- ─────────── طبقة الربط: دور محاسبي → حساب ───────────
create table if not exists account_mapping (
  salon_id   uuid not null,
  role       text not null,
  account_id uuid not null references accounts(id) on delete restrict,
  updated_at timestamptz not null default now(),
  primary key (salon_id, role)
);

-- ─────────── سجل التدقيق: يُلحق فقط ───────────
create table if not exists accounting_audit (
  id          uuid primary key default gen_random_uuid(),
  salon_id    uuid not null,
  action      text not null,
  entity      text not null,
  entity_id   text not null,
  before_data jsonb,
  after_data  jsonb,
  reason      text,
  actor       uuid,
  created_at  timestamptz not null default now()
);
create index if not exists audit_entity_idx on accounting_audit(salon_id, entity, entity_id);

-- ═══════════ القواعد المفروضة ═══════════

-- 1) لا ترحيل لقيد غير متوازن، ولا على حساب أب/موقوف، ولا في فترة مقفلة
create or replace function acc_guard_post() returns trigger language plpgsql as $$
declare d bigint; c bigint; bad int; closed int;
begin
  if new.status = 'posted' and (old.status is distinct from 'posted') then
    select coalesce(sum(debit),0), coalesce(sum(credit),0) into d, c
      from journal_lines where entry_id = new.id;
    if d <> c then
      raise exception 'قيد غير متوازن: المدين % ≠ الدائن %', d, c;
    end if;
    if d = 0 then raise exception 'لا يمكن ترحيل قيد بلا مبالغ'; end if;

    select count(*) into bad from journal_lines l
      join accounts a on a.id = l.account_id
     where l.entry_id = new.id and (a.is_group or not a.active);
    if bad > 0 then raise exception 'القيد يحتوي حساباً أباً أو موقوفاً'; end if;

    select count(*) into closed from accounting_periods p
     where p.salon_id = new.salon_id and p.status = 'closed'
       and new.entry_date between p.date_from and p.date_to;
    if closed > 0 then raise exception 'الفترة المحاسبية مقفلة لهذا التاريخ'; end if;

    new.posted_at := coalesce(new.posted_at, now());
  end if;
  return new;
end $$;
drop trigger if exists trg_acc_guard_post on journal_entries;
create trigger trg_acc_guard_post before update on journal_entries
  for each row execute function acc_guard_post();

-- 2) القيد المرحَّل لا يُعدَّل ولا يُحذف — العكس هو الطريق الوحيد
create or replace function acc_immutable_posted() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'posted' then raise exception 'لا يُحذف قيد مُرحَّل — استخدمي العكس'; end if;
    return old;
  end if;
  if old.status = 'posted' and new.status = 'posted'
     and (new.entry_date, new.description, new.reference) is distinct from
         (old.entry_date, old.description, old.reference) then
    raise exception 'لا يُعدَّل قيد مُرحَّل — استخدمي العكس';
  end if;
  return new;
end $$;
drop trigger if exists trg_acc_immutable on journal_entries;
create trigger trg_acc_immutable before update or delete on journal_entries
  for each row execute function acc_immutable_posted();

-- 3) سطور القيد المرحَّل مغلقة
create or replace function acc_lines_locked() returns trigger language plpgsql as $$
declare st je_status;
begin
  select status into st from journal_entries
   where id = coalesce(new.entry_id, old.entry_id);
  if st = 'posted' then raise exception 'لا تُعدَّل سطور قيد مُرحَّل'; end if;
  return coalesce(new, old);
end $$;
drop trigger if exists trg_acc_lines_locked on journal_lines;
create trigger trg_acc_lines_locked before insert or update or delete on journal_lines
  for each row execute function acc_lines_locked();

-- ─────────── دفتر الأستاذ وميزان المراجعة ───────────
create or replace view general_ledger as
select e.salon_id, e.id as entry_id, e.entry_no, e.entry_date, e.reference,
       e.source, e.source_id, l.line_no,
       a.id as account_id, a.code as account_code, a.name as account_name,
       a.type as account_type, a.nature,
       coalesce(nullif(l.description,''), e.description) as description,
       l.debit, l.credit,
       case when a.nature = 'debit' then l.debit - l.credit
                                    else l.credit - l.debit end as signed_amount,
       l.cost_center_id, l.party_id
  from journal_entries e
  join journal_lines   l on l.entry_id = e.id
  join accounts        a on a.id = l.account_id
 where e.status = 'posted';

create or replace view trial_balance as
select salon_id, account_id, account_code, account_name, account_type,
       sum(debit) as total_debit, sum(credit) as total_credit,
       sum(signed_amount) as balance
  from general_ledger
 group by salon_id, account_id, account_code, account_name, account_type;

-- ─────────── RLS ───────────
alter table accounts            enable row level security;
alter table journal_entries     enable row level security;
alter table journal_lines       enable row level security;
alter table accounting_audit    enable row level security;
alter table accounting_periods  enable row level security;
alter table parties             enable row level security;
alter table cost_centers        enable row level security;
alter table account_mapping     enable row level security;
-- السياسات تُعرَّف مع نموذج الهوية والصلاحيات في 0002؛ الجداول مقفلة افتراضياً.
