# Booking engine

Code: `src/server/booking/{intervals,planner,availability,service,terms,completion}.ts`.
Tests: `tests/integration/booking.test.ts`, `tests/integration/payments.test.ts`.

## Availability (`findAvailability`)
Input: branch, 1–5 items (`serviceId`, optional `variantId`, `addonIds`, `staffId` or "any"),
start date and number of days (≤14), mode `public` | `internal`.

1. **Validate** branch active; public mode also requires tenant `active` and a live
   subscription (`entitlements().live`). Service must be `active`, offered at the branch,
   not hidden (public) — hidden services are bookable internally only when
   `internal_booking_when_hidden`. A hidden/archived category hides its services publicly.
2. **Durations**: base or variant duration/price, overridden by `service_price_rules`
   (variant+staff > staff > variant > base), plus add-on durations/prices. Buffers before/after
   are part of the specialist's occupation, not the customer's appointment.
3. **Qualified staff** = `service_staff` ∩ active ∩ assigned to the branch (optionally the
   requested specialist). **Resources**: `service_resource_requirements` (type × qty) matched to
   active resources of the branch.
4. **Free time** per staff/day (branch timezone): staff weekly hours (or date override) ∩
   branch hours (or branch override; a branch "closed" override closes everyone) − weekly and
   dated breaks − approved leave − blocked time − active allocations whose hold has not
   expired. Pending leave does not block. Resources follow branch hours minus their blocked
   time and allocations. (If a branch has no hours configured at all, staff hours decide.)
5. **Window**: candidate starts every `slot_increment_min` from local midnight, not earlier
   than now + max(policy notice, service notice), not later than now + min(policy window,
   service window).
6. **Planner** (`planItineraries`, pure): items in the given order, back-to-back with a gap of
   0…`max_gap_min` (multiples of the increment) between items; different specialists allowed;
   the same specialist/resource cannot overlap itself within an itinerary (buffers included).
   For each start it keeps the itinerary with the smallest total gap, then best allocation rank.
   Search is bounded (`maxExpansionsPerStart`) to keep pathological inputs fast.
7. **"Any specialist"**: earliest feasible start first, then the declared rule from
   `booking_policies.any_staff_rule`: `earliest_then_least_booked` (fewest booked minutes that
   day) or `earliest_then_weight` (higher `allocation_weight`); ties by staff sort order then id.
   No randomness.
8. Output contains only feasible options with the assigned specialist(s), total duration,
   gaps and price. It never reveals who or what occupies other times. Results are advisory.

When no itinerary exists the result carries `reason: no_qualified_staff | no_slots`; the UI
explains and suggests other days or booking services separately. Partial confirmation of a
multi-service request is impossible: a hold is all-or-nothing.

## Holds and conflict prevention (`createHold`)
In one transaction:
1. Lock the chosen staff rows `FOR SHARE` in id order (leave approval takes `FOR UPDATE`, so
   leave and new holds serialize).
2. Sweep expired holds touching those staff/resources (release allocations, mark bookings `expired`).
3. `verifyItinerary`: recompute everything for the exact chosen times (shift, breaks, leave,
   blocked, window, grid alignment, max gap, qualification, resources).
4. Recompute price and **payment terms** on the server (see below); the requested terms kind
   must be one of the computed options.
5. Insert booking (`held`, `hold_expires_at = now + hold_minutes`), item snapshots (service
   name, staff name, price, add-ons, duration, buffers) and allocations in a stable order.
6. `booking_allocations` has `EXCLUDE USING gist (tenant_id =, staff_id =, during &&) WHERE active`
   (and the same for resources). A concurrent overlapping insert fails with 23P01 →
   `409 slot_unavailable`; the whole transaction (all items) rolls back.

Concurrency test: five simultaneous holds for the same specialist/time → exactly one succeeds.

## Lifecycle (`TRANSITIONS` + guards in `transition`)
```
draft → held → pending_payment → confirmed → checked_in → in_service → completed
          └→ expired/cancelled     └→ expired/cancelled  └→ cancelled / no_show
```
| From | To | Who |
|---|---|---|
| held | confirmed | staff, customer (on-site/no payment terms), system (payment) |
| held | pending_payment | customer/staff/system |
| held, pending_payment | cancelled | staff, customer |
| held, pending_payment | expired | system |
| pending_payment | confirmed | system only (verified payment) |
| confirmed | checked_in / in_service | staff, assigned specialist |
| confirmed | cancelled | staff, customer (before start) |
| confirmed | no_show | staff, only after start + `no_show_grace_min` |
| checked_in | in_service / completed | staff, assigned specialist |
| in_service | completed | staff, assigned specialist |

Guards: deposit/full terms cannot be confirmed except by a verified payment; manual-approval
terms only by staff; business cancellations need a reason; customers cannot cancel after start.
Side effects: release allocations on cancel/no-show/expiry; on completion recognize revenue for
money held, write commission entries (rule snapshot, once), consume recipe materials (once;
shortage never blocks completion, management is alerted), earn loyalty points when fully paid.
Completion does not imply payment: `financial_status` is separate. Every transition writes
`booking_events` and the audit log, and emits an outbox event.

## Rescheduling
One transaction: lock + verify the replacement (excluding the booking's own allocations),
release old allocations, cancel old items, insert new items + allocations. If the replacement is
unavailable the transaction rolls back and the original remains. A price difference requires
`acceptPriceChange`. Customers can reschedule only before the cancellation window.

## Payment terms (`terms.ts`)
Methods actually available (active provider account + enabled methods; on-site per policy) ×
business policy (deposit percent/fixed ≤ total, on-site allowed, full online allowed) × active
customer decisions (tenant or platform scope, strictest wins: suspend > manual approval > full
payment > deposit > default). `require_full_payment` removes deposit/on-site options; if a
required online method does not exist the result is an explicit contact/manual path. The
computed terms are snapshotted on the hold and re-assessed before the payment is created; a
material change returns 409 with the new options.

## Cancellation & no-show money
`refundDue()` uses the policy captured at booking time: business/system cancellation → full
refund; customer cancellation inside the window or a no-show → `late_cancel_fee_bps` /
`no_show_fee_bps` of the total retained; the rest is refunded through a separate refund record
(`refund_pending` ≠ refunded).
