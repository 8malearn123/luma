-- ═══════════════════════════════════════════════════════════════════════════
-- LUMA 0010 — tighten member self-read (same class of issue as 0009).
-- member_self_read let a signed-in member see her memberships in OTHER
-- tenants while a tenant scope was pinned; combined with an unfiltered
-- lookup this resolved a foreign membership. Self-read now applies only in
-- the cross-tenant (withUser) scope used by the business selector.
-- ═══════════════════════════════════════════════════════════════════════════
drop policy if exists member_self_read on tenant_memberships;
create policy member_self_read on tenant_memberships for select
  using (app.tenant_id() is null and user_id = app.user_id());
