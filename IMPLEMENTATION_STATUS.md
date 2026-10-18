# Implementation status

Branch `claude/luma-saas-platform` · private review build · last updated 2026-10-18.

Legend: **Done** = implemented with server enforcement and tests · **Partial** = works with stated gaps ·
**Not done** · **Blocked** = needs external access/approval. Integration states: *live & tested* · *sandbox* ·
*mock/simulated* · *disconnected*.

## Integration states (§41.5)
| Integration | State | Notes |
|---|---|---|
| PostgreSQL (RLS, constraints) | **live & tested** | local PG 16; no managed instance provisioned |
| Payments — sandbox provider | **sandbox** | simulated hosted checkout + HMAC-signed webhooks; refused in production |
| Payments — Moyasar | **disconnected (adapter untested)** | written against public docs (invoices, payments, refunds; webhook `secret_token`, re-fetch before applying). No keys/network here. Docs spell the failure event both `payment_faild` and `payment_failed` — verify with a live test webhook |
| Tabby / Tamara / mada / Apple Pay | **disconnected** | shown only when an active provider supports and the business enables them; none active |
| Email / SMS / WhatsApp | **disconnected** | dev outbox (labeled) in development/review; deliveries recorded `simulated` |
| AI (OpenAI Responses API, structured outputs) | **disconnected** | adapter + validation + budgets tested with a test double; status reads `not_configured` until key+model set, `configured_untested` until a real call succeeds |
| Trend sources (RSS/links) | **disconnected** by default | `TRENDS_FETCH_ENABLED=0`; SSRF-guarded fetcher tested |
| Object storage | **live (local driver)** | S3-compatible driver not written |
| Realtime | **not used** | notifications poll (30–60 s); documented |

