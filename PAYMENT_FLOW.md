# Payment flow

Implementation: `src/server/payments/{providers,service}.ts`, `src/server/booking/terms.ts`,
`src/server/finance/journal.ts`, `src/server/commerce/orders.ts`, routes under
`src/app/api/v1/s/[slug]/**`, `src/app/api/v1/webhooks/payments/[provider]`, `src/app/sandbox/**`.

## 1. Two separate money flows
| Flow | Payer → beneficiary | Where |
|---|---|---|
| A. Subscriptions | Business → LUMA | `plans`, `subscriptions`, `platform_invoices`; platform payment account has `tenant_id = NULL` and is reachable only from trusted platform code. **Not connected to any provider yet.** |
| B. Customer payments | Customer → business | `payment_accounts` (one active per tenant), `payments`, `payment_attempts`, `refunds`, `provider_events`, journal postings in the tenant's ledger. |

A renewal failure (A) never affects a customer's payment (B) and vice versa.

## 2. Provider model
- Each business connects its **own** provider account (`settlement_owner = 'tenant'`): money settles to the
  business; LUMA never holds customer funds. Secrets are stored AES-256-GCM encrypted (`LUMA_ENCRYPTION_KEY`) and never
  returned to clients.
- `methods_enabled` lists only methods the provider supports **and** the business enabled. The storefront offers
  online payment only when an active account exists. Tabby/Tamara are not integrated and are never shown.
- Card data never touches LUMA: customers pay on the provider's hosted page (no PAN/CVV storage).

| Adapter | Status |
|---|---|
| `sandbox` | Local simulated hosted checkout (`/sandbox/checkout/:paymentId`) + HMAC-SHA256 signed events (`x-sandbox-signature: t=<unix>,v1=<hex>` over `"<t>.<body>"`, 300 s tolerance). Development/review only: refused when `LUMA_DEPLOYMENT=production` or `PAYMENTS_SANDBOX_ENABLED=0`. **Moves no money.** |
| `moyasar` | Written against Moyasar's documented REST API (invoices, payments, refunds). **Not live-tested** (no network access/keys in the build environment). Moyasar webhooks carry a shared `secret_token` in the body, not a body signature, so events are treated as hints: the payment is **re-fetched from the API** and matched before anything is applied. Enabled only with `MOYASAR_ENABLED=1`. |

## 3. Payment terms (deposit / full / on-site / manual)
`computePaymentTerms` (`booking/terms.ts`) decides, on the server:
1. methods actually available (active account → online; `allow_on_site` → on-site);
2. business policy (`booking_policies`: deposit percent/fixed ≤ total, `allow_full_online`, `allow_on_site`);
3. active customer decisions (tenant + platform scope); the strictest wins:
   `suspend_account > manual_approval > require_full_payment > require_deposit > default`;
