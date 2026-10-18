# Test plan and results

## Suites
| Suite | Command | What it runs against | Latest result (2026-10-18) |
|---|---|---|---|
| Type-check | `npm run typecheck` | whole project | **0 errors** |
| Integration | `npm test` | real PostgreSQL 16; DB rebuilt from migrations each run; app role is non-owner so RLS is live | **172 passed / 0 failed** (20 files) |
| Production build | `npm run build` | Next.js 15.5 | **success** (~100 routes) |
| End-to-end | `npm run test:e2e` | Chromium via Playwright, production build in `review` deployment, freshly migrated + seeded `luma_e2e`, desktop (1280×860) **and** mobile (390×844, touch) | **20 passed / 0 failed** |
| Legacy static site | `npm run test:legacy` | preserved marketing/prototype pages in `public/` | **62 passed / 0 failed** |
| Page scan | manual Playwright scan of ~50 pages as 5 roles | client errors / hydration | **0 client errors** (after fixing the Hijri/Gregorian mismatch, see below) |

CI (`.github/workflows/tests.yml`) runs all of the above on every push to `claude/**` and PRs to `main`.

### Real defects found by these tests (and fixed)
- **Cross-tenant membership resolution** — a member of business B could open business A with B's role (permissive
  `member_self_read` RLS OR-ed with tenant scope + unfiltered lookup). Fixed in code and at the database (migration 0010);
  regression tests in `isolation.test.ts` and `dashboard.test.ts`.
- **Customer self-read across tenants** — inside business A's scope, a customer's rows at business B were visible.
  Fixed at the database (migration 0009) + tenant filters; regression test.
- **Support grants never resolved** (RLS hid them) — fixed; covered by `platform.test.ts`.
- **Calendar mismatch** — browsers format `ar-SA` in the Hijri calendar, Node in Gregorian: the same booking showed two
  different dates (and broke hydration). All formatting now pins `-u-ca-gregory`.
- **Sandbox payment redirect blocked by CSP** (`form-action 'self'` + absolute redirect to the bind host) — relative redirect.
- **Online-paid group bookings would auto-refund** (no per-booking allocation) — confirmation now checks the seat.
- **A later event could auto-apply a payment flagged `needs_review`** — now ignored until a human resolves it.

## Spec §38 acceptance tests → coverage

Legend: ✅ automated (file › test) · 🟡 partially automated / manual · ❌ not covered (reason)

### Identity and builder
| Requirement | Status | Where |
|---|---|---|
| Complete, save and resume all seven onboarding steps | ✅ | `onboarding.test.ts` › saves every step, resumes…; E2E `onboarding.e2e.ts` |
| Upload a logo / change colors and reopen the draft in another session | 🟡 | palette-from-logo acceptance in `onboarding.test.ts`; draft persistence + version conflict in `storefront.test.ts`; a browser upload is not in E2E |
| Drag an image, link it to a service, verify after publishing | 🟡 | block ops/DnD reorder in `builder-ops.test.ts`; action links + fallbacks in `storefront-render.test.ts`; publish in E2E `owner-builder.e2e.ts` (edits text, not an image drag) |
| Touch/keyboard reordering, undo/redo, hidden-section preview | 🟡 | keyboard nudge/move in `builder-ops.test.ts`; undo/redo exercised manually; hidden blocks excluded from public render (`storefront.test.ts`) |
| Reject invalid configuration or another tenant's target at publish | ✅ | `storefront.test.ts` › rejects javascript:/data:…; foreign refs rejected at save & publish |
| Drafts invisible until publication; rollback affects design only | ✅ | `storefront.test.ts` › drafts are invisible…, rollback restores design only; E2E `owner-builder.e2e.ts` |
| Concurrent draft edits → 409 or explicit resolution | ✅ | `storefront.test.ts` › stale version → 409; builder shows a conflict choice |

### Accounts and isolation
| Requirement | Status | Where |
|---|---|---|
| One customer books at two businesses; neither sees the other's records | ✅ | `customer.test.ts` › each business sees only its own booking; `isolation.test.ts` |
| Changing tenant_id/service_id/staff_id/order_id cannot bypass authorization | ✅ | `dashboard.test.ts` (foreign ids → 404), `isolation.test.ts` (RLS + composite FKs), `customer.test.ts` |
| Specialists see only assigned bookings; receptionists cannot access costs | ✅ | `dashboard.test.ts`, `booking.test.ts` › specialist sees only her bookings, `catalog.test.ts`; E2E roles |
| Direct API calls cannot bypass roles or plan limits | ✅ | `dashboard.test.ts` (real route handlers), `catalog.test.ts`/`team.test.ts` plan limits, `growth.test.ts` plan gating, E2E API calls |
| Demo role switching absent in production | ✅ | `env.ts` refuses demo/dev flags in production; demo route 404 when disabled; E2E legacy pages redirect |

