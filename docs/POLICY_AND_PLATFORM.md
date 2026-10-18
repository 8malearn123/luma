# Policy, eligibility & LUMA platform administration

## 1. Platform administration (`/platform`)

| Role | Capabilities |
|---|---|
| `platform_owner` | everything below + grant/revoke platform roles, suspend payment accounts (`platform.policy.suspend`) |
| `support_admin` | view tenants, create **own** time-limited support grants, platform audit |
| `policy_reviewer` | review queue, platform-scope decisions (not suspension), rules, platform appeals |
| `tech_admin` | integrations status, AI usage/cost, tenant list (read) |

Enforcement: `api.platform(cap, …)` resolves `platform_staff` for the session; pages use
`requirePlatform()` + `canPlatform()`; every service function re-checks its capability.
Non-staff get **404** (no disclosure that the area exists). Cross-tenant reads run in the
system DB scope only after that check (`src/server/platform/service.ts`).

- **Roles are never self-granted.** Only `platform_owner` can grant (to *verified* accounts),
  with recent step-up. Public registration, tenant roles, localStorage or demo cards never
  create `platform_staff` rows. A platform owner cannot revoke her own role.
- **Tenants**: list/detail (status, plan, trial, live subscription, usage vs limits,
  subscription events, support grants). Suspend/reactivate requires a ≥10-char reason +
  step-up; audited as `platform.tenant_suspended|active`.
- **Plans** (Sanaa/Wahaj/Fareed, editable feature matrix): prices are nullable — `NULL`
  means *not configured* and `/pricing` shows "price not yet published". Any entered price
  must be flagged `price_is_test` until approved; it is shown with a "test price" label.
  Trial days default to 14 (configurable per plan), grace days to 7.
- **Subscriptions**: transitions `trialing→active|expired|cancelled`,
  `active→past_due|paused|cancelled`, `past_due→active|expired|cancelled`,
  `paused→active|cancelled`. Entering `past_due` sets `grace_until = now + grace_days`.
  Plan changes compute overage (branches/staff/services): `overage_state='over_limit'`,
  **no data is deleted**; plan-limit checks (`requireBelowLimit`) block only new creation.
  Each change writes `subscription_events` + audit. Customer payments to salons are
  unaffected by LUMA subscription state except that public booking requires a live
  subscription.
- **Support access**: `support_access_grants` (≤24h by DB CHECK, reason ≥10 chars,
  read/write). The tenant owner is notified, the dashboard shows a support banner, read
  grants reject unsafe methods, and every action is audited with `actor_kind='support'`.
  There is no silent impersonation: support acts as herself with a scoped capability set
  (`SUPPORT_READ_CAPS` / `SUPPORT_WRITE_CAPS`, which exclude costs/finance).
- **Templates**: LUMA-approved storefront templates (`tenant_id IS NULL`) validated
  against the storefront `documentSchema`.
- **Integrations**: honest states — `live` (only when a real invocation succeeded / live
  account exists), `sandbox`, `mock` (dev outbox), `disconnected`. WhatsApp, Moyasar
  (untested adapter) and trend sources currently report `disconnected`.
- **AI usage**: per-tenant runs/tokens; cost shows "unknown" when no documented price is
  configured. **Revenue**: `platform_invoices` only (test-labeled), never salon sales.
- **Audit**: platform-wide viewer with action-prefix / actor filters and keyset paging.

Gap: admin MFA is not available (no TOTP/WebAuthn provider yet). Sensitive actions
require step-up re-authentication (`requireRecentStepUp`, 15 minutes).

## 2. Incidents

`customer_incidents` (+ `incident_evidence`, `incident_reviews`), tenant API under
`/api/v1/t/:tenant/incidents`, UI `/app/:tenant/incidents`.

- Must reference a **real booking of this tenant** (RLS makes others' bookings invisible).
- `no_show` only when the booking is `no_show`, or `confirmed` and now ≥ start + grace
  (grace from the booking's terms snapshot). `late_cancellation` only for customer
  cancellations. Specialists (if delegated `incidents.submit`) only for their own bookings.
- One active report per (booking, type) — unique index; a rejected report may be re-filed.
- Evidence: notes, booking event ids of that booking, or assets uploaded with purpose
  `evidence` (private media). Each has `retain_until` (default 2 years).
- Review flow (`incidents.review`): `submitted → under_review | confirmed | rejected`,
  `under_review → confirmed | rejected`, `confirmed|rejected → corrected`; every step is an
  `incident_reviews` row with a note. A business may *request* LUMA review; it can never
  decide platform scope.
- Tenants never see other tenants' incidents. Customers see incidents about them (type,
  date, status, business) — never descriptions, internal notes, staff or other customers.

## 3. Payment-eligibility decisions

`policy_decisions`: customer, scope (tenant|platform), action, reason code, internal reason,
customer explanation, evidence incident ids, reviewer + role, effective/expires/review
dates, `supersedes_id`, status (`active|superseded|revoked|expired`).

- **Tenant scope** (`incidents.review`, step-up): affects only that business; customer must
  have a relationship with it (no LUMA-wide lookup); evidence must be confirmed incidents of
  that customer; expiry and review date required. A new decision supersedes the previous one.
- **Platform scope** (policy reviewer, step-up): requires ≥1 confirmed incident as evidence.
  `suspend_account` is exceptional and needs `platform.policy.suspend` (platform owner).
- The booking terms algorithm (`src/server/booking/terms.ts`) reads only `active`,
  effective, unexpired decisions; the strictest of tenant+platform wins. Other businesses
  only ever receive the computed terms and a generic explanation key.
- **Rules** (`policy_rules`, platform): thresholds are configuration. The two seeded rules
  are labeled EXPERIMENTAL and **disabled**. `suggestForCustomer` returns suggestions for a
  human reviewer; nothing ever creates or changes a decision automatically, so one report
  (or many) cannot change platform eligibility on its own.
- Job `policy.expire_decisions` (hourly, system scope): expires decisions past `expires_at`
  (customer notified) and notifies the business when `review_at` is due.

## 4. Appeals

Customer page `/account/appeals` (API `/api/v1/appeals`): own decisions with the customer
explanation, scope (business name or "across LUMA"), expiry; incidents about her; submit an
appeal (one open per decision — unique index; one open per incident). Resolution:
tenant-scope by the business (`incidents.review`), platform-scope by policy reviewers.
`overturned` revokes the decision and moves its evidence incidents (and the appealed
incident) to `corrected` with a review entry; terms return to default immediately.
`upheld` keeps the decision. The customer is notified either way. Cross-tenant resolution
attempts return 404.

## 5. Public pages
- `/pricing`: active plans from the DB; feature matrix rendered from `plan_features`;
  unconfigured price → "not yet published"; test prices labeled.
- `/discover`: active, non-demo tenants with a **published** storefront; filters city /
  type / service-or-name search; counts computed from data; only allowlisted public fields.

## 6. Tests
`tests/integration/policy.test.ts`, `tests/integration/platform.test.ts` (15 cases): owner
cannot reach platform APIs or self-grant; least privilege per role; integrations not
falsely "live"; suspension audited; support grant expiry/revocation stops access and is
audited; downgrade keeps data, marks over-limit, blocks new creation; subscription
transition table + grace; unconfigured prices stay NULL; incident eligibility and
duplicates; review flow + cross-tenant invisibility; one report ≠ platform change; rules
only suggest; tenant decisions are tenant-only and expire via job; appeal overturn revokes
and restores default terms; foreign appeals/decisions rejected; suspension needs owner;
directory lists only published tenants with allowlisted fields.
