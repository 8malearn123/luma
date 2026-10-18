import { randomUUID } from 'node:crypto';
import type { Tx } from '../db';
import { withSystem, withTenant } from '../db';
import { AppError, forbidden, notFound } from '../errors';
import { audit } from '../audit';
import { decryptSecret, encryptSecret, randomToken } from '../crypto';
import { enqueueJob, registerJob } from '../jobs';
import { post, postOnce } from '../finance/journal';
import { notifyTenantRoles, notifyUser } from '../services/notifications';
import type { TenantContext } from '../tenancy/context';
import { computePaymentTerms, termsMateriallyChanged, type ComputedTerms } from '../booking/terms';
import { providerByName, PROVIDER_METHODS, sandboxSign, type VerifiedEvent } from './providers';
import { env, isProduction } from '../env';

interface Account {
  id: string;
  tenantId: string;
  provider: 'sandbox' | 'moyasar' | 'manual';
  mode: string;
  status: string;
  secretCiphertext: string | null;
  webhookSecretCiphertext: string | null;
  methodsEnabled: string[];
}

export async function activeAccount(tx: Tx, tenantId: string): Promise<Account | null> {
  const [a] = await tx<Account[]>`select * from payment_accounts where tenant_id = ${tenantId} and status = 'active' and provider <> 'manual' limit 1`;
  return a ?? null;
}

/** Connect the sandbox provider for a business (development/review only). */
export async function connectSandbox(tx: Tx, ctx: TenantContext, methods: string[] = ['sandbox_card']) {
  if (isProduction() || !env().PAYMENTS_SANDBOX_ENABLED) throw new AppError('unavailable', 'errors.payments_unavailable');
  const allowed = methods.filter((m) => PROVIDER_METHODS.sandbox.includes(m));
  await tx`update payment_accounts set status = 'disabled', updated_at = now() where tenant_id = ${ctx.tenant.id} and status = 'active'`;
  const [a] = await tx<{ id: string }[]>`
    insert into payment_accounts (tenant_id, provider, mode, status, secret_ciphertext, webhook_secret_ciphertext, methods_enabled, verified_at)
    values (${ctx.tenant.id}, 'sandbox', 'test', 'active', ${encryptSecret(randomToken(24))}, ${encryptSecret(randomToken(32))}, ${allowed}, now())
    returning id`;
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: 'payments.sandbox_connected', targetType: 'payment_account', targetId: a.id, requestId: ctx.requestId });
  return a;
}

export async function disconnectProvider(tx: Tx, ctx: TenantContext) {
  await tx`update payment_accounts set status = 'disabled', updated_at = now() where tenant_id = ${ctx.tenant.id} and status = 'active'`;
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: 'payments.disconnected', requestId: ctx.requestId });
}

// ─────────────────────────────────────────────────────────────
// Financial status
// ─────────────────────────────────────────────────────────────
export async function recomputeBookingFinancial(tx: Tx, bookingId: string) {
  const [r] = await tx<{ paid: number; refunded: number; pendingRefund: number }[]>`
    select coalesce(sum(amount_minor) filter (where status = 'succeeded'), 0)::bigint as paid,
           coalesce(sum(refunded_minor) filter (where status = 'succeeded'), 0)::bigint as refunded,
           coalesce((select sum(r.amount_minor) from refunds r join payments p on p.id = r.payment_id
                     where p.booking_id = ${bookingId} and r.status in ('pending','processing')), 0)::bigint as pending_refund
    from payments where booking_id = ${bookingId}`;
  const [b] = await tx<{ totalMinor: number; depositDueMinor: number }[]>`select total_minor, deposit_due_minor from bookings where id = ${bookingId}`;
  const paid = Number(r.paid);
  const refunded = Number(r.refunded);
  let status: string;
  if (Number(r.pendingRefund) > 0) status = 'refund_pending';
  else if (refunded > 0 && refunded >= paid) status = 'refunded';
  else if (refunded > 0) status = 'partially_refunded';
  else if (b.totalMinor === 0) status = 'not_required';
  else if (paid >= b.totalMinor) status = 'paid';
  else if (paid > 0 && b.depositDueMinor > 0 && paid >= b.depositDueMinor) status = 'deposit_paid';
  else if (paid > 0) status = 'partially_paid';
  else status = 'unpaid';
  await tx`update bookings set paid_minor = ${paid}, refunded_minor = ${refunded}, financial_status = ${status} where id = ${bookingId}`;
  return status;
}

async function recomputeOrderFinancial(tx: Tx, orderId: string) {
  const [r] = await tx<{ paid: number; refunded: number; pending: number }[]>`
    select coalesce(sum(amount_minor) filter (where status = 'succeeded'), 0)::bigint as paid,
           coalesce(sum(refunded_minor) filter (where status = 'succeeded'), 0)::bigint as refunded,
           coalesce((select sum(r.amount_minor) from refunds r join payments p on p.id = r.payment_id where p.order_id = ${orderId} and r.status in ('pending','processing')), 0)::bigint as pending
    from payments where order_id = ${orderId}`;
  const [o] = await tx<{ totalMinor: number }[]>`select total_minor from orders where id = ${orderId}`;
  const refunded = Number(r.refunded);
  const rs = Number(r.pending) > 0 ? 'pending' : refunded === 0 ? 'none' : refunded >= Number(r.paid) ? 'full' : 'partial';
  await tx`update orders set paid_minor = ${Number(r.paid)}, refunded_minor = ${refunded}, refund_status = ${rs} where id = ${orderId}`;
  return { paid: Number(r.paid), total: o.totalMinor };
}