### Booking
| Requirement | Status | Where |
|---|---|---|
| Unqualified employee, leave, break, buffer, end-of-shift, occupied resource | ✅ | `booking.test.ts` (first five tests) |
| Past time, notice, timezone, group capacity | ✅ | `booking.test.ts` › rejects past/off-grid, notice period; times asserted in Asia/Riyadh; `growth.test.ts` › group capacity |
| Two concurrent bookings for the same slot/resource: only one succeeds | ✅ | `booking.test.ts` › five concurrent holds → exactly one |
| Multi-service booking with different employees and disclosed gaps | ✅ | `booking.test.ts` › multi-service itinerary… |
| Hold expiry/release; rescheduling retains the original if replacement fails | ✅ | `booking.test.ts` › expired holds…, failed reschedule keeps original |
| Cancellation/no-show/completion respect guards and audit | ✅ | `booking.test.ts` › guards; `payments.test.ts` › booking-time cancellation terms |

### Payments and products
| Requirement | Status | Where |
|---|---|---|
| require_full prevents deposits even if manipulated | ✅ | `payments.test.ts`; E2E `customer-booking.e2e.ts` (Fatimah) |
| Negative/manipulated amounts, currency mismatch, wrong provider account | ✅ | `payments.test.ts` › amount mismatch / currency; on-site amount bounds; terms validation |
| Forged / duplicate / late / out-of-order webhooks | ✅ | `payments.test.ts` (four tests); `customer.test.ts` › garbage events |
| Payment success with application-update failure; success after hold expiry | ✅ / 🟡 | late success → refund (`payments.test.ts`); reconciliation job re-applies succeeded payments (`reconcilePayments`, exercised manually, not a dedicated test) |
| Partial/full refund dedup; cancelled never becomes refunded without evidence | ✅ | `payments.test.ts` › refunds…; `refund_pending` ≠ refunded asserted |
| One stock unit, two concurrent orders: no negative stock | ✅ | `payments.test.ts` › one unit, two concurrent checkouts |
| Failed payment releases stock; fulfillment does not deduct twice | ✅ | same + › collection deducts stock once |

### Policies
| Requirement | Status | Where |
|---|---|---|
| One report cannot change platform-wide eligibility | ✅ | `policy.test.ts` |
| Incident confirm/reject/correct, appeals, decision expiry and revision | ✅ | `policy.test.ts` (four tests) |
| A salon cannot grant itself policy-reviewer privileges | ✅ | `platform.test.ts` |
| No-show blocked before appointment + grace | ✅ | `booking.test.ts` › guards; `policy.test.ts` (incident eligibility) |

### AI and marketing
| Requirement | Status | Where |
|---|---|---|
| Missing key, quota, rate limit, timeout → honest states | ✅ | `ai.test.ts` |
| Prompt injection in external sources cannot change scope | ✅ | `marketing.test.ts`, `marketing-trends.test.ts` |
| Unsupported numeric claims rejected/labeled | ✅ | `marketing.test.ts` |
| Missing costs prevent profitability assertions | ✅ | `marketing.test.ts`, `dashboard.test.ts` ("costs incomplete") |
| New businesses receive data limitations | ✅ | `marketing.test.ts` |
| Regeneration creates a new version | ✅ | `marketing.test.ts` |
| Old/unavailable/duplicate trend sources not verified | ✅ | `marketing-trends.test.ts` |
| Tenant changes cannot reuse another tenant's cache/context | ✅ | `ai.test.ts` › cache is scoped per tenant |
| No campaign sending without approval and consent; opt-out enforced | ✅ | `marketing.test.ts` |

### User experience
| Requirement | Status | Where |
|---|---|---|
| End-to-end owner, customer, specialist and LUMA-owner journeys | ✅ | `tests/e2e/*.e2e.ts` |
| Mobile/desktop, RTL/LTR | ✅ | every E2E spec runs on both projects; `roles-isolation.e2e.ts` › language switch |
| Keyboard | 🟡 | builder keyboard ops unit-tested; skip link, focus styles, labeled fields; no automated full keyboard-only journey |
| Slow loading and network failures | 🟡 | explicit loading/error states and input preservation implemented (`apiFetch` network error, `useSubmit` keeps input); not simulated in E2E |
| Uploads, reauthentication, refresh, back navigation, form preservation | 🟡 | upload pipeline + step-up covered in integration tests; booking selections survive the sign-in redirect (E2E sign-in with `next`); refresh/back not automated |

### Not performed (and why)
- **Live AI calls** — no API key in this environment; the adapter is tested against the documented request shape with
  a test double. Status shows "not configured" / "configured, untested" honestly.
- **Live payment provider** — no Moyasar keys and no network access to it; sandbox only.
- **Real email/SMS/WhatsApp delivery** — no provider connected; deliveries are recorded as `simulated`.
- **Visual regression / screen-reader audits** — not automated; spot-checked visually via screenshots.
- **Backup restore drill** — no production environment exists yet (RUNBOOK.md).
- **Load / soak tests** — not run.
