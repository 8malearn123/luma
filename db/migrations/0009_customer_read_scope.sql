-- ═══════════════════════════════════════════════════════════════════════════
-- LUMA 0009 — tighten customer self-read.
-- Permissive policies are OR-ed: inside a tenant scope, `customer_user_id =
-- app.user_id()` also exposed the same customer's rows at OTHER tenants.
-- Self-read now applies only in the customer's cross-tenant scope (withUser:
-- no app.tenant_id pinned). Inside a tenant scope only tenant_isolation applies.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function app.enable_customer_read(tbl regclass)
returns void language plpgsql as $$
begin
  execute format('drop policy if exists customer_self_read on %s', tbl);
  execute format($p$create policy customer_self_read on %s for select
    using (app.tenant_id() is null and customer_user_id is not null and customer_user_id = app.user_id())$p$, tbl);
end $$;

do $$
declare r record;
begin
  for r in select schemaname, tablename from pg_policies where policyname = 'customer_self_read' and schemaname = 'public' loop
    perform app.enable_customer_read(format('%I.%I', r.schemaname, r.tablename)::regclass);
  end loop;
end $$;
