-- ═══════════════════════════════════════════════════════════════════════════
-- LUMA 0501 — policy: customer self-read on incidents about her, seeded
-- experimental platform rules (DISABLED; they only ever suggest a review).
-- ═══════════════════════════════════════════════════════════════════════════
select app.enable_customer_read('customer_incidents');

insert into policy_rules (tenant_id, scope, name, incident_type, min_confirmed_incidents, window_days, min_distinct_tenants, suggested_action, is_experimental, enabled)
values
  (null, 'platform', 'EXPERIMENTAL — repeated confirmed no-shows across businesses', 'no_show', 3, 180, 2, 'require_deposit', true, false),
  (null, 'platform', 'EXPERIMENTAL — repeated confirmed late cancellations', 'late_cancellation', 4, 180, 2, 'require_deposit', true, false);