// ─────────────────────────────────────────────────────────────
// Checkout (customer pays on the provider's hosted page)
// ─────────────────────────────────────────────────────────────
export async function startBookingPayment(tx: Tx, customerUserId: string, bookingId: string, idempotencyKey: string) {
  const [b] = await tx<{ id: string; tenantId: string; number: string; status: string; customerUserId: string | null; paymentTerms: string; totalMinor: number; depositDueMinor: number; paidMinor: number; holdExpiresAt: Date | null; termsSnapshot: { terms: ComputedTerms; chosen: string } }[]>`
    select * from bookings where id = ${bookingId} for update`;
  if (!b || b.customerUserId !== customerUserId) throw notFound('booking');
  if (!['held', 'pending_payment'].includes(b.status)) throw new AppError('invalid_transition', 'errors.invalid_transition');
  if (b.holdExpiresAt && b.holdExpiresAt <= new Date()) throw new AppError('slot_unavailable', 'errors.hold_expired');
  if (b.paymentTerms !== 'full' && b.paymentTerms !== 'deposit') throw new AppError('invalid_transition', 'errors.payment_not_required');
  // policy may have changed during the hold: reassess before creating the payment
  const fresh = await computePaymentTerms(tx, b.tenantId, customerUserId, b.totalMinor);
  if (termsMateriallyChanged(b.termsSnapshot.terms, fresh, b.paymentTerms as 'full' | 'deposit')) {
    throw new AppError('conflict', 'errors.terms_changed', { options: fresh.options, explanation: fresh.customerExplanationKey });
  }
  const amount = (b.paymentTerms === 'full' ? b.totalMinor : b.depositDueMinor) - b.paidMinor;
  if (amount <= 0) throw new AppError('invalid_transition', 'errors.already_paid');
  const acct = await activeAccount(tx, b.tenantId);
  if (!acct) throw new AppError('unavailable', 'errors.payments_unavailable');
  const existing = await tx<{ id: string; checkoutUrl: string | null; status: string }[]>`
    select id, checkout_url, status from payments where idempotency_key = ${`bk:${idempotencyKey}`}`;
  if (existing[0]) return { paymentId: existing[0].id, checkoutUrl: existing[0].checkoutUrl, status: existing[0].status };
  const paymentId = randomUUID();
  const provider = providerByName(acct.provider);
  await tx`insert into payments (id, tenant_id, payment_account_id, purpose, booking_id, kind, amount_minor, provider, idempotency_key, status)
           values (${paymentId}, ${b.tenantId}, ${acct.id}, 'booking', ${b.id}, ${b.paymentTerms}, ${amount}, ${acct.provider}, ${`bk:${idempotencyKey}`}, 'pending')`;
  const co = await provider.createCheckout(
    { paymentId, amountMinor: amount, currency: 'SAR', description: `Booking ${b.number}`, returnUrl: `/account/bookings/${b.id}?payment=${paymentId}`, methods: acct.methodsEnabled, idempotencyKey },
    decryptSecret(acct.secretCiphertext!),
    acct.id,
  );
  await tx`update payments set provider_payment_id = ${co.providerPaymentId}, checkout_url = ${co.checkoutUrl}, status = 'processing' where id = ${paymentId}`;
  await tx`insert into payment_attempts (tenant_id, payment_id, provider, action, status, provider_ref) values (${b.tenantId}, ${paymentId}, ${acct.provider}, 'create', 'processing', ${co.providerPaymentId})`;
  if (b.status === 'held') {
    await tx`update bookings set status = 'pending_payment', version = version + 1 where id = ${b.id}`;
    await tx`insert into booking_events (tenant_id, booking_id, from_status, to_status, kind, source, actor_user_id) values (${b.tenantId}, ${b.id}, 'held', 'pending_payment', 'transition', 'customer', ${customerUserId})`;
  }
  return { paymentId, checkoutUrl: co.checkoutUrl, status: 'processing' };
}