## Requirements by section
| § | Requirement | Status | Where | Tests | Gaps / blockers |
|---|---|---|---|---|---|
| 01 | Real app, shared DB, real accounts, enforced permissions | Done | whole repo | all suites | — |
| 01 | Private first delivery; no real money/messages | Done | `env.ts` (`LUMA_DEPLOYMENT`), sandbox, dev outbox; Vercel auto-deploy disabled for the branch | E2E review mode | — |
| 02 | Inspect repo, migrate behavior, progress & decisions docs | Done | ARCHITECTURE.md, this file, docs/CONTRIBUTING_AGENTS.md | — | — |
| 03 | TS/Next.js, PostgreSQL, storage, jobs, shared validation, domain services, secrets server-side | Done | `src/server/**`, `scripts/worker.ts`, `src/lib/validation` | — | Supabase not used (no keys); S3 driver not written |
| 04A | LUMA admin: tenants, plans, templates, users/roles, incidents/appeals, integrations, AI usage, revenue, audit, audited support access | Done | `/platform`, `src/server/platform` | `platform.test.ts` | Admin MFA not available — step-up re-auth instead |
| 04B | Business roles with granular delegation | Done | `tenancy/capabilities.ts` | `isolation.test.ts`, `dashboard.test.ts` | Ownership transfer not implemented |
| 04C/D | Central customer account; visitor sees only public content | Done | `/account`, `/s/**`, `storefront/public.ts` | `customer.test.ts`, `storefront.test.ts` | — |
| 05 | Permissions matrix, enforced server-side + DB | Done | PERMISSIONS.md | `dashboard.test.ts`, `isolation.test.ts`, E2E | — |
| 06 | Registration + verification, recovery, sessions, rate limits, lockout | Done | `auth/service.ts` | `auth.test.ts`, E2E onboarding | No real SMS/email provider (Blocked: provider approval) |
| 06 | Dev OTP labeled & disabled in production; demo role cards disabled in production | Done | `/dev/outbox`, `server/demo.ts` | E2E | — |
| 06 | Multiple memberships; selector grants nothing; trusted business creation; invitations; staff without login | Done | `/app`, `services/tenants.ts`, invitations | `dashboard.test.ts`, `onboarding.test.ts` | — |
| 06 | Login during booking preserves selections, revalidates | Done | `BookingFlow.tsx` (sessionStorage + revalidation) | E2E (sign-in with `next`) | — |
| 07 | tenant_id everywhere, composite FKs, RLS, scoped jobs/caches/media/exports | Done | migrations 0001–0010 | `isolation.test.ts` (+ regressions for 3 defects found) | — |
| 08 | Routes (/, /pricing, /auth, /onboarding, /platform, /app, /staff, /s, /account, /discover, /preview) | Done | `src/app/**` | E2E + page scan | Legacy `.html` app pages redirect when the prototype is off |
| 09 | AR RTL + EN, SAR/date formatting, Asia/Riyadh, 12/24h display, loading/empty/error/denied states, idempotent submits, a11y, deep links, unsaved-changes guard, versions/ETags | Partial | `lib/format.ts`, `components/ui/forms.tsx`, i18n modules | E2E RTL/LTR | 12/24h preference not exposed as a user setting (display uses 12h); keyboard-only journeys not automated |
| 10 | Seven-step onboarding, save/resume/back/skip, logo palette with acceptance, deterministic draft, readiness checklist | Done | `/onboarding`, `services/onboarding.ts`, `lib/builder/defaults.ts` | `onboarding.test.ts`, E2E | Unique logo generation not implemented (optional) |
| 11 | LUMA identity vs storefront identity; single source of truth; legacy migration with precedence | Done | storefront document; `legacy-import.ts` | `storefront.test.ts` | — |
| 12 | Builder: library/canvas/properties, DnD + keyboard/touch, undo/redo, autosave, preview, publish, versions, nesting limits, display options, safe config, URL allowlist, ID references, fallbacks, image pipeline | Done | `components/builder/**`, `storefront/drafts.ts`, `services/assets.ts` | `storefront*.test.ts`, `builder-ops.test.ts`, E2E | Image cropping UI not implemented (images are re-encoded to fixed widths) |
| 13 | Generated & custom pages, categories hide/archive, atomic publish, private previews, audited rollback | Done | `storefront/publish.ts` | `storefront.test.ts` | Custom domains not enabled |
| 14 | NL customization assistant: structured, validated patch → draft, diff, accept/reject, never publishes | Done | `marketing/customize.ts` | `marketing-trends.test.ts` | Without AI a deterministic AR/EN parser is used (labeled) |
| 15 | Service catalog: variants, staff-specific price/duration, add-ons, packages, buffers, active vs visible, snapshots, price proposals | Done | `services/catalog.ts` | `catalog.test.ts`, `booking.test.ts` | — |
| 16 | Team/HR: profiles, schedules, breaks, leave, exceptions, attendance, portal, transfer/deactivate, commissions | Done | `services/team.ts`, `/staff` | `team.test.ts` | Commission correction after refund is a manual correction entry (no automatic reversal) |
| 17 | Availability algorithm, any-specialist rule, multi-service itineraries, conflict prevention (EXCLUDE), holds, idempotency, concurrency | Done | `booking/**`, BOOKING_ENGINE.md | `booking.test.ts` (5-way race) | — |
| 18 | Lifecycle transition table, guards, reschedule, cancellation terms, no deletion, notifications, receptionist bookings without enumeration | Done | `booking/service.ts` | `booking.test.ts`, `payments.test.ts`, `dashboard.test.ts` | Reschedule from the dashboard drops add-ons |
| 19 | Payments: subscription vs customer separation, full/deposit/on-site, hosted checkout only, server amounts, attempts/refunds, webhook verification/dedup/matching, late success, reconciliation, minor units | Done (sandbox) | `payments/**`, PAYMENT_FLOW.md | `payments.test.ts`, E2E | Live provider Blocked (keys/approval); LUMA subscription billing is records + test invoices only (no charging) |
| 20 | Central customer + tenant relationship; incidents; decisions; appeals; payment-options algorithm | Done | `policy/service.ts`, `booking/terms.ts` | `policy.test.ts`, `payments.test.ts`, E2E | Walk-ins without accounts can't receive decisions (by design) |
| 21 | Products, variants, stock ledger, reservations, orders, pickup, price re-check, readable numbers | Done | `commerce/orders.ts`, `commerce/inventory.ts` | `payments.test.ts` (stock race) | Delivery designed (`fulfillment_method`) but disabled; returns flow minimal |
| 22 | Retail vs materials, recipes, honest capacity estimate, exactly-once consumption | Done | `commerce/inventory.ts`, `booking/completion.ts` | `dashboard.test.ts` | — |
| 23 | Finance: separated figures, double-entry journal, cash with identity/reference, profit only with complete costs, invoices/exports, configurable tax | Partial | `finance/**` | `dashboard.test.ts` | PDF invoices: no Arabic shaping in pdfkit (layout bilingual, Arabic may render poorly); **not** ZATCA e-invoices; provider settlement reconciliation is a stub (no provider) |
| 24 | Loyalty ledger, coupons, gift cards, memberships/entitlements, group sessions, waitlist offers | Done | `services/{loyalty,coupons,giftcards,memberships,groups,waitlist}.ts` | `growth.test.ts`, `integration-benefits.test.ts` | Expired gift-card breakage not booked as income (accounting decision open); customers can't self-join group sessions from the storefront yet |
| 25 | Metrics first, occupancy definition, demand signals separate, employee indicators with sample sizes, no AI employment decisions | Done | `analytics/**` | `analytics.test.ts` | Complaints/rework data proxied by low ratings (labeled) |
| 26–28 | Loom Marketing: monthly/weekly plans, recommendations with full schema, versions/approval, trend radar | Done | `marketing/**`, `/app/<t>/marketing` | `marketing*.test.ts` | Seasonal/holiday recommendations need a verified calendar source (none connected) |
| 29 | Background AI pipeline: budgets, snapshots, structured output, validation, provenance, idempotent jobs, honest failures | Done (untested live) | `ai/**`, `marketing/pipeline.ts` | `ai.test.ts` | Blocked: API key |
| 30 | Trend radar: sourced only, SSRF protection, dedup/cluster, fit assessment | Done | `marketing/trends.ts`, `ssrf.ts` | `marketing-trends.test.ts` | Sources disconnected by default |
| 31 | Campaigns: segments, consent/opt-out/suppression/frequency/quiet hours, approval, simulated sending, attribution, holdouts | Done (simulated) | `marketing/campaigns.ts` | `marketing.test.ts` | Blocked: messaging provider |
| 32 | Store analytics events/definitions; notifications center + outbox + adapters | Partial | `analytics/events.ts`, Beacon, `services/notifications.ts`, `jobs.ts` | `analytics.test.ts` | Polling instead of Realtime; external channels simulated |
| 33 | Data model with migrations, constraints, indexes | Done | `db/migrations`, DATA_MODEL.md | migration runner in every test run | — |
| 34 | API contracts: schema, auth, scope, capability, errors, request_id, pagination, idempotency, correct methods | Done | `server/http/handler.ts`, `/api/v1/**` | route-level tests in `dashboard.test.ts` | No OpenAPI document generated |
| 35 | XSS/CSRF/IDOR/SQLi/SSRF protections, uploads, cookies, CSP, audit, observability, safe retries | Partial | handler origin check, parameterized SQL, sanitize-html, upload re-encoding, CSP | multiple | CSP allows `'unsafe-inline'` scripts (Next.js bootstrap, no nonce pipeline); admin MFA unavailable; structured logs only (no external error tracker); privacy deletion/correction workflow not implemented; backups/restore drill not performed (no prod env) |
| 36 | Plans Sanaa/Wahaj/Fareed, editable matrix, 14-day trial, test-labeled prices, server-side limits, downgrade without deletion, subscription states | Done | `/platform/plans`, `tenancy/plan.ts` | `platform.test.ts`, `catalog.test.ts` | Prices are **test values** (19900/39900/79900 halalas) — not approved; no subscription charging |
| 37 | Seed data (LUMA owner, Noura Salon, second business, all roles, customers incl. experimental decision, weeks of history, orders, missing costs, versions, incident, appeal, Example plan), unique passwords, fresh-business path | Done | `scripts/seed.ts` | E2E uses it | — |
| 38 | Acceptance tests | Partial | TEST_PLAN.md | see mapping | Gaps listed in TEST_PLAN.md |
| 40 | Repository deliverables | Done | README, ARCHITECTURE, DATA_MODEL, PERMISSIONS, BOOKING_ENGINE, PAYMENT_FLOW, BUILDER_SCHEMA, AI_AND_MARKETING, TEST_PLAN, this file, .env.example, RUNBOOK | — | — |

## What is needed from the business owner (decisions / access)
1. **Payment provider account** (e.g. Moyasar) + approval to test in its test mode → verify the adapter live.
2. **Messaging provider** (email/SMS/WhatsApp) → verification codes and notifications in production.
3. **AI**: API key and an approved model name; monthly AI budget per plan.
4. **Final prices, limits and trial length** for Sanaa / Wahaj / Fareed (current values are test placeholders).
5. **Policy thresholds** for platform-level customer decisions (seeded rules are experimental and disabled).
6. **Tax/e-invoicing**: legal entity, VAT registration and whether ZATCA e-invoicing integration is in scope.
7. **Hosting**: managed PostgreSQL (or Supabase) + object storage + a worker process; then the backup/restore drill.

## Next engineering steps
- Arabic-capable PDF rendering (bundle a shaped Arabic font or HTML-to-PDF).
- Nonce-based CSP; admin MFA (TOTP); privacy request workflow; error tracking.
- Realtime notifications (or SSE) instead of polling.
- Storefront group-session join, delivery fulfillment, returns UI, image cropping.
- Automated keyboard-only and network-failure E2E journeys.
