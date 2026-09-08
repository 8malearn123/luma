#!/usr/bin/env bash
# تشغيل اختبارات المخطط على PostgreSQL محلي — بلا حاجة لمشروع Supabase.
# يبني قاعدة نظيفة، يشغّل الهجرات الأربع بالترتيب، ثم اختبارات المخطط.
#   bash luma-hr/supabase/tests/run.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
MIG="$HERE/../migrations"
B="${LUMA_PGDIR:-/var/tmp/lumapg}"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PORT="${LUMA_PGPORT:-5433}"
AS_PG="${LUMA_PG_SU:-su postgres -c}"

rm -rf "$B"; mkdir -p "$B/data" "$B/run"
chown -R postgres:postgres "$B" 2>/dev/null || true

$AS_PG "PATH=\$PATH:$PGBIN initdb -D $B/data -U luma --auth=trust" >/dev/null
$AS_PG "PATH=\$PATH:$PGBIN pg_ctl -D $B/data -o \"-k $B/run -p $PORT -c listen_addresses=''\" -l $B/pg.log start" >/dev/null
sleep 3
trap '$AS_PG "PATH=\$PATH:$PGBIN pg_ctl -D $B/data stop" >/dev/null 2>&1 || true' EXIT

# الحد الأدنى من بيئة Supabase (auth.users و auth.uid والأدوار)
cat > "$B/stub.sql" <<'SQL'
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text unique,
  created_at timestamptz not null default now());
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create role authenticated; create role anon; create role service_role;
SQL

PSQL="psql -h $B/run -p $PORT -U luma -d postgres -v ON_ERROR_STOP=1 -q"
$AS_PG "$PSQL -f $B/stub.sql" >/dev/null
for f in 0001_hr_schema 0002_hr_logic 0003_hr_upgrade 0004_public_pages; do
  $AS_PG "$PSQL -f $MIG/$f.sql" >/dev/null && echo "  ✓ هجرة $f"
done
echo
$AS_PG "psql -h $B/run -p $PORT -U luma -d postgres -q -f $HERE/schema_test.sql" 2>&1 \
  | grep -vE "^INSERT|^CREATE|^SET|^GRANT|^DO$|^$"
