# AI & Loom Marketing

Loom Marketing is a background adviser: it reads one business's own data,
proposes plans and recommendations, and the owner decides. Nothing is
published, priced or sent automatically. Everything works **without AI**
(rule-based); AI only refines wording and scheduling when it is configured,
within a strict validation boundary.

## Current integration state

| Integration | State | Notes |
|---|---|---|
| OpenAI (Responses API) | **Adapter ready, not live-verified** | Needs `AI_PROVIDER=openai`, `OPENAI_API_KEY`, `OPENAI_MODEL`. No model name is defaulted. The UI shows `not_configured` / `configured_untested` / `live_verified` (only after a real successful call is recorded in `ai_runs`). Tested against a mocked transport only. |
| Messaging for campaigns | **Disconnected** | Sends are *simulated* (`notification_deliveries.status = 'simulated'`) and refused when `isProduction()`. |
| Trend sources (RSS / links) | **Gated** | `TRENDS_FETCH_ENABLED=0` by default → sources report `disconnected`. Not fetched from this environment. |

## Module map

| Path | Responsibility |
|---|---|
| `src/server/ai/types.ts` | Provider contract, failure codes |
| `src/server/ai/openai.ts` | Responses API adapter: `text.format = { type: 'json_schema', strict: true }`, timeout + caller `AbortSignal`, ≤2 format retries, ≤2 transport retries with backoff (honours `retry-after`), `insufficient_quota` → `quota`, refusal detection |
| `src/server/ai/fake.ts`, `provider.ts` | Test double selectable **only** under `NODE_ENV=test`; provider selection; truthful `aiStatus`; cost from documented env prices or `null` |
| `src/server/ai/redact.ts` | Scrubs phones/emails/long numbers/key-like tokens; drops person-identifying keys; wraps untrusted content in `<untrusted>` blocks that cannot be closed from inside |
| `src/server/ai/prompts.ts` | Versioned prompts (`purpose@n`); sha256 recorded in `prompt_versions`; a changed prompt without a version bump refuses to run |
| `src/server/ai/run.ts` | Single entry point: plan feature `ai.monthly_runs` + monthly budget (`ai_usage`), tenant-scoped cache, `ai_runs` provenance (provider, model, prompt version, input hash, redacted summary, validation, tokens, cost) |
| `src/server/marketing/snapshot.ts` | Trusted metric snapshot (aggregates only) with `data_as_of`, hash and a flat `index` used for validation |
| `src/server/marketing/recommendations.ts` | Rule-based recommendations with the full §28 schema |
| `src/server/marketing/validate.ts` | Numeric-claim validation and the margin rule |
| `src/server/marketing/pipeline.ts` | §29 pipeline (snapshot → rules → optional AI → validate → save) |
| `src/server/marketing/plans.ts`, `analysis.ts` | Monthly/weekly plans, immutable versions, state machine, jobs |
| `src/server/marketing/trends.ts`, `ssrf.ts` | Trend radar and SSRF-safe fetcher |
| `src/server/marketing/campaigns.ts` | Segments, recipients, approval, simulated sending, attribution |
| `src/server/marketing/customize.ts` | Natural-language storefront customization |
| `src/server/analytics/*` | Events, store metrics, occupancy, staff indicators |

## Inputs (what a model may see)

From `buildSnapshot` only, after `redactData`: business type/city/timezone/locale,
branch count, service names/prices/durations/material costs (or unknown), demand
counts per service, ratings, service visit cadence, overdue-and-consenting
**counts**, occupancy by weekday, active/consenting customer **counts**, cost
completeness, loyalty state, owner preferences (goals, budget, max discount,
tone, avoided topics), past campaign aggregates. Never customer names, phones,
emails, ids or notes. Web/customer text goes only into `<untrusted>` blocks; the
system prompt states such content is data and cannot change task, scope,
permissions or format. Each prompt runs inside the tenant's RLS transaction, and
two businesses' data are never combined in one request.

## Recommendation schema (stored in `recommendations.content`)