export async function startOrderPayment(tx: Tx, customerUserId: string, orderId: string, idempotencyKey: string) {
  const [o] = await tx<{ id: string; tenantId: string; number: string; status: string; customerUserId: string | null; totalMinor: number; paidMinor: number; holdExpiresAt: Date | null }[]>`
    select * from orders where id = ${orderId} for update`;
  if (!o || o.customerUserId !== customerUserId) throw notFound('order');
  if (o.status !== 'pending_payment') throw new AppError('invalid_transition', 'errors.invalid_transition');
  if (o.holdExpiresAt && o.holdExpiresAt <= new Date()) throw new AppError('invalid_transition', 'errors.order_expired');
  const acct = await activeAccount(tx, o.tenantId);
  if (!acct) throw new AppError('unavailable', 'errors.payments_unavailable');
  const existing = await tx<{ id: string; checkoutUrl: string | null; status: string }[]>`select id, checkout_url, status from payments where idempotency_key = ${`ord:${idempotencyKey}`}`;
  if (existing[0]) return { paymentId: existing[0].id, checkoutUrl: existing[0].checkoutUrl, status: existing[0].status };
  const amount = o.totalMinor - o.paidMinor;
  const paymentId = randomUUID();
  await tx`insert into payments (id, tenant_id, payment_account_id, purpose, order_id, kind, amount_minor, provider, idempotency_key)
           values (${paymentId}, ${o.tenantId}, ${acct.id}, 'order', ${o.id}, 'full', ${amount}, ${acct.provider}, ${`ord:${idempotencyKey}`})`;
  const co = await providerByName(acct.provider).createCheckout(
    { paymentId, amountMinor: amount, currency: 'SAR', description: `Order ${o.number}`, returnUrl: `/account/orders/${o.id}?payment=${paymentId}`, methods: acct.methodsEnabled, idempotencyKey },
    decryptSecret(acct.secretCiphertext!),
    acct.id,
  );
  await tx`update payments set provider_payment_id = ${co.providerPaymentId}, checkout_url = ${co.checkoutUrl}, status = 'processing' where id = ${paymentId}`;
  await tx`insert into payment_attempts (tenant_id, payment_id, provider, action, status, provider_ref) values (${o.tenantId}, ${paymentId}, ${acct.provider}, 'create', 'processing', ${co.providerPaymentId})`;
  return { paymentId, checkoutUrl: co.checkoutUrl, status: 'processing' };
}

// ─────────────────────────────────────────────────────────────
// Provider events (webhooks)
// ─────────────────────────────────────────────────────────────
export type EventOutcome = 'applied' | 'duplicate' | 'ignored' | 'mismatch' | 'late_success_refunded' | 'unknown_payment' | 'rejected';

/**
 * Verifies, deduplicates and applies a provider event. Signature and replay
 * window are checked by the adapter with the business account's webhook
 * secret. Duplicates (same event id) and out-of-order events are no-ops:
 * payment status is monotonic (succeeded/failed are terminal).
 */
export async function processProviderEvent(providerName: string, rawBody: string, headers: Headers, now = Date.now()): Promise<EventOutcome> {
  const provider = providerByName(providerName);
  // Identify the payment first (unverified hint) to choose the account secret.
  let hint: { id?: string; data?: { id?: string } };
  try {
    hint = JSON.parse(rawBody);
  } catch {
    return 'rejected';
  }
  const providerPaymentId = hint.data?.id;
  if (!providerPaymentId || typeof providerPaymentId !== 'string') return 'rejected';
  const pay = await withSystem('webhook: locate payment by provider id', async (tx) => {
    const [p] = await tx<{ id: string; tenantId: string; accountId: string; webhookSecret: string | null; secret: string | null }[]>`
      select p.id, p.tenant_id, a.id as account_id, a.webhook_secret_ciphertext as webhook_secret, a.secret_ciphertext as secret
      from payments p join payment_accounts a on a.id = p.payment_account_id
      where p.provider = ${providerName} and p.provider_payment_id = ${providerPaymentId}`;
    return p;
  });
  if (!pay || !pay.webhookSecret) {
    await recordEvent(providerName, hint.id ?? `unknown-${randomUUID()}`, 'unknown', null, false, rawBody, 'unknown_payment');
    return 'unknown_payment';
  }
  let ev: VerifiedEvent;
  try {
    ev = provider.verifyWebhook(rawBody, headers, decryptSecret(pay.webhookSecret), now);
  } catch {
    await recordEvent(providerName, `invalid-${randomUUID()}`, 'invalid_signature', pay.tenantId, false, rawBody, 'rejected');
    return 'rejected';
  }
  if (!ev.authoritative) {
    // unsigned body: the provider API is the source of truth
    const fetched = await provider.fetchPayment(providerPaymentId, decryptSecret(pay.secret!));
    ev = { ...ev, status: fetched.status, amountMinor: fetched.amountMinor, currency: fetched.currency, authoritative: true };
  }
  const fresh = await recordEvent(providerName, ev.eventId, ev.type, pay.tenantId, true, rawBody, null);
  if (!fresh) return 'duplicate';
  const outcome = await withTenant({ tenantId: pay.tenantId }, (tx) => applyPaymentEvent(tx, pay.id, pay.accountId, ev));
  await withSystem('webhook: record outcome', (tx) => tx`update provider_events set processed_at = now(), outcome = ${outcome} where provider = ${providerName} and event_id = ${ev.eventId}`);
  return outcome;
}

async function recordEvent(provider: string, eventId: string, type: string, tenantId: string | null, valid: boolean, raw: string, outcome: string | null): Promise<boolean> {
  return withSystem('webhook: dedupe', async (tx) => {
    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      payload = { raw: raw.slice(0, 500) };
    }
    const r = await tx`insert into provider_events (provider, event_id, event_type, tenant_id, signature_valid, payload, outcome)
                       values (${provider}, ${eventId}, ${type}, ${tenantId}, ${valid}, ${tx.json(redactPayload(payload) as never)}, ${outcome})
                       on conflict (provider, event_id) do nothing returning id`;
    return r.length > 0;
  });
}

