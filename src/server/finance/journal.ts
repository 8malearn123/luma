import { randomUUID } from 'node:crypto';
import type { Tx } from '../db';

/**
 * Append-only double-entry journal. Every posting is balanced (enforced by a
 * deferred constraint trigger) and idempotent per (ref_type, ref_id, account,
 * side) for system postings. Corrections are new offsetting postings.
 *
 * Accounting basis (documented in PAYMENT_FLOW.md):
 *  - Customer money received before service delivery is a LIABILITY
 *    (customer_deposits), not revenue.
 *  - Service revenue is recognized when the booking is completed.
 *  - Product revenue is recognized when the order is collected.
 *  - Retained cancellation/no-show fees are recognized at cancellation.
 *  - Refunds before recognition reduce the liability; after recognition they
 *    post to the contra-revenue account `refunds`.
 */
export type Account =
  | 'cash' | 'card_clearing' | 'provider_clearing' | 'customer_deposits' | 'gift_card_liability' | 'membership_liability'
  | 'service_revenue' | 'product_revenue' | 'discounts' | 'refunds' | 'processing_fees' | 'expenses'
  | 'commission_expense' | 'commission_payable' | 'cogs' | 'inventory' | 'tax_payable' | 'accounts_payable';

export interface Line {
  account: Account;
  debit?: number;
  credit?: number;
}

export async function post(
  tx: Tx,
  p: { tenantId: string; refType: string; refId: string | null; memo?: string; actorUserId?: string | null; lines: Line[]; at?: Date },
): Promise<string | null> {
  const lines = p.lines.filter((l) => (l.debit ?? 0) > 0 || (l.credit ?? 0) > 0);
  if (!lines.length) return null;
  const d = lines.reduce((n, l) => n + (l.debit ?? 0), 0);
  const c = lines.reduce((n, l) => n + (l.credit ?? 0), 0);
  if (d !== c) throw new Error(`unbalanced posting ${p.refType}: ${d} != ${c}`);
  const txn = randomUUID();
  for (const l of lines) {
    await tx`insert into financial_entries (tenant_id, txn_id, at, account, debit_minor, credit_minor, ref_type, ref_id, memo, actor_user_id)
             values (${p.tenantId}, ${txn}, ${p.at ?? new Date()}, ${l.account}, ${l.debit ?? 0}, ${l.credit ?? 0}, ${p.refType}, ${p.refId}, ${p.memo ?? null}, ${p.actorUserId ?? null})`;
  }
  return txn;
}

/** Idempotent variant: skips if a posting with this ref already exists. */
export async function postOnce(tx: Tx, p: Parameters<typeof post>[1]) {
  const [ex] = await tx`select 1 from financial_entries where ref_type = ${p.refType} and ref_id = ${p.refId} limit 1`;
  if (ex) return null;
  return post(tx, p);
}

/** Balance of an account for a booking/order reference set (positive = credit balance). */
export async function liabilityHeldForBooking(tx: Tx, bookingId: string): Promise<number> {
  const [r] = await tx<{ bal: number }[]>`
    select coalesce(sum(credit_minor - debit_minor), 0)::bigint as bal from financial_entries
    where account = 'customer_deposits' and (
      (ref_type = 'payment' and ref_id in (select id from payments where booking_id = ${bookingId})) or
      (ref_type in ('refund') and ref_id in (select r.id from refunds r join payments p on p.id = r.payment_id where p.booking_id = ${bookingId})) or
      (ref_type in ('service_completed','booking_fee_retained') and ref_id = ${bookingId}))`;
  return Number(r.bal);
}