`title, category, horizon, period, evidence_refs[], measured_metrics{key→value},
opportunity, suggested_action, target_segment_id, target_segment_hint, timing,
estimated_cost{amountMinor|null, assumptions}, capacity_check{status, freeMinutes, note},
margin_check{status ok|negative|unknown, note}, draft_content{channel,text}|null,
channel, prerequisites[], success_metric, experiment_design, confidence,
limitations[], proposed_target (a goal, not a promise), forecast = null,
data_as_of, review_at, expires_at, provenance{source_type rules|ai|example, provider, model, prompt_version, snapshot_hash}`.
Text fields are bilingual `{ar, en}`.

Rules implemented (no AI needed): quiet weekdays (occupancy < 40 % with ≥ 120
free minutes — full times are never promoted), reactivation by **service-specific
cadence** (median gap between a customer's consecutive visits, ≥ 5 samples;
overdue = > 1.5× cadence and consenting), well-rated services with weak demand and
spare capacity, unmet demand at high occupancy → pricing/capacity *review*
(never an automatic price change; staffing options first), packages only when
material costs are known for both services (else a "complete your costs"
recommendation), loyalty instead of permanent discounts, booking-funnel review.

## Validation (§29 step 5)

* Every number in claim fields (title, opportunity) must match a snapshot value
  (as-is, as a percentage of a ratio, or as SAR of a minor amount) or a declared
  methodology constant (7/14/30/60/90 days, 1.5× cadence).
* Every `measured_metrics` entry must exist in the snapshot index with the same value.
* Failing AI items keep the rule wording and are stored with
  `validation.flagged = true` (shown in the UI as "unsupported numbers").
* Margin rule: with unknown costs, `margin_check` is forced to `unknown`
  ("profitability cannot be asserted").
* AI output may drop candidates but cannot add new ones (unknown indexes are ignored).

## Plans

* Content lives in immutable `plan_versions` (DB trigger blocks updates).
* States: `draft → proposed → under_review → approved → in_progress → completed`,
  with `deferred`/`rejected`. Approval needs `campaign.approve`.
* Edits and regenerations append a version. For approved/in-progress plans the new
  version is a **proposal** until adopted (current version unchanged).
* Weekly plans link to the active monthly plan and repeat its goal (`parentGoal`).
* Without AI, plans are assembled by rules and labeled **Example (rules — no AI)**
  (`source = 'example'`). Insufficient data (< 20 completed visits in 90 days)
  produces an explicitly experimental plan with limitations, no forecasts.
* Export: JSON and CSV (CSV cells guarded against formula injection).

## Jobs & schedules

* `marketing.analysis` (registered in `src/server/jobs-registry/marketing.ts`),
  idempotency key `marketing.<horizon>:<tenant>:<period>`; weekly period = next
  Sunday–Saturday, monthly = next calendar month, both in the business timezone.
* `scheduleDueAnalyses()` enqueues for tenants that enabled weekly/monthly runs
  (weekly on the chosen weekday; monthly from the 20th). The integrator's worker
  should call it periodically, and enqueue `campaign.dispatch` for due campaigns.
* Review environments without a worker can run an analysis inline
  (`POST …/marketing/analyze { runNow: true }`); the `job_runs` row still records
  queued/running/succeeded/failed. A failed analysis never touches earlier plans.

## Trend radar

* Model memory is never a news source. Observations come only from fetched,
  dated sources or user links; metrics are copied only when the source provides them.
* **SSRF**: https only, default port, no credentials, no `localhost`/`.internal`;
  the resolved IP is validated **inside the socket lookup** (DNS-rebinding safe);
  blocked ranges include loopback, RFC1918, CGNAT, link-local/metadata
  (169.254.169.254, fd00:ec2::254), unique-local/link-local IPv6, IPv4-mapped
  IPv6, multicast and reserved ranges; ≤ 3 redirects each re-validated; ≤ 1 MB;
  10 s total; content-type allowlist.