function redactPayload(p: unknown): unknown {
  if (!p || typeof p !== 'object') return p;
  const o = { ...(p as Record<string, unknown>) };
  if ('secret_token' in o) o.secret_token = '[redacted]';
  return o;
}

export async function applyPaymentEvent(tx: Tx, paymentId: string, accountId: string, ev: VerifiedEvent): Promise<EventOutcome> {
  const [p] = await tx<{ id: string; tenantId: string; purpose: string; bookingId: string | null; orderId: string | null; amountMinor: number; currency: string; status: string; paymentAccountId: string }[]>`
    select * from payments where id = ${paymentId} for update`;
  if (!p) return 'unknown_payment';
  await tx`insert into payment_attempts (tenant_id, payment_id, provider, action, status, provider_ref) values (${p.tenantId}, ${p.id}, 'event', 'webhook', ${ev.status}, ${ev.eventId})`;
  // a payment flagged for review is resolved by a human, never by later events
  if (p.status === 'needs_review') return 'ignored';
  if (ev.status === 'succeeded') {
    if (p.status === 'succeeded') return 'duplicate';
    if (p.status === 'failed' || p.status === 'cancelled') {
      // provider says succeeded after we saw a failure: needs a human
      await tx`update payments set status = 'needs_review', failure_reason = 'conflicting_events' where id = ${p.id}`;
      return 'mismatch';
    }
    if (ev.amountMinor !== p.amountMinor || ev.currency !== p.currency || (ev.accountRef && ev.accountRef !== accountId) || p.paymentAccountId !== accountId) {
      await tx`update payments set status = 'needs_review', failure_reason = 'amount_currency_or_account_mismatch' where id = ${p.id}`;
      await notifyTenantRoles(tx, p.tenantId, ['owner', 'finance'], { type: 'payment.mismatch', title: 'payments.notice_mismatch', targetPath: `/app/_/finance?payment=${p.id}`, dedupeKey: `mismatch:${p.id}` });
      return 'mismatch';
    }
    await tx`update payments set status = 'succeeded', succeeded_at = now(), method = coalesce(method, 'online') where id = ${p.id}`;
    await post(tx, { tenantId: p.tenantId, refType: 'payment', refId: p.id, memo: `online ${p.purpose} payment`, lines: [{ account: 'provider_clearing', debit: p.amountMinor }, { account: 'customer_deposits', credit: p.amountMinor }] });
    if (p.purpose === 'booking' && p.bookingId) return onBookingPaid(tx, p.bookingId, p.id);
    if (p.purpose === 'order' && p.orderId) return onOrderPaid(tx, p.orderId, p.id);
    return 'applied';
  }
  if (ev.status === 'failed' || ev.status === 'cancelled') {
    if (p.status === 'succeeded' || p.status === 'failed' || p.status === 'cancelled') return 'ignored'; // out-of-order / duplicate
    await tx`update payments set status = ${ev.status}, failure_reason = ${ev.type} where id = ${p.id}`;
    if (p.purpose === 'order' && p.orderId) {
      const { releaseOrderStock } = await import('../commerce/orders');
      await releaseOrderStock(tx, p.orderId, 'payment_failed');
    }
    return 'applied';
  }
  return 'ignored';
}

/**
 * Booking payment succeeded. If the hold is still ours, confirm. If the hold
 * expired and the time was taken meanwhile, never double-book: re-acquire if
 * still free, otherwise refund automatically and notify.
 */
