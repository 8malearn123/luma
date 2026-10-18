# Parallel work contract (internal engineering notes)

Several workstreams are implemented in parallel in this working tree. Each owns
specific paths. Do not edit files outside your ownership except where listed as
"additive". Never run `git` write commands, `next build` or `next dev` (shared
`.next/`); the integrator builds, runs E2E and commits.

## Shared conventions (already established — reuse, don't reinvent)
- Server: `src/server/db.ts` (`withTenant`, `withUser`, `withSystem`), `errors.ts` (`AppError`),
  `audit.ts`, `jobs.ts` (`enqueueJob`, `registerJob`, `emitOutbox`), `http/handler.ts`
  (`api.public|user|tenant|platform`, idempotency, validation), `http/page.ts`
  (`requireTenant`, `requireUser`, `requirePlatform`, `pageT`, `can`),
  `tenancy/{capabilities,context,plan,nav}.ts`, `services/notifications.ts`.
- Tenant API routes live under `src/app/api/v1/t/[tenant]/<domain>/…` and use
  `api.tenant(cap, fn)`; run DB work with `tx(c.t, db => …)` from `tenancy/context`.
- Unsafe methods: client must send `x-luma-request: 1` (done by `apiFetch`) and an
  `Idempotency-Key` for financial/booking/sensitive creation (`useSubmit` does it).
- Optimistic concurrency: send `expectedVersion` (or `If-Match`); return 409 `version_conflict`.
- UI: server components for pages; client components for forms. Use `luma.css` classes
  (`card`, `btn btn-gold|btn-ghost|btn-quiet|btn-sm`, `input`, `field`, `table`, `badge`,
  `alert`, `tabs`, `drawer`, `empty`, `skeleton`, `grid cols-*`, `row`, `stack`),
  `Icon` (`src/components/Icon.tsx`, add NO emoji icons), `Field`, `useSubmit`,
  `ErrorAlert`, `EmptyState`, `Drawer`, `useUnsavedGuard` (`components/ui/forms.tsx`),
  `useToast`, `useT`/`useLocale`. Every screen: loading/empty/error/permission-denied states.
- Money: integer minor units; format with `formatMoney`. Dates: `formatDateTime` with the
  tenant timezone and `tzLabel`. Never floats for money.
- i18n: put your keys in YOUR module file `src/lib/i18n/m/<module>.ts` as `[ar, en]` pairs,
  prefixed by module (e.g. `builder.publish`). Arabic first, RTL-safe.
- Jobs: register in `src/server/jobs-registry/<module>.ts` (import side-effects).
- Tests: `tests/integration/<module>*.test.ts` with fixtures from `tests/fixtures.ts`
  and `tests/booking-fixtures.ts`. Run ONLY your files against YOUR test database:
  `TEST_DATABASE_URL=postgres://luma_app:luma_dev_app@127.0.0.1:5432/luma_test_<x> TEST_MIGRATION_DATABASE_URL=postgres://luma_owner:luma_dev_owner@127.0.0.1:5432/luma_test_<x> npx vitest run tests/integration/<yourfile>`
- Schema changes: add a NEW migration in your numbered range (never edit existing ones):
  A 0101–0109, B 0201–0209, C1 0301–0309, C2 0401–0409, D 0501–0509, E 0601–0609, F 0701–0709.
- `npx tsc --noEmit` is project-wide; fix errors in your files, ignore others in progress.

## Storefront theming contract (A implements, B/F consume)
`src/app/s/[slug]/layout.tsx` (A) resolves the published document (or draft in preview)
and sets CSS variables on a wrapper `<div class="sf-root">`:
`--sf-bg --sf-surface --sf-text --sf-muted --sf-primary --sf-primary-text --sf-accent
--sf-border --sf-radius --sf-font-heading --sf-font-body --sf-gap`, plus `dir`/`lang`.
`src/app/s/storefront.css` (A) provides classes: `sf-container`, `sf-section`, `sf-h1`,
`sf-h2`, `sf-card`, `sf-btn`, `sf-btn-secondary`, `sf-input`, `sf-field`, `sf-badge`,
`sf-grid`, `sf-list`, `sf-muted`, `sf-alert`, `sf-steps`, `sf-slot` (+ `[aria-pressed=true]`).
Storefront pages never use LUMA dashboard colors. `loadPublicStorefront(slug, { previewToken? })`
in `src/server/storefront/public.ts` (A) returns `{ tenant, doc, profile, branches, policy, preview }`.
The storefront header always exposes a "Book" entry to `/s/<slug>/booking` regardless of blocks.

