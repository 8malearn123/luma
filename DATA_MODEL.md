# Data model

Migrations: `db/migrations/*.sql` (forward-only, checksummed; run with `npm run db:migrate`).
Full generated table/column/constraint reference: [`docs/DATA_MODEL_REFERENCE.md`](docs/DATA_MODEL_REFERENCE.md)
(`npm run docs:data-model`). Demo data: `npm run db:seed` (synthetic, `is_demo`).

## Conventions
- UUID primary keys; `created_at`/`updated_at` timestamptz; actors recorded where meaningful.
- **Every business-owned row has `tenant_id`** and `UNIQUE (tenant_id, id)`; children use
  composite FKs `(tenant_id, parent_id) → parent(tenant_id, id)` so a row can never reference
  another tenant's entity (tested).
- **RLS** forced on every tenant table: `tenant_id = app.tenant_id()` (set per transaction);
  customer self-read policies (`customer_user_id = app.user_id()`) on bookings, orders,
  waitlist, loyalty accounts, memberships, tenant_customers.
- **Money**: `bigint` minor units (halalas) + `char(3)` currency. **Time**: `timestamptz`;
  wall-clock schedules are `time` interpreted in the branch/tenant timezone (default Asia/Riyadh).
- **History is never erased**: soft archive (`status = 'archived'`) for catalog/people;
  financial/stock/points/gift-card/booking-event/commission/version/audit tables are
  append-only (no UPDATE/DELETE grant for the app role). Corrections are new entries.
- **Snapshots** at transaction time: booking items keep service/staff names, price, add-ons,
  duration and buffers; bookings keep the payment terms + policy used (`terms_snapshot`);
  order items keep unit price/cost; invoices keep seller/buyer snapshots. Old documents are
  never rebuilt from the live catalog.
- JSON is used only for defined design/metadata documents (storefront document, terms
  snapshot, AI outputs, recommendation content) — never as a replacement for relational
  invariants.

## Groups
| Area | Tables |
|---|---|
| Identity & sessions | users, sessions, verification_codes, dev_outbox_messages (dev only), rate_limit_buckets |
| Platform | platform_staff, support_access_grants, plans, plan_features, subscriptions, subscription_events, usage_counters, platform_invoices, templates (tenant_id null) |
| Tenancy & RBAC | tenants, branches, roles, permissions, role_permissions (synced from code), tenant_memberships (granted/revoked caps), invitations |
| Customers | customer_profiles (central), tenant_customers (per-business relationship + private notes), customer_consents, suppression_list, customer_preferences |
| Catalog & people | categories, services, service_variants, service_addons, service_staff, service_price_rules, service_price_changes, packages, package_items, staff_profiles (login optional), staff_branch_assignments, resource_types, resources, service_resource_requirements |
| Schedules & HR | working_hours, shift_overrides, breaks, leave_requests (EXCLUDE overlap), blocked_times, attendance_events, staff_requests, commission_rules, commission_entries |
| Booking | bookings, booking_items, booking_allocations (EXCLUDE overlap per staff/resource), booking_events, group_sessions, group_session_bookings, waitlist_entries, waitlist_offers (one live offer per slot), reviews (one per completed booking), tenant_counters |
| Commerce | products, product_variants, product_images, inventory_items (CHECK reserved ≤ on_hand, on_hand ≥ 0), stock_movements, stock_reservations, unit_conversions, service_material_recipes, carts, cart_items, orders, order_items, fulfillments, returns |
| Payments & finance | payment_accounts (encrypted secrets), payments, payment_attempts, refunds, provider_events (dedup), payouts, reconciliation_runs, financial_entries (balanced per txn via deferred trigger), expenses, invoices, invoice_items, finance_settings |
| Storefront | tenant_profiles, booking_policies, storefront_drafts (versioned document), page_versions (immutable), preview_tokens, domain_mappings, onboarding_sessions, assets |
| Policy | customer_incidents (no duplicate per booking/type), incident_evidence (retention date), incident_reviews, policy_rules (experimental, disabled by default), policy_decisions (scope, expiry, supersedes), appeals |
| Loyalty & growth | loyalty_rules, loyalty_rewards, loyalty_accounts (balance cache ≥ 0), points_entries, coupons, reward_redemptions, gift_cards (hash + last4 only), gift_card_entries, membership_plans, memberships, membership_entitlements (reserved+consumed ≤ total), entitlement_reservations |
| Analytics, AI & marketing | analytics_events (dedup by event_id), daily_metrics, metric_snapshots, marketing_preferences, marketing_plans, plan_versions (immutable), plan_comments, recommendations, campaign_segments, campaigns, campaign_recipients, campaign_events, trend_sources, trend_observations, trend_assessments, prompt_versions, ai_runs, ai_usage, customization_requests |
| Infrastructure | audit_logs, outbox_events, job_runs, idempotency_records, notifications, notification_deliveries |

## Legacy data
The localStorage prototype is not production data. Storefront settings can be imported into a
**draft** through the owner-triggered legacy import (precedence documented in BUILDER_SCHEMA.md);
nothing is migrated automatically and the old keys are left untouched in the browser.