async function onBookingPaid(tx: Tx, bookingId: string, paymentId: string): Promise<EventOutcome> {
  const [b] = await tx<{ id: string; tenantId: string; status: string; customerUserId: string | null; number: string }[]>`select id, tenant_id, status, customer_user_id, number from bookings where id = ${bookingId} for update`;
  await recomputeBookingFinancial(tx, bookingId);
  if (['confirmed', 'checked_in', 'in_service', 'completed'].includes(b.status)) return 'applied';
  const { transition } = await import('../booking/service');
  const actor = { kind: 'system' as const, tenantId: b.tenantId, reason: 'payment succeeded' };
  if (b.status === 'held' || b.status === 'pending_payment') {
    // group-session bookings hold a seat (the instructor is allocated once per session), not their own allocation
    const active = await tx`
      select 1 from booking_allocations where booking_id = ${bookingId} and active
      union all
      select 1 from group_session_bookings where booking_id = ${bookingId} and status = 'active'
      limit 1`;
    if (active.length) {
      await tx`update bookings set hold_expires_at = now() + interval '1 minute' where id = ${bookingId}`;
      await transition(tx, actor, bookingId, 'confirmed');
      return 'applied';
    }
  }
  // hold expired (or was swept): try to re-acquire the exact same allocations
  const reacquired = await tx.savepoint(async (sp) => {
    const rel = await sp<{ id: string }[]>`
      select id from booking_allocations where booking_id = ${bookingId} and release_reason = 'hold_expired' and not active`;
    if (!rel.length) return false;
    for (const r of rel) {
      await sp`insert into booking_allocations (tenant_id, booking_id, booking_item_id, staff_id, resource_id, during, expires_at)
               select tenant_id, booking_id, booking_item_id, staff_id, resource_id, during, null from booking_allocations where id = ${r.id}`;
    }
    return true;
  }).catch(() => false);
  if (reacquired) {
    await tx`update bookings set status = 'held', hold_expires_at = now() + interval '1 minute' where id = ${bookingId}`;
    await tx`insert into booking_events (tenant_id, booking_id, from_status, to_status, kind, source, reason) values (${b.tenantId}, ${bookingId}, ${b.status}, 'held', 'transition', 'system', 'late payment: slot re-acquired')`;
    await transition(tx, actor, bookingId, 'confirmed');
    return 'applied';
  }
  // slot was taken: refund in full, keep the booking expired, tell everyone
  const [pay] = await tx<{ amountMinor: number }[]>`select amount_minor from payments where id = ${paymentId}`;
  await createRefund(tx, { paymentId, amountMinor: pay.amountMinor, reason: 'late_payment_slot_taken', requestedBy: null, idempotencyKey: `late:${paymentId}` });
  await tx`insert into booking_events (tenant_id, booking_id, from_status, to_status, kind, source, reason) values (${b.tenantId}, ${bookingId}, ${b.status}, ${b.status}, 'payment', 'system', 'late payment after hold expiry; slot taken; refund initiated')`;
  if (b.customerUserId) await notifyUser(tx, b.customerUserId, b.tenantId, { type: 'booking.late_payment_refund', title: 'booking.notice_late_payment', body: b.number, targetPath: `/account/bookings/${bookingId}`, dedupeKey: `late:${paymentId}` });
  await notifyTenantRoles(tx, b.tenantId, ['owner', 'finance'], { type: 'payment.late_refund', title: 'payments.notice_late_refund', body: b.number, dedupeKey: `late-t:${paymentId}` });
  return 'late_success_refunded';
}

async function onOrderPaid(tx: Tx, orderId: string, paymentId: string): Promise<EventOutcome> {
  const [o] = await tx<{ status: string; stockReleasedAt: Date | null; tenantId: string; customerUserId: string | null; number: string }[]>`select status, stock_released_at, tenant_id, customer_user_id, number from orders where id = ${orderId} for update`;
  const { paid, total } = await recomputeOrderFinancial(tx, orderId);
  if (o.status === 'cancelled') {
    // paid after the order was cancelled/expired: never fulfil silently — refund in full
    const [pay] = await tx<{ amountMinor: number }[]>`select amount_minor from payments where id = ${paymentId}`;
    await createRefund(tx, { paymentId, amountMinor: pay.amountMinor, reason: 'late_payment_order_cancelled', requestedBy: null, idempotencyKey: `late:${paymentId}` });
    return 'late_success_refunded';
  }
  if (o.status !== 'pending_payment') return 'applied';
  if (o.stockReleasedAt) {
    // reservation already released (expired): re-reserve or refund
    const { reReserveOrderStock } = await import('../commerce/orders');
    const ok = await reReserveOrderStock(tx, orderId);
    if (!ok) {
      const [pay] = await tx<{ amountMinor: number }[]>`select amount_minor from payments where id = ${paymentId}`;
      await createRefund(tx, { paymentId, amountMinor: pay.amountMinor, reason: 'late_payment_out_of_stock', requestedBy: null, idempotencyKey: `late:${paymentId}` });
      await tx`update orders set status = 'cancelled', cancelled_at = now(), cancel_reason = 'late_payment_out_of_stock' where id = ${orderId}`;
      return 'late_success_refunded';
    }
  }
  if (paid >= total) {
    await tx`update orders set status = 'paid', hold_expires_at = null, version = version + 1 where id = ${orderId}`;
    const [snap] = await tx<{ termsSnapshot: { analyticsSession?: string | null } }[]>`select terms_snapshot from orders where id = ${orderId}`;
    const { recordConversion } = await import('../analytics/events');
    await recordConversion(tx, o.tenantId, 'order_paid', orderId, snap?.termsSnapshot?.analyticsSession ?? null);
    await tx`update stock_reservations set expires_at = 'infinity' where order_id = ${orderId} and status = 'active'`;
    if (o.customerUserId) await notifyUser(tx, o.customerUserId, o.tenantId, { type: 'order.paid', title: 'order.notice_paid', body: o.number, targetPath: `/account/orders/${orderId}`, dedupeKey: `ord-paid:${orderId}` });
    await notifyTenantRoles(tx, o.tenantId, ['owner', 'manager', 'receptionist'], { type: 'order.new', title: 'order.notice_new', body: o.number, dedupeKey: `ord-new:${orderId}` });
  }
  return 'applied';
}