## Ownership
- **A — Builder & storefront**: `src/server/storefront/**`, `src/lib/builder/**` (additive),
  `src/components/builder/**`, `src/components/storefront/**`, `src/app/app/[tenant]/builder/**`,
  `src/app/s/[slug]/{layout.tsx,page.tsx,services/**,team/**,products/**,about,contact,policies,faq,pages/**}`,
  `src/app/s/storefront.css`, `src/app/preview/**`, `src/app/api/v1/t/[tenant]/storefront/**`,
  i18n `builder`, `storefront`.
- **B — Customer booking/checkout & account**: `src/app/s/[slug]/{booking,cart,checkout}/**`,
  `src/app/api/v1/s/**`, `src/app/api/v1/me/**`, `src/app/account/**` (except `account/appeals`,
  `account/waitlist`), `src/app/sandbox/**`, `src/app/api/v1/webhooks/**`, `src/components/booking/**`,
  `src/components/account/**`, i18n `booking`, `account`. Account layout nav must link to
  `/account/appeals` (D) and `/account/waitlist` (F).
- **C1 — Onboarding, catalog, team, staff portal**: `src/app/onboarding/**`, `src/app/api/v1/tenants/**`,
  `src/app/app/[tenant]/{services,team}/**`, `src/app/staff/**`, `src/app/api/v1/t/[tenant]/{onboarding,services,categories,packages,staff,schedules,leave,attendance,resources}/**`,
  `src/server/services/onboarding.ts`, `src/components/catalog/**`, `src/components/team/**`, i18n `ops`.
- **C2 — Business operations dashboard**: `src/app/app/[tenant]/{page.tsx,bookings,customers,products,orders,inventory,finance,settings,audit}/**`,
  `src/app/api/v1/t/[tenant]/{bookings,customers,products,orders,inventory,finance,payments,settings,members,invitations,audit,notifications}/**`,
  `src/app/api/v1/invitations/**`, `src/server/commerce/inventory.ts`, `src/server/finance/reports.ts`,
  `src/server/finance/invoices.ts`, `src/components/dashboard/**`, i18n `dashboard`.
- **D — Platform admin, plans, policy**: `src/app/platform/**`, `src/app/api/v1/platform/**`,
  `src/app/pricing/**`, `src/app/discover/**`, `src/app/app/[tenant]/incidents/**`,
  `src/app/api/v1/t/[tenant]/incidents/**`, `src/app/account/appeals/**`, `src/app/api/v1/appeals/**`,
  `src/server/policy/**`, `src/server/platform/**`, `src/components/platform/**`, i18n `platform`, `policy`.
- **E — Loom Marketing, AI, analytics, trends**: `src/server/ai/**`, `src/server/marketing/**`,
  `src/server/analytics/**`, `src/app/app/[tenant]/{marketing,analytics}/**`,
  `src/app/api/v1/t/[tenant]/{marketing,analytics,ai,campaigns,trends,customize}/**`,
  `src/app/api/v1/events/**`, `src/components/marketing/**`, i18n `marketing`.
  The customization assistant produces a patch applied through A's draft service
  (`src/server/storefront/drafts.ts` → `applyDraftPatch`); coordinate via that function only.
- **F — Growth**: `src/server/services/{giftcards,memberships,waitlist,groups,coupons}.ts`,
  `src/server/services/loyalty.ts` (extend), `src/app/app/[tenant]/{loyalty,gifts,memberships,waitlist}/**`,
  `src/app/api/v1/t/[tenant]/{loyalty,gifts,memberships,waitlist,groups,coupons}/**`,
  `src/app/account/waitlist/**`, `src/app/api/v1/s/[slug]/waitlist/**`, `src/components/growth/**`, i18n `growth`.

## Cross-workstream function contracts
- A exports from `src/server/storefront/drafts.ts`:
  `getDraft(tx) → { document, version, updatedAt }`,
  `applyDraftPatch(tx, ctx, transform: (doc: StorefrontDocument) => StorefrontDocument, expectedVersion: number, meta: { source: 'manual' | 'assistant'; note?: string }) → { version, document, issues }`
  (validates with `validateDocument` + tenant-scoped reference checks; 409 on version mismatch; never publishes).
- B exports from `src/server/booking/customer.ts`: `customerTenantRelationship(tx, tenantId, userId, displayName)` (wraps `ensureTenantCustomer`).
- D exports from `src/server/policy/service.ts`: decision/incident/appeal functions used by account & dashboard pages it owns.
- F exports from `src/server/services/coupons.ts`: `validateCoupon(tx, tenantId, code, { totalMinor, tenantCustomerId }) → { couponId, discountMinor }` (checkout integration is done by the integrator).
