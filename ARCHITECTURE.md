# LUMA — Architecture

## Starting point and what changed
The repository contained a static HTML/JS prototype (Vercel static site) whose
entire state lived in `localStorage` (`LumaStore`, `LumaEvents`, `luma_role`, ~60
`luma_*` keys), plus an unconnected Supabase HR module (`luma-hr/`). Nothing was
multi-user, roles were chosen from cards on `login.html`, and storefront design was
duplicated across `luma_site`, `luma_page_cfg` and `luma_svc_meta`.

Decisions:
- **Kept**: the LUMA marketing site and identity (`public/`, served unchanged; `/` still
  renders `public/index.html`), the brand tokens (Eclipse/Aura palettes, Bodoni Moda /
  IBM Plex Sans Arabic), the SVG icon set (ported into `src/components/Icon.tsx`).
- **Moved**: the prototype pages into `public/` (URLs preserved) and gated them behind
  `LUMA_LEGACY_PROTOTYPE=1` (dev only); in production their app pages redirect to the real
  equivalents (`src/middleware.ts`). `luma-hr/` → `legacy/luma-hr/` as reference (its
  ideas — exclusion constraints, leave guards — were re-implemented in the new schema).
- **New**: a Next.js 15 (App Router, TypeScript) application over PostgreSQL 16.
  Hosting stays Vercel-compatible (Next.js on the same project); no hosting migration
  was performed. Automatic preview deployments are disabled for the review branch.

## Runtime topology
```
Browser ──HTTPS──► Next.js (server components + /api/v1 route handlers)
                      │  src/server/** (domain services, no UI)
                      ├─► PostgreSQL (app role = NOT owner → RLS enforced)
                      ├─► Object storage adapter (local driver; S3-compatible later)
                      └─► Provider adapters (payments, messaging, AI) — server-side only
Worker (scripts/worker.ts) ─► jobs (FOR UPDATE SKIP LOCKED), outbox, maintenance
```
Supabase was considered (the prototype planned it) but not provisioned: no keys
existed, and a self-contained Postgres + own auth is fully testable offline. The schema
is plain PostgreSQL and portable to Supabase Postgres; auth could be swapped for
Supabase Auth by replacing `src/server/auth/service.ts` (documented trade-off).

## Module boundaries (`src/server`)
| Module | Responsibility |
|---|---|
| `db.ts` | connection pool; `withTenant` / `withUser` / `withSystem` transaction scopes |
| `auth/` | registration, verification codes, sessions, lockout, recovery, step-up |
| `tenancy/` | capability catalog, membership → context, support grants, plan entitlements, nav |
| `http/` | API wrapper (origin check, validation, idempotency, rate limits, error mapping), page guards |
| `services/` | catalog, team/HR, tenants, assets, notifications, loyalty & growth |
| `booking/` | availability engine (pure planner + data layer), holds, lifecycle, terms, completion |
| `payments/` | provider adapters, checkout, webhooks, refunds, reconciliation |
| `commerce/` | carts, orders, stock reservations, inventory |
| `finance/` | double-entry journal, reports, invoices |
| `storefront/` | drafts, publishing, previews, public loading |
| `policy/`, `platform/` | incidents, decisions, appeals; LUMA administration |
| `ai/`, `marketing/`, `analytics/` | provider adapter, Loom Marketing, metrics, trends, campaigns |

Presentation components never contain booking, payment or AI logic; they call
`/api/v1/**` (client) or services (server components) through the same guards.

## Security model (summary — see PERMISSIONS.md)
1. **Session → membership → capabilities.** Tenant scope is derived from the session and
   an active membership; URL slugs only *select* among the caller's tenants. Unknown and
   unauthorized tenants are both 404.
2. **RLS** on every tenant table keyed on `app.tenant_id` set per transaction; the app role
   cannot bypass it. `withSystem` is used only by named internal paths (auth, webhooks,
   job dispatch, media lookup by opaque id, cross-tenant maintenance).
3. **Composite foreign keys** `(tenant_id, x_id)` make cross-tenant references impossible.
4. **Append-only ledgers** (audit, stock, finance, points, gift cards, booking events,
   commissions, versions): the app role has no UPDATE/DELETE grant.
5. **Constraints as guarantees**: EXCLUDE constraints for double booking and overlapping
   leave; CHECKs for stock, balances, deposits ≤ totals; unique indexes for exactly-once.
6. CSRF: SameSite=Lax session cookie + Origin check (or explicit header) on unsafe methods.
   CSP without third-party scripts; uploads re-encoded; rich text sanitized; URLs allowlisted.

## Key trade-offs
- **Own job queue in Postgres** instead of Redis: volume is modest, transactions with the
  business change are valuable (outbox), and one fewer service to operate.
- **Holds as bookings + expiring allocations** rather than a separate holds table: the same
  exclusion constraint protects holds and confirmed allocations; expired holds are swept
  inside the allocating transaction.
- **Storefront design as one versioned JSON document** (brand / appearance / layout)
  validated by zod and a block registry; transactional entities stay relational.
- **CSP allows `'unsafe-inline'` scripts** for Next.js bootstrap (no nonce pipeline yet);
  user content can never inject scripts because nothing user-provided is rendered as HTML
  except sanitized rich text.
- **PDF invoices**: pdfkit; Arabic shaping is limited without a bundled Arabic font
  (see known limitations in IMPLEMENTATION_STATUS.md).

## Environments
`development` (dev outbox, demo sign-in, sandbox payments allowed), `test` (vitest with a
rebuilt `luma_test` DB), `production` (all dev conveniences refused at startup by
`src/server/env.ts`). Seed data is synthetic and flagged `is_demo`.