// ─────────────────────────────────────────────────────────────
// On-site collection (cash / card terminal)
// ─────────────────────────────────────────────────────────────
export async function recordOnSitePayment(
  tx: Tx,
  ctx: TenantContext,
  input: { bookingId?: string; orderId?: string; amountMinor: number; method: 'cash' | 'card_terminal'; reference: string; idempotencyKey: string },
) {
  if (!ctx.caps.has('payments.collect')) throw forbidden();
  if (!input.reference.trim()) throw new AppError('validation', 'errors.reference_required');
  if (input.amountMinor <= 0) throw new AppError('validation', 'errors.amount_invalid');
  const dup = await tx<{ id: string }[]>`select id from payments where idempotency_key = ${`onsite:${input.idempotencyKey}`}`;
  if (dup[0]) return { paymentId: dup[0].id };
  let outstanding = 0;
  let completed = false;
  if (input.bookingId) {
    const [b] = await tx<{ totalMinor: number; paidMinor: number; refundedMinor: number; status: string }[]>`select total_minor, paid_minor, refunded_minor, status from bookings where id = ${input.bookingId} for update`;
    if (!b) throw notFound('booking');
    if (['cancelled', 'expired', 'draft'].includes(b.status)) throw new AppError('invalid_transition', 'errors.invalid_transition');
    outstanding = b.totalMinor - b.paidMinor;
    completed = b.status === 'completed';
  } else if (input.orderId) {
    const [o] = await tx<{ totalMinor: number; paidMinor: number; status: string }[]>`select total_minor, paid_minor, status from orders where id = ${input.orderId} for update`;
    if (!o) throw notFound('order');
    if (o.status === 'cancelled') throw new AppError('invalid_transition', 'errors.invalid_transition');
    outstanding = o.totalMinor - o.paidMinor;
    completed = o.status === 'collected';
  } else throw new AppError('validation', 'errors.validation');
  if (input.amountMinor > outstanding) throw new AppError('validation', 'errors.amount_exceeds_outstanding', { outstandingMinor: outstanding });
  const [p] = await tx<{ id: string }[]>`
    insert into payments (tenant_id, purpose, booking_id, order_id, kind, method, amount_minor, status, provider, collected_by, collection_ref, idempotency_key, succeeded_at)
    values (${ctx.tenant.id}, ${input.bookingId ? 'booking' : 'order'}, ${input.bookingId ?? null}, ${input.orderId ?? null}, 'on_site', ${input.method},
            ${input.amountMinor}, 'succeeded', 'manual', ${ctx.user.userId}, ${input.reference}, ${`onsite:${input.idempotencyKey}`}, now())
    returning id`;
  const debit = input.method === 'cash' ? 'cash' : 'card_clearing';
  const credit = completed ? (input.bookingId ? 'service_revenue' : 'product_revenue') : 'customer_deposits';
  await post(tx, { tenantId: ctx.tenant.id, refType: 'payment', refId: p.id, memo: `on-site ${input.method} ${input.reference}`, actorUserId: ctx.user.userId, lines: [{ account: debit, debit: input.amountMinor }, { account: credit, credit: input.amountMinor }] });
  if (input.bookingId) {
    const st = await recomputeBookingFinancial(tx, input.bookingId);
    if (st === 'paid' && completed) {
      const { earnForBooking } = await import('../services/loyalty');
      await earnForBooking(tx, input.bookingId);
    }
  } else await recomputeOrderFinancial(tx, input.orderId!);
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: 'payment.collected_on_site', targetType: input.bookingId ? 'booking' : 'order', targetId: input.bookingId ?? input.orderId, requestId: ctx.requestId, metadata: { amountMinor: input.amountMinor, method: input.method, reference: input.reference } });
  return { paymentId: p.id };
}

// ─────────────────────────────────────────────────────────────
// Refunds — refund_pending is NOT refunded; only a provider-confirmed refund is.
// ─────────────────────────────────────────────────────────────
export async function createRefund(tx: Tx, r: { paymentId: string; amountMinor: number; reason: string; requestedBy: string | null; idempotencyKey: string; termsBasis?: Record<string, unknown> }) {
  const [p] = await tx<{ id: string; tenantId: string; amountMinor: number; refundedMinor: number; status: string; provider: string; bookingId: string | null; orderId: string | null }[]>`
    select * from payments where id = ${r.paymentId} for update`;
  if (!p) throw notFound('payment');
  if (p.status !== 'succeeded') throw new AppError('invalid_transition', 'errors.refund_requires_succeeded_payment');
  const dup = await tx<{ id: string; status: string }[]>`select id, status from refunds where idempotency_key = ${r.idempotencyKey}`;
  if (dup[0]) return dup[0];
  const [{ open }] = await tx<{ open: number }[]>`select coalesce(sum(amount_minor), 0)::bigint as open from refunds where payment_id = ${p.id} and status in ('pending','processing','succeeded')`;
  const refundable = p.amountMinor - Number(open);
  if (r.amountMinor <= 0 || r.amountMinor > refundable) throw new AppError('validation', 'errors.refund_exceeds', { refundableMinor: refundable });
  const [ref] = await tx<{ id: string; status: string }[]>`
    insert into refunds (tenant_id, payment_id, amount_minor, reason, terms_basis, requested_by, idempotency_key, status)
    values (${p.tenantId}, ${p.id}, ${r.amountMinor}, ${r.reason}, ${tx.json((r.termsBasis ?? {}) as never)}, ${r.requestedBy}, ${r.idempotencyKey},
            ${p.provider === 'manual' ? 'pending' : 'pending'})
    returning id, status`;
  if (p.bookingId) await recomputeBookingFinancial(tx, p.bookingId);
  if (p.orderId) await recomputeOrderFinancial(tx, p.orderId);
  if (p.provider !== 'manual') await enqueueJob(tx, { kind: 'refund.execute', tenantId: p.tenantId, key: `refund:${ref.id}`, payload: { refundId: ref.id }, maxAttempts: 5 });
  // gift-card payments are refunded straight back to the card (exactly once per refund)
  const [gm] = await tx<{ method: string | null; refId: string | null }[]>`select method, ref_id from payments where id = ${p.id}`;
  if (gm?.method === 'gift_card' && gm.refId) {
    const ins = await tx`insert into gift_card_entries (tenant_id, gift_card_id, kind, amount_minor, ref_type, ref_id, actor_user_id)
                         values (${p.tenantId}, ${gm.refId}, 'refund', ${r.amountMinor}, 'refund', ${ref.id}, ${r.requestedBy}) on conflict do nothing returning id`;
    if (ins.length) {
      await tx`update gift_cards set balance_minor = least(initial_minor, balance_minor + ${r.amountMinor}), status = case when status = 'redeemed' then 'active' else status end where id = ${gm.refId}`;
      await finalizeRefund(tx, ref.id, `giftcard:${gm.refId}`, r.requestedBy);
    }
  }
  await audit(tx, { actorUserId: r.requestedBy, actorKind: r.requestedBy ? 'user' : 'system', tenantId: p.tenantId, action: 'refund.requested', targetType: 'refund', targetId: ref.id, metadata: { amountMinor: r.amountMinor, reason: r.reason } });
  return ref;
}