4. `require_full_payment` removes deposit and on-site options — the browser cannot re-enable them
   (the hold request's `termsKind` must be one of the computed options, else `402 payment_required`);
5. no compatible option → explicit "contact the business" fallback, never a silently weakened rule;
6. the computed terms + reason are snapshotted on the booking (`terms_snapshot`), and before the payment is created
   they are recomputed; a material change returns `409 terms_changed` for the customer to review.

The storefront shows only the server-computed options (`POST /api/v1/s/:slug/booking-quote`) with an explanation key.

## 4. Booking payment sequence
1. `POST /s/:slug/holds` → booking `held`, allocations with `expires_at` (hold minutes from policy).
2. `POST /s/:slug/holds/:id/pay` (Idempotency-Key) → `payments` row (`processing`), provider checkout URL;
   booking → `pending_payment`.
3. Customer pays on the provider page; the provider redirects back to `/account/bookings/:id?payment=…`.
   **The redirect proves nothing**: the page polls `GET /api/v1/me/payments/:id` until a verified event changes state.
4. Provider event → `POST /api/v1/webhooks/payments/:provider` → `processProviderEvent`:
   - locate the payment by provider id → load that account's webhook secret → verify signature/timestamp
     (or re-fetch for unsigned providers);
   - dedupe by `(provider, event_id)` in `provider_events` (duplicate → 200, no effect);
   - status is monotonic: `succeeded`/`failed` are terminal; out-of-order events are ignored;
   - amount, currency and account must match the payment; otherwise the payment becomes `needs_review`, owners/finance are
     notified, and **no later event can auto-apply it** (a human resolves it);
   - success → journal posting, `recomputeBookingFinancial`, booking `confirmed` by the system actor.
5. On-site terms: `POST /s/:slug/holds/:id/confirm` confirms without online payment; staff later record collection
   (`recordOnSitePayment`: requires `payments.collect`, a reference, amount ≤ outstanding, staff identity recorded).

### Late success after the hold expired
- allocations still active (nobody else took the time) → confirm;
- allocations released → try to re-acquire the identical allocations (exclusion constraints decide);
- slot taken → **automatic full refund** (`late_payment_slot_taken`), booking stays `expired`, customer and business are notified.
  Orders: re-reserve stock or refund; a payment arriving after an order was cancelled is always refunded.

### Payment succeeded but the app update failed
`reconcilePayments` (job) finds succeeded payments whose booking/order did not advance and re-applies the same
idempotent handlers. The customer-facing state stays "processing" until then.

## 5. Webhook endpoint behavior
`/api/v1/webhooks/payments/:provider` — no cookies/CSRF (authenticated by signature), raw body ≤ 256 KB, rate-limited.
`400` only for rejected (bad signature/stale/malformed); `200` for applied/duplicate/ignored/unknown/mismatch so the
provider stops retrying (mismatches are flagged internally). Responses contain no detail.

## 6. Refunds
- `refunds` rows: `pending → processing → succeeded | failed | cancelled`. **`refund_pending` is not refunded**; a
  booking is `refunded` only after the provider confirmed the refund. Cancelled ≠ refunded.
- Refund amount on cancellation/no-show uses the **booking-time** terms snapshot (window, late-cancel fee, no-show fee),
  never the current policy. Business/system cancellations refund everything paid.
- Idempotent by key (`bk:<booking>:<reason>:<n>`, `manual:<key>`, `late:<payment>`); total refunds can never exceed the
  payment (`refundable = amount − (pending + processing + succeeded)`).
- Provider refunds run in the `refund.execute` job (retries with backoff, idempotent per refund id; no blind retry of a
  charge). Cash refunds are completed manually by finance with a reference.

## 7. Journal (accounting basis)
Append-only double-entry (`financial_entries`, balanced per txn by a deferred trigger, corrections by offsetting entries):

| Event | Debit | Credit |
|---|---|---|
| Online payment succeeded | provider_clearing | customer_deposits (liability) |
| On-site collection before completion | cash / card_clearing | customer_deposits |
| On-site collection after completion | cash / card_clearing | service_revenue / product_revenue |
| Booking completed | customer_deposits (held amount) | service_revenue |
| Cancellation/no-show fee retained | customer_deposits | service_revenue |
| Order collected | customer_deposits | product_revenue (+ COGS: cogs / inventory when costs known) |
| Refund before recognition | customer_deposits | provider_clearing / cash |
| Refund after recognition | refunds (contra revenue) | provider_clearing / cash |
| Commission earned | commission_expense | commission_payable |

A collected deposit is therefore **not** completed-service revenue until the service is delivered.

## 8. Connecting a business's Moyasar account (pages ready, not live-verified)
1. Settings → Payments: the owner enters the publishable key, secret key and a webhook secret token (re-authentication required). Mode comes from the key prefixes; mixed test/live pairs are refused. Secrets are encrypted (AES-256-GCM) and never returned — the UI shows `sk_test_…abcd` only.
2. The page shows the webhook URL (`{APP_BASE_URL}/api/v1/webhooks/payments/moyasar`) to paste in Moyasar with the same token.
3. "Test connection" performs one read-only authenticated call (`GET /payments?page=1`). With `MOYASAR_ENABLED=0` or no network it is recorded as `unreachable` — never as success.
4. "Activate" needs a successful test in the last 24 h, `MOYASAR_ENABLED=1`, and for **live** keys also `LUMA_DEPLOYMENT=production` and `MOYASAR_LIVE_ALLOWED=1`.
5. Webhooks: the hosted checkout is a Moyasar *invoice*; events carry the *charge* id plus `invoice_id`. The event is located by either id, the token is checked, the charge is re-fetched and must reference our invoice, and its id is saved as `provider_charge_id` (refunds use it).

## 9. Delivery and returns money
- Order total = subtotal − discount + delivery fee (coupons never discount the fee). On delivery the held amount is recognized as `product_revenue` + `delivery_revenue`.
- Cash on delivery: order stays `pending_payment` while preparing/dispatching (stock held without expiry); "delivered" is refused until the courier's cash is recorded with a reference.
- Return refunds: suggested amount = returned lines − their share of the order discount (+ delivery fee if the policy refunds it and everything is returned), capped by what was paid and not refunded. Issued through normal refunds (provider/manual/gift card) with step-up; a credit note is issued against the order's invoice.

## 10. Not done / blockers
- No live provider integration has been tested; Moyasar requires keys, network access and a sandbox account.
- Subscription billing (flow A) has data structures but no provider.
- Tax/e-invoicing (ZATCA) compliance is not claimed: invoices carry the simplified-invoice fields and Phase-1 TLV QR only.
