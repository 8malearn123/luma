# LUMA

منصة لوما للصوالين وخبيرات الجمال — SaaS متعدد المستأجرين: لكل نشاط مساحة عمل ومتجر وهوية خاصة، ولكل عميلة حساب مركزي واحد.

LUMA is a multi-tenant SaaS for salons, beauty businesses and independent experts: each business gets its own
workspace, data, storefront and brand; each customer has one central LUMA account for booking and buying across
businesses, while each business's records stay isolated.

> **Status: private review build.** No real money moves (sandbox payment provider), no real messages are sent
> (dev outbox, clearly labeled), AI is not connected without a key. See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md)
> for every requirement's status, location, tests and blockers.

## Quick start (development)

Requirements: Node ≥ 20.18 (22 recommended), PostgreSQL 16.

```bash
# 1. two roles: schema owner (migrations) and app role (NOT owner → row-level security is enforced)
psql -c "create role luma_owner login password '…' createdb;"
psql -c "create role luma_app login password '…';"
createdb -O luma_owner luma_dev
createdb -O luma_owner luma_test

# 2. environment
cp .env.example .env.local          # fill DATABASE_URL, MIGRATION_DATABASE_URL, SESSION_SECRET, LUMA_ENCRYPTION_KEY
# for a local demo also set: LUMA_DEV_OTP=1 LUMA_DEMO_MODE=1 PAYMENTS_SANDBOX_ENABLED=1

npm ci
npm run db:migrate                   # forward-only, checksummed migrations (db/migrations)
npm run db:seed                      # synthetic demo data; unique random passwords → storage/demo-credentials.json
npm run dev                          # http://localhost:3000
npm run worker                       # jobs, outbox, hold/order expiry, reconciliation, schedules
```

Do not put `NODE_ENV` in `.env.local` — Next.js manages it. Use `LUMA_DEPLOYMENT` instead (below).

## Where things are

| URL | What |
|---|---|
| `/` | Existing LUMA marketing site (`public/index.html`, preserved) |
| `/pricing` | Sanaa / Wahaj / Fareed from the plans table (unpublished prices are labeled; test prices flagged) |
| `/auth/login`, `/auth/register` | Real accounts: verification codes, lockout, recovery, sessions |
| `/onboarding` | Create a business (you become its owner) and the 7-step setup |
| `/app/<business>` | Membership-protected business dashboard (navigation filtered by role, capability and plan) |
| `/app/<business>/builder` | Drag-and-drop storefront builder (keyboard/touch alternatives, autosave, versions, publish) |
| `/staff` | Mobile staff portal: own schedule and bookings, clock in/out, leave |
| `/s/<slug>` | Published storefront (salon's own identity); `/s/<slug>/booking`, `/cart`, `/checkout` |
| `/account` | Central customer account: bookings & orders (delivery tracking, returns, invoices), addresses, consents, appeals, waitlist |
| `/app/<business>/orders/deliveries`, `/orders/returns` | Delivery board and returns queue |
| `/app/<business>/finance/invoices/<id>` | Printable Arabic tax invoice / credit note (QR; not ZATCA-connected) |
| `/app/<business>/messages`, `/integrations` | Templates & delivery log (simulated), honest status of payments/AI/messaging/e-invoicing/realtime |
| `/platform` | LUMA administration (platform staff only) |
| `/discover` | Directory of published businesses |
| `/dev/outbox` | DEV/REVIEW ONLY: messages that would have been sent (codes, notifications) |
| `/api/v1/**` | REST API (see ARCHITECTURE.md) · `/api/v1/health` |

## Roles

LUMA staff: platform owner, support admin (time-limited audited grants only — no impersonation), policy
reviewer, technical admin. Business: owner, manager, receptionist, specialist, finance, with owner-delegated
capabilities ("if delegated" cells of the matrix). Customers and visitors. Full matrix and enforcement:
[PERMISSIONS.md](PERMISSIONS.md).

## Demo vs production

`LUMA_DEPLOYMENT` = `development` | `review` | `production` (production builds default to `production`).

| | development / review | production |
|---|---|---|
| Verification codes | dev outbox (`LUMA_DEV_OTP=1`), labeled | real provider adapter required; otherwise an explicit "provider unavailable" error |
| Demo quick sign-in cards | `LUMA_DEMO_MODE=1`, only `is_demo` users | refused at startup |
| Legacy localStorage prototype pages | `LUMA_LEGACY_PROTOTYPE=1` | redirected to the real app |
| Payments | sandbox provider (`PAYMENTS_SANDBOX_ENABLED=1`) | real provider only (Moyasar adapter is **untested**) |
| Campaign sending | simulated, recorded as such | requires an approved messaging integration (none connected) |

The server refuses to start in `production` if any development convenience is enabled (`src/server/env.ts`).

Demo accounts (after `npm run db:seed`): LUMA platform owner / policy reviewer / support; Noura Salon owner,
manager, receptionist, two specialists, finance; customers (ordinary, experimental require-full decision, new);
Lamsa Studio (independent expert). Passwords are random per seed run and written only to
`storage/demo-credentials.json` (gitignored). To test the full journey from zero, register a new account and
go to `/onboarding`.

## Tests

```bash
npm run typecheck
npm test               # 170+ integration tests against a real PostgreSQL (rebuilt luma_test DB)
npm run build
npm run test:e2e       # Playwright, desktop + mobile, production build in review mode (rebuilds luma_e2e)
npm run test:legacy    # the preserved static marketing site suite
```

Results and coverage map: [TEST_PLAN.md](TEST_PLAN.md).

## Documentation

[ARCHITECTURE.md](ARCHITECTURE.md) · [DATA_MODEL.md](DATA_MODEL.md) ([generated reference](docs/DATA_MODEL_REFERENCE.md)) ·
[PERMISSIONS.md](PERMISSIONS.md) · [BOOKING_ENGINE.md](BOOKING_ENGINE.md) · [PAYMENT_FLOW.md](PAYMENT_FLOW.md) ·
[BUILDER_SCHEMA.md](BUILDER_SCHEMA.md) · [AI_AND_MARKETING.md](AI_AND_MARKETING.md) ·
[docs/POLICY_AND_PLATFORM.md](docs/POLICY_AND_PLATFORM.md) · [TEST_PLAN.md](TEST_PLAN.md) ·
[IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) · [RUNBOOK.md](RUNBOOK.md) · [.env.example](.env.example)

The previous static prototype's roadmap is kept for history in [ROADMAP.md](ROADMAP.md).