/** Spread a booking refund over its succeeded payments (newest first). */
export async function requestBookingRefund(tx: Tx, bookingId: string, amountMinor: number, reason: string, requestedBy: string | null) {
  let left = amountMinor;
  const pays = await tx<{ id: string; amountMinor: number; refunded: number }[]>`
    select p.id, p.amount_minor, coalesce((select sum(amount_minor) from refunds r where r.payment_id = p.id and r.status in ('pending','processing','succeeded')), 0)::bigint as refunded
    from payments p where p.booking_id = ${bookingId} and p.status = 'succeeded' order by p.succeeded_at desc`;
  let n = 0;
  for (const p of pays) {
    if (left <= 0) break;
    const can = p.amountMinor - Number(p.refunded);
    const amt = Math.min(can, left);
    if (amt <= 0) continue;
    await createRefund(tx, { paymentId: p.id, amountMinor: amt, reason, requestedBy, idempotencyKey: `bk:${bookingId}:${reason}:${n++}`, termsBasis: { bookingId } });
    left -= amt;
  }
}

/** Retained cancellation / no-show fee: recognize the kept portion of held money once. */
export async function retainedRevenue(tx: Tx, bookingId: string, amountMinor: number, actorUserId: string | null) {
  if (amountMinor <= 0) return;
  const [b] = await tx<{ tenantId: string }[]>`select tenant_id from bookings where id = ${bookingId}`;
  await postOnce(tx, { tenantId: b.tenantId, refType: 'booking_fee_retained', refId: bookingId, memo: 'cancellation/no-show fee retained per booking terms', actorUserId, lines: [{ account: 'customer_deposits', debit: amountMinor }, { account: 'service_revenue', credit: amountMinor }] });
}

/** Manual refund requested from the finance screen (refunds.issue). Step-up checked by the route. */
export async function issueRefund(tx: Tx, ctx: TenantContext, input: { paymentId: string; amountMinor: number; reason: string; idempotencyKey: string }) {
  if (!ctx.caps.has('refunds.issue')) throw forbidden();
  return createRefund(tx, { paymentId: input.paymentId, amountMinor: input.amountMinor, reason: input.reason, requestedBy: ctx.user.userId, idempotencyKey: `manual:${input.idempotencyKey}` });
}

/** Mark a manual (cash) refund as paid out by staff. */
export async function completeManualRefund(tx: Tx, ctx: TenantContext, refundId: string, reference: string) {
  if (!ctx.caps.has('refunds.issue')) throw forbidden();
  const [r] = await tx<{ id: string; provider: string; status: string }[]>`select r.id, p.provider, r.status from refunds r join payments p on p.id = r.payment_id where r.id = ${refundId} for update of r`;
  if (!r) throw notFound('refund');
  if (r.provider !== 'manual' || r.status !== 'pending') throw new AppError('invalid_transition', 'errors.invalid_transition');
  await finalizeRefund(tx, refundId, `manual:${reference}`, ctx.user.userId);
}