* Dedup by content hash (normalized title + URL without query); clustering by
  normalized tokens. Verification: `live` only if the source is connected, fetched
  ≤ 7 days ago and the item is dated ≤ 30 days ago; otherwise `stale`, `undated`
  or `unavailable`. Evidence: `single_example` / `recurring` (≥ 3 items, ≥ 2
  sources, 30 days) / `quantified` (source metrics only).
* Fit is computed from keyword overlap with the business's own services; AI may
  lower but never raise it. "Add to weekly plan" appends a plan version.

## Campaigns

* Segments: allowlisted conditions (`last_visit_days_gt/lt`, `visits_gte`,
  `visited_service`, `has_consent`) compiled to parameterized SQL; previews return
  counts only; plain-language explanations are shown.
* Recipient building enforces latest channel consent (opt-out wins), suppression
  list, missing destination, frequency cap, and deterministic holdout assignment
  (only when ≥ 200 eligible).
* States: `draft → approved (campaign.approve) → scheduled → sending → sent → completed`,
  plus `paused/failed/cancelled`. Quiet hours (business timezone) move a send to the
  end of the window. **Sending is simulated**; production refuses without a
  connected provider.
* Results: completed bookings net of refunds within the attribution window,
  counted once (`campaign_events` dedupe keys), coupon redemptions, and an
  incremental estimate **only** when both arms have ≥ 100 members — otherwise
  "insufficient sample". Before/after comparisons are labeled non-causal.
  Saved outcomes are context for future recommendations; nothing retrains a model.

## Customization assistant

`POST /api/v1/t/:tenant/customize { prompt }` → proposal (`customization_requests`)
with ops, diff, contrast warnings and rejected parts; `POST …/customize/:id
{ decision: accept|reject }`. Allowed ops: brand colors (hex), fonts (supported
list), radius/button/card/density, appearance variants, moving/hiding existing
blocks, editing existing block text (no markup, no URLs). Prices, discounts,
policies, payments, appointments, permissions, links, code and publishing are
always rejected — even if a model returns them. With AI disconnected, a labeled
deterministic Arabic/English keyword parser is used. Accepting applies through
the builder's `applyDraftPatch` with the proposal's base draft version (409 on
conflict); undo is available in the builder; nothing is published.

## Analytics definitions

* Eligible event: not bot, not internal (preview, builder header, signed-in member).
* Session: pseudonymous HMAC of a first-party cookie with 30-minute idle expiry;
  visitor: HMAC of a 1-year cookie. Duplicate `eventId`s are ignored.
* Conversion rate = eligible browsing sessions with ≥ 1 `booking_confirmed`/`order_paid`
  ÷ eligible browsing sessions. Bookings per session is separate and can exceed 1.
  Conversions are server-side only (`recordConversion`, deterministic event id per
  booking/order) and those without a session are reported as unattributed.
* Occupancy = booked minutes (confirmed→completed allocations incl. buffers)
  ÷ available minutes (staff ∩ branch hours, overrides, minus breaks and approved
  leave), same period and branch. Holds are not booked.
* Staff indicators are shown separately with sample sizes; composite only when all
  weighted components meet minimum samples; weights default to **test values**
  (`analytics_settings`, editable); satisfaction may use documented Bayesian
  shrinkage; productivity is utilization, revenue/hour only relative to the same
  specialty; "rework" is not tracked and is shown as such. AI never makes
  employment decisions.

## Cost & usage

`ai_usage` counts every attempted provider call per tenant per month; cost is
recorded only when `AI_PRICE_IN_PER_MTOK_MICROUSD` / `AI_PRICE_OUT_PER_MTOK_MICROUSD`
are set from documented pricing — otherwise `null`. Cached results reuse a
previous successful output for the same tenant/purpose/prompt/model/input and do
not consume budget.

## Known limitations

* OpenAI adapter not exercised against the live API (no key/network here).
* Seasonal/holiday recommendations are not generated: no verified calendar source
  is connected (spec requires verified dates).
* RSS/HTML parsing is intentionally minimal (regex); no JavaScript-rendered pages.
* "Rework/complaints about staff" has no data source yet; low ratings are used as a
  labeled proxy.
