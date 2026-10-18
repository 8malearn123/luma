# LUMA permissions

Source of truth: `src/server/tenancy/capabilities.ts` (synced into `permissions` /
`role_permissions` by the migration runner). Effective capabilities of a membership:

```
ROLE_DEFAULTS[role] ∪ (granted_caps ∩ delegable-to-role) − revoked_caps
```

"If delegated" cells below are capabilities absent by default that the owner (or a
member holding `team.manage` **and** the capability herself) may grant to the listed
roles only. Ownership-level capabilities can never be delegated or revoked from the owner.

## Matrix (spec §05 → capability keys)

| Operation | LUMA owner | Business owner | Manager | Receptionist | Specialist | Finance | Customer |
|---|---|---|---|---|---|---|---|
| Configure plans/subscriptions | `platform.plans.manage` | `subscription.manage` (own) | `subscription.manage` if delegated | — | — | `subscription.view` if delegated | — |
| Customize/publish storefront | templates (`platform.templates.manage`); audited support grant (write) | `storefront.edit`, `storefront.publish` | if delegated | `storefront.edit` if delegated | — | — | — |
| Edit service/employee | audited support grant | `catalog.manage`, `staff.manage` | if delegated | `catalog.manage` if delegated | `staff.self_profile` (bio, photo, English name of own profile only) | — | — |
| Manage bookings | audited support grant | `bookings.manage` | `bookings.manage` | `bookings.manage` | `bookings.view_assigned` (bookings with an item assigned to her staff profile) | `bookings.view_financial` (read-only, no customer names/notes) | own bookings only (`/account`, `customer_user_id`) |
| View costs/profit | `platform.revenue.view` (LUMA revenue only) / support grant has no finance caps | `finance.view` | if delegated | **never** (not delegable to receptionist) | — | `finance.view` | — |
| Change platform-wide payment eligibility | `platform.policy.review` (policy reviewer) | — | — | — | — | — | — |
| Submit incident | n/a | `incidents.submit` | if delegated | if delegated | if delegated | — | own complaint/appeal |
| Approve campaign | n/a | `campaign.approve` | if delegated | — | — | — | — |

Additional business capabilities: `tenant.settings.manage`, `team.manage` (managers if
delegated; can never create managers/owners or grant capabilities they do not hold),
`audit.view`, `catalog.price.approve`, `schedule.manage|self`, `hr.manage|self`,
`customers.view|notes`, `waitlist.manage`, `reviews.respond`, `orders.manage`,
`inventory.manage`, `payments.collect` (on-site collection with method + reference),
`payments.configure`, `refunds.issue` (+ step-up), `finance.export` (+ step-up, audited),
`expenses.manage`, `marketing.view|manage`, `loyalty.manage`, `analytics.view`,
`incidents.review`, `ownership.transfer` (owner only).

LUMA platform roles (least privilege, `PLATFORM_ROLE_CAPS`): `platform_owner` (all),
`support_admin` (tenants view, support access, audit), `policy_reviewer`
(policy review only), `tech_admin` (integrations, AI usage, tenant list).

## Enforcement layers

1. **API capability checks** — every route uses `api.tenant(cap, …)` /
   `api.platform(cap, …)`; the server derives the tenant from the session + an
   active membership (or an active, reasoned, time-limited support grant). A slug or
   id in the URL only selects; unknown and unauthorized tenants are both 404.
   Field-level rules live in services (e.g. cost fields stripped without
   `finance.view`, private notes without `customers.notes`, specialist booking scope).
2. **Row-level security** — the app connects as a non-owner role; every tenant table
   has a `tenant_isolation` policy on `app.tenant_id` (set per transaction). Tables with
   a `customer_self_read` policy (bookings, orders, tenant_customers, memberships,
   loyalty accounts, waitlist) also expose the caller's OWN rows across tenants, so staff
   queries on them add an explicit `tenant_id = app.tenant_id()` filter (see
   `src/server/dashboard/*` and `assertBookingInTenant`).
3. **Composite foreign keys** `(tenant_id, x_id)` — a row can never reference another
   tenant's entity even if application code is wrong (23503 → 422).
4. **Append-only grants** — the app role has no UPDATE/DELETE on audit logs, stock
   movements, financial entries, points/gift-card ledgers, booking/subscription events,
   attendance, commissions, incident reviews, page/plan versions, campaign events.
   The capability catalog tables are read-only for the app role.
5. **Support access** — LUMA staff reach tenant data only via `support_access_grants`
   (reason ≥ 10 chars, ≤ 24 h, read or write level); read grants block all unsafe
   methods; every action is audited with `actor_kind = 'support'`. No silent impersonation.
6. **Step-up** — refunds, manual refund completion and exports require a password
   re-entry within 15 minutes (`requireRecentStepUp`).
7. **Demo** — role-switching (demo sign-in) only with `LUMA_DEMO_MODE=1` outside
   production and only for `is_demo` users.

## Tests

- `tests/integration/isolation.test.ts` — RLS cross-tenant reads/writes, composite FKs,
  append-only grants, non-member → 404, capability defaults & delegation limits.
- `tests/integration/dashboard.test.ts` — at the real route handlers: receptionist 403 on
  costs/profit and finance 200; cost fields hidden without `finance.view`; specialist sees
  only assigned bookings; finance view hides customer names; foreign tenant ids/slugs → 404;
  staff booking with another tenant's customer → 422; dual-role user (staff at B, customer
  at A) cannot reach her A booking through B's API; receptionist cannot invite; manager
  cannot invite owner/manager or delegate non-delegable / unheld caps; invitation
  single-use, bound to the invited contact, expiry enforced; refund requires step-up.
- `tests/integration/booking.test.ts` — specialist cannot act on unassigned bookings;
  customer cannot check herself in.