async function finalizeRefund(tx: Tx, refundId: string, providerRefundId: string, actorUserId: string | null) {
  const [r] = await tx<{ id: string; tenantId: string; paymentId: string; amountMinor: number; status: string }[]>`select * from refunds where id = ${refundId} for update`;
  if (r.status === 'succeeded') return;
  const [p] = await tx<{ bookingId: string | null; orderId: string | null; provider: string; method: string | null }[]>`select booking_id, order_id, provider, method from payments where id = ${r.paymentId} for update`;
  await tx`update refunds set status = 'succeeded', provider_refund_id = ${providerRefundId}, completed_at = now(), updated_at = now() where id = ${refundId}`;
  await tx`update payments set refunded_minor = refunded_minor + ${r.amountMinor} where id = ${r.paymentId}`;
  // where did the money sit? before recognition → liability; after → contra revenue
  const recognized = p.bookingId
    ? (await tx`select 1 from financial_entries where ref_type in ('service_completed','booking_fee_retained') and ref_id = ${p.bookingId} limit 1`).length > 0
    : (await tx`select 1 from orders where id = ${p.orderId} and status = 'collected'`).length > 0;
  const cashAccount = p.method === 'gift_card' ? 'gift_card_liability' : p.provider === 'manual' ? (p.method === 'cash' ? 'cash' : 'card_clearing') : 'provider_clearing';
  await post(tx, { tenantId: r.tenantId, refType: 'refund', refId: refundId, memo: 'refund paid', actorUserId, lines: [{ account: recognized ? 'refunds' : 'customer_deposits', debit: r.amountMinor }, { account: cashAccount, credit: r.amountMinor }] });
  if (p.bookingId) {
    await recomputeBookingFinancial(tx, p.bookingId);
    const { reverseForRefund } = await import('../services/loyalty');
    await reverseForRefund(tx, p.bookingId);
  }
  if (p.orderId) await recomputeOrderFinancial(tx, p.orderId);
}

registerJob('refund.execute', async (job, tx) => {
  const refundId = String(job.payload.refundId);
  const [r] = await tx<{ id: string; status: string; amountMinor: number; paymentId: string; idempotencyKey: string }[]>`select * from refunds where id = ${refundId} for update`;
  if (!r || r.status === 'succeeded' || r.status === 'cancelled') return { skipped: true };
  const [p] = await tx<{ providerPaymentId: string; provider: string; paymentAccountId: string }[]>`select provider_payment_id, provider, payment_account_id from payments where id = ${r.paymentId}`;
  const [a] = await tx<{ secretCiphertext: string }[]>`select secret_ciphertext from payment_accounts where id = ${p.paymentAccountId}`;
  await tx`update refunds set status = 'processing', updated_at = now() where id = ${refundId}`;
  // provider refund is idempotent by our refund id (no blind duplicate refunds on retry)
  const res = await providerByName(p.provider).refund(p.providerPaymentId, r.amountMinor, decryptSecret(a.secretCiphertext), r.idempotencyKey);
  if (res.status === 'succeeded') await finalizeRefund(tx, refundId, res.providerRefundId, null);
  else if (res.status === 'failed') await tx`update refunds set status = 'failed', failure_reason = 'provider_failed', updated_at = now() where id = ${refundId}`;
  else await tx`update refunds set provider_refund_id = ${res.providerRefundId}, updated_at = now() where id = ${refundId}`;
  return { status: res.status };
});

/**
 * Reconciliation: finds payments that succeeded but whose booking/order did
 * not advance (e.g. app update failed after provider success) and re-applies.
 */
export async function reconcilePayments(tx: Tx) {
  const stuck = await tx<{ id: string; bookingId: string | null; orderId: string | null }[]>`
    select p.id, p.booking_id, p.order_id from payments p
    left join bookings b on b.id = p.booking_id left join orders o on o.id = p.order_id
    where p.status = 'succeeded' and p.provider <> 'manual'
      and ((p.booking_id is not null and b.status in ('held','pending_payment','expired') and b.paid_minor < p.amount_minor)
        or (p.order_id is not null and o.status = 'pending_payment'))
    limit 100`;
  const out: string[] = [];
  for (const s of stuck) {
    if (s.bookingId) out.push(await onBookingPaid(tx, s.bookingId, s.id));
    else if (s.orderId) out.push(await onOrderPaid(tx, s.orderId, s.id));
  }
  return { checked: stuck.length, outcomes: out };
}

/** Sandbox helper: emit a signed provider event exactly as the sandbox "provider" would. */
export async function sandboxEmit(paymentId: string, outcome: 'succeeded' | 'failed', opts: { eventId?: string; amountMinor?: number; currency?: string; ts?: number } = {}) {
  if (isProduction()) throw new AppError('unavailable', 'errors.payments_unavailable');
  const p = await withSystem('sandbox emit', async (tx) => {
    const [row] = await tx<{ providerPaymentId: string; amountMinor: number; currency: string; accountId: string; webhookSecret: string }[]>`
      select p.provider_payment_id, p.amount_minor, p.currency, a.id as account_id, a.webhook_secret_ciphertext as webhook_secret
      from payments p join payment_accounts a on a.id = p.payment_account_id where p.id = ${paymentId} and p.provider = 'sandbox'`;
    return row;
  });
  if (!p) throw notFound('payment');
  const body = JSON.stringify({
    id: opts.eventId ?? `evt_${randomUUID()}`,
    type: outcome === 'succeeded' ? 'payment.succeeded' : 'payment.failed',
    data: { id: p.providerPaymentId, status: outcome, amount: opts.amountMinor ?? p.amountMinor, currency: opts.currency ?? p.currency, account: p.accountId },
  });
  const ts = opts.ts ?? Math.floor(Date.now() / 1000);
  const headers = new Headers({ 'x-sandbox-signature': `t=${ts},v1=${sandboxSign(body, decryptSecret(p.webhookSecret), ts)}` });
  return { body, headers };
}
