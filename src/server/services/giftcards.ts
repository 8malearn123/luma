import { z } from 'zod';
import type { Tx } from '../db';
import { AppError, forbidden, notFound } from '../errors';
import { audit } from '../audit';
import { decryptSecret, encryptSecret, hmac, humanCode } from '../crypto';
import { post } from '../finance/journal';
import { rateLimit } from '../rate-limit';
import type { TenantContext } from '../tenancy/context';
import { entitlements, requireFeature } from '../tenancy/plan';

/**
 * Gift cards. Codes are high-entropy (16 Crockford base32 chars ≈ 80 bits),
 * shown exactly once, stored only as an HMAC hash + last 4. The balance
 * column is a cache of gift_card_entries maintained in the same transaction
 * (CHECK 0 ≤ balance ≤ initial). Redemption is exactly-once per reference.
 *
 * Accounting: a sold card is a liability (gift_card_liability). Redeeming moves
 * the value to the booking/order as a payment (method 'gift_card') which is then
 * recognized like any other payment. Complimentary cards carry no liability;
 * their redemption posts to `discounts`.
 */
export const TEMPLATES = ['classic', 'floral', 'minimal'] as const;
export type TemplateKey = (typeof TEMPLATES)[number];

const normalize = (code: string) => code.toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
export const codeHash = (code: string) => hmac(`giftcard|${normalize(code)}`);

export const issueInput = z.object({
  amountMinor: z.number().int().min(1000).max(10_000_000),
  templateKey: z.enum(TEMPLATES).default('classic'),
  recipientName: z.string().trim().max(80).optional(),
  message: z.string().trim().max(300).optional(),
  expiresInDays: z.number().int().min(30).max(1095).nullable().default(365),
  purchaserCustomerId: z.string().uuid().nullable().optional(),
  // either sold on-site (cash/terminal with a reference) or complimentary
  sale: z.object({ method: z.enum(['cash', 'card_terminal']), reference: z.string().trim().min(1).max(80) }).nullable().default(null),
  complimentary: z.boolean().default(false),
});

async function ensureFeature(tx: Tx, tenantId: string) {
  requireFeature(await entitlements(tx, tenantId), 'giftcards.enabled');
}

/** Staff issuance. Returns the full code ONCE; it is never retrievable again. */
export async function issueGiftCard(tx: Tx, ctx: TenantContext, input: z.infer<typeof issueInput>) {
  if (!ctx.caps.has('loyalty.manage')) throw forbidden();
  await ensureFeature(tx, ctx.tenant.id);
  if (!input.sale && !input.complimentary) throw new AppError('validation', 'errors.giftcard_sale_or_comp');
  if (input.sale && input.complimentary) throw new AppError('validation', 'errors.giftcard_sale_or_comp');
  const code = humanCode(4, 4);
  const expires = input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86400000) : null;
  const [g] = await tx<{ id: string }[]>`
    insert into gift_cards (tenant_id, code_hash, code_last4, initial_minor, balance_minor, status, template_key, recipient_name, message,
                            purchaser_customer_id, expires_at, activated_at, issued_by, complimentary)
    values (${ctx.tenant.id}, ${codeHash(code)}, ${normalize(code).slice(-4)}, ${input.amountMinor}, ${input.amountMinor}, 'active',
            ${input.templateKey}, ${input.recipientName ?? null}, ${input.message ?? null}, ${input.purchaserCustomerId ?? null}, ${expires}, now(),
            ${ctx.user.userId}, ${input.complimentary})
    returning id`;
  await tx`insert into gift_card_entries (tenant_id, gift_card_id, kind, amount_minor, ref_type, ref_id, actor_user_id)
           values (${ctx.tenant.id}, ${g.id}, 'issue', ${input.amountMinor}, 'gift_card', ${g.id}, ${ctx.user.userId})`;
  if (input.sale) {
    await post(tx, {
      tenantId: ctx.tenant.id,
      refType: 'gift_card_sale',
      refId: g.id,
      memo: `gift card sold on-site ${input.sale.reference}`,
      actorUserId: ctx.user.userId,
      lines: [{ account: input.sale.method === 'cash' ? 'cash' : 'card_clearing', debit: input.amountMinor }, { account: 'gift_card_liability', credit: input.amountMinor }],
    });
  }
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: 'giftcard.issued', targetType: 'gift_card', targetId: g.id, requestId: ctx.requestId, metadata: { amountMinor: input.amountMinor, complimentary: input.complimentary, last4: normalize(code).slice(-4) } });
  return { id: g.id, code, last4: normalize(code).slice(-4) };
}

/**
 * Online purchase, step 1: create a PENDING card linked to a payment. The code
 * is generated now and kept encrypted until the purchaser reveals it once.
 */
export async function createPendingPurchase(tx: Tx, tenantId: string, purchaser: { userId: string; tenantCustomerId: string }, input: { amountMinor: number; templateKey: TemplateKey; recipientName?: string; message?: string }) {
  await ensureFeature(tx, tenantId);
  if (input.amountMinor < 1000 || input.amountMinor > 10_000_000) throw new AppError('validation', 'errors.amount_invalid');
  const code = humanCode(4, 4);
  const [g] = await tx<{ id: string }[]>`
    insert into gift_cards (tenant_id, code_hash, code_last4, code_ciphertext, initial_minor, balance_minor, status, template_key, recipient_name, message,
                            purchaser_customer_id, purchaser_user_id, expires_at)
    values (${tenantId}, ${codeHash(code)}, ${normalize(code).slice(-4)}, ${encryptSecret(code)}, ${input.amountMinor}, ${input.amountMinor}, 'pending',
            ${input.templateKey}, ${input.recipientName ?? null}, ${input.message ?? null}, ${purchaser.tenantCustomerId}, ${purchaser.userId},
            now() + interval '365 days')
    returning id`;
  return { giftCardId: g.id };
}

/**
 * Online purchase, step 2 (call after the payment succeeded): activate the card.
 * Idempotent. The payment must be a succeeded 'gift_card' payment for this card.
 */
export async function issueOnPayment(tx: Tx, paymentId: string) {
  const [p] = await tx<{ tenantId: string; purpose: string; status: string; refId: string | null; amountMinor: number }[]>`
    select tenant_id, purpose, status, ref_id, amount_minor from payments where id = ${paymentId}`;
  if (!p || p.purpose !== 'gift_card' || !p.refId) throw notFound('payment');
  if (p.status !== 'succeeded') throw new AppError('invalid_transition', 'errors.payment_required');
  const [g] = await tx<{ id: string; status: string; initialMinor: number }[]>`select id, status, initial_minor from gift_cards where id = ${p.refId} for update`;
  if (!g) throw notFound('gift_card');
  if (g.status !== 'pending') return { id: g.id, activated: false };
  if (g.initialMinor !== p.amountMinor) throw new AppError('conflict', 'errors.amount_mismatch');
  await tx`update gift_cards set status = 'active', activated_at = now() where id = ${g.id}`;
  await tx`insert into gift_card_entries (tenant_id, gift_card_id, kind, amount_minor, ref_type, ref_id)
           values (${p.tenantId}, ${g.id}, 'issue', ${g.initialMinor}, 'payment', ${paymentId}) on conflict do nothing`;
  // the payment was booked to customer_deposits; reclassify as gift card liability
  await post(tx, { tenantId: p.tenantId, refType: 'gift_card_sale', refId: g.id, memo: 'gift card sold online', lines: [{ account: 'customer_deposits', debit: g.initialMinor }, { account: 'gift_card_liability', credit: g.initialMinor }] });
  return { id: g.id, activated: true };
}

/** Purchaser reveals the code of an online-bought card exactly once. */
export async function revealPurchasedCode(tx: Tx, userId: string, giftCardId: string) {
  const [g] = await tx<{ codeCiphertext: string | null; purchaserUserId: string | null; status: string }[]>`
    select code_ciphertext, purchaser_user_id, status from gift_cards where id = ${giftCardId} for update`;
  if (!g || g.purchaserUserId !== userId) throw notFound('gift_card');
  if (g.status !== 'active') throw new AppError('invalid_transition', 'errors.giftcard_not_active');
  if (!g.codeCiphertext) throw new AppError('invalid_transition', 'errors.giftcard_already_revealed');
  const code = decryptSecret(g.codeCiphertext);
  await tx`update gift_cards set code_ciphertext = null, code_revealed_at = now() where id = ${giftCardId}`;
  return { code };
}

interface CardRow {
  id: string;
  tenantId: string;
  balanceMinor: number;
  initialMinor: number;
  status: string;
  expiresAt: Date | null;
  codeLast4: string;
  complimentary: boolean;
}

async function byCode(tx: Tx, code: string, lock = false): Promise<CardRow | undefined> {
  const h = codeHash(code);
  const rows = lock
    ? await tx<CardRow[]>`select id, tenant_id, balance_minor, initial_minor, status, expires_at, code_last4, complimentary from gift_cards where code_hash = ${h} for update`
    : await tx<CardRow[]>`select id, tenant_id, balance_minor, initial_minor, status, expires_at, code_last4, complimentary from gift_cards where code_hash = ${h}`;
  return rows[0];
}

/** Balance lookup by code — rate-limited per caller to resist guessing. */
export async function lookupBalance(tx: Tx, code: string, callerKey: string) {
  await rateLimit(`gc-lookup:${callerKey}`, 10, 10 * 60);
  const g = await byCode(tx, code);
  if (!g) throw notFound('gift_card');
  const expired = g.expiresAt && g.expiresAt <= new Date();
  return { last4: g.codeLast4, balanceMinor: expired ? 0 : g.balanceMinor, status: expired ? 'expired' : g.status, expiresAt: g.expiresAt };
}

/**
 * Partial or full redemption against a booking/order. Exactly once per
 * (card, ref): replays return the original result. Creates a 'gift_card'
 * payment so the booking/order financial status reflects it.
 */
export async function redeemGiftCard(
  tx: Tx,
  actor: { tenantId: string; userId: string | null; callerKey: string },
  code: string,
  amountMinor: number,
  ref: { bookingId?: string; orderId?: string },
) {
  await rateLimit(`gc-redeem:${actor.callerKey}`, 20, 10 * 60);
  if (amountMinor <= 0) throw new AppError('validation', 'errors.amount_invalid');
  const refType = ref.bookingId ? 'booking' : 'order';
  const refId = ref.bookingId ?? ref.orderId;
  if (!refId) throw new AppError('validation', 'errors.validation');
  const g = await byCode(tx, code, true);
  if (!g) throw notFound('gift_card');
  const [prior] = await tx<{ amountMinor: number }[]>`
    select amount_minor from gift_card_entries where gift_card_id = ${g.id} and kind = 'redeem' and ref_type = ${refType} and ref_id = ${refId}`;
  if (prior) return { giftCardId: g.id, appliedMinor: -prior.amountMinor, balanceMinor: g.balanceMinor, replay: true };
  if (g.status !== 'active') throw new AppError('validation', 'errors.giftcard_not_active');
  if (g.expiresAt && g.expiresAt <= new Date()) throw new AppError('validation', 'errors.giftcard_expired');
  if (g.balanceMinor <= 0) throw new AppError('validation', 'errors.giftcard_empty');

  // never apply more than the card balance or the outstanding amount
  let outstanding: number;
  if (ref.bookingId) {
    const [b] = await tx<{ totalMinor: number; paidMinor: number; status: string }[]>`select total_minor, paid_minor, status from bookings where id = ${ref.bookingId} for update`;
    if (!b || ['cancelled', 'expired', 'no_show'].includes(b.status)) throw new AppError('invalid_transition', 'errors.invalid_transition');
    outstanding = b.totalMinor - b.paidMinor;
  } else {
    const [o] = await tx<{ totalMinor: number; paidMinor: number; status: string }[]>`select total_minor, paid_minor, status from orders where id = ${ref.orderId!} for update`;
    if (!o || o.status === 'cancelled') throw new AppError('invalid_transition', 'errors.invalid_transition');
    outstanding = o.totalMinor - o.paidMinor;
  }
  const apply = Math.min(amountMinor, g.balanceMinor, outstanding);
  if (apply <= 0) throw new AppError('validation', 'errors.nothing_to_pay');

  await tx`update gift_cards set balance_minor = balance_minor - ${apply}, status = case when balance_minor - ${apply} = 0 then 'redeemed' else status end where id = ${g.id}`;
  await tx`insert into gift_card_entries (tenant_id, gift_card_id, kind, amount_minor, ref_type, ref_id, actor_user_id)
           values (${g.tenantId}, ${g.id}, 'redeem', ${-apply}, ${refType}, ${refId}, ${actor.userId})`;
  const [pay] = await tx<{ id: string }[]>`
    insert into payments (tenant_id, purpose, booking_id, order_id, ref_id, kind, method, amount_minor, status, provider, collection_ref, idempotency_key, succeeded_at)
    values (${g.tenantId}, ${refType}, ${ref.bookingId ?? null}, ${ref.orderId ?? null}, ${g.id}, 'balance', 'gift_card', ${apply}, 'succeeded', 'manual',
            ${`GC-${g.codeLast4}`}, ${`gc:${g.id}:${refType}:${refId}`}, now())
    returning id`;
  await post(tx, {
    tenantId: g.tenantId,
    refType: 'payment',
    refId: pay.id,
    memo: `gift card ••••${g.codeLast4}`,
    actorUserId: actor.userId,
    lines: [{ account: g.complimentary ? 'discounts' : 'gift_card_liability', debit: apply }, { account: 'customer_deposits', credit: apply }],
  });
  const { recomputeBookingFinancial } = await import('../payments/service');
  if (ref.bookingId) await recomputeBookingFinancial(tx, ref.bookingId);
  else {
    await tx`update orders set paid_minor = (select coalesce(sum(amount_minor), 0) from payments where order_id = ${ref.orderId!} and status = 'succeeded') where id = ${ref.orderId!}`;
  }
  return { giftCardId: g.id, appliedMinor: apply, balanceMinor: g.balanceMinor - apply, paymentId: pay.id, replay: false };
}

/** Return value to the card (e.g. refund of a booking paid by gift card). Exactly once per ref. */
export async function refundToCard(tx: Tx, ctx: TenantContext, giftCardId: string, amountMinor: number, ref: { refType: string; refId: string }) {
  if (!ctx.caps.has('refunds.issue') && !ctx.caps.has('loyalty.manage')) throw forbidden();
  const [g] = await tx<CardRow[]>`select id, tenant_id, balance_minor, initial_minor, status, complimentary, code_last4, expires_at from gift_cards where id = ${giftCardId} for update`;
  if (!g) throw notFound('gift_card');
  if (g.status === 'void') throw new AppError('invalid_transition', 'errors.invalid_transition');
  if (amountMinor <= 0 || g.balanceMinor + amountMinor > g.initialMinor) throw new AppError('validation', 'errors.refund_exceeds');
  const ins = await tx`insert into gift_card_entries (tenant_id, gift_card_id, kind, amount_minor, ref_type, ref_id, actor_user_id)
                       values (${g.tenantId}, ${g.id}, 'refund', ${amountMinor}, ${ref.refType}, ${ref.refId}, ${ctx.user.userId})
                       on conflict do nothing returning id`;
  if (!ins.length) return { replay: true };
  await tx`update gift_cards set balance_minor = balance_minor + ${amountMinor}, status = 'active' where id = ${g.id}`;
  await post(tx, { tenantId: g.tenantId, refType: 'gift_card_refund', refId: ins[0].id as string, memo: `refund to gift card ••••${g.codeLast4}`, actorUserId: ctx.user.userId, lines: [{ account: 'customer_deposits', debit: amountMinor }, { account: g.complimentary ? 'discounts' : 'gift_card_liability', credit: amountMinor }] });
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: g.tenantId, action: 'giftcard.refunded', targetType: 'gift_card', targetId: g.id, requestId: ctx.requestId, metadata: { amountMinor } });
  return { replay: false };
}

export async function voidGiftCard(tx: Tx, ctx: TenantContext, id: string, reason: string) {
  if (!ctx.caps.has('loyalty.manage')) throw forbidden();
  if (!reason.trim()) throw new AppError('validation', 'errors.reason_required');
  const [g] = await tx<{ balanceMinor: number; status: string; complimentary: boolean; tenantId: string }[]>`select balance_minor, status, complimentary, tenant_id from gift_cards where id = ${id} for update`;
  if (!g) throw notFound('gift_card');
  if (g.status === 'void') throw new AppError('invalid_transition', 'errors.invalid_transition');
  await tx`update gift_cards set status = 'void', balance_minor = 0, code_ciphertext = null where id = ${id}`;
  if (g.balanceMinor > 0) await tx`insert into gift_card_entries (tenant_id, gift_card_id, kind, amount_minor, ref_type, ref_id, actor_user_id) values (${g.tenantId}, ${id}, 'void', ${-g.balanceMinor}, 'gift_card', ${id}, ${ctx.user.userId})`;
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: g.tenantId, action: 'giftcard.voided', targetType: 'gift_card', targetId: id, requestId: ctx.requestId, reason });
}

/** Expiry job: zero out expired cards (ledger entry), idempotent. Liability breakage is not auto-recognized (documented policy decision). */
export async function expireGiftCards(tx: Tx) {
  const rows = await tx<{ id: string; tenantId: string; balanceMinor: number }[]>`
    update gift_cards set status = 'expired' where status in ('active','pending') and expires_at is not null and expires_at <= now()
    returning id, tenant_id, balance_minor`;
  for (const r of rows) {
    if (r.balanceMinor > 0) {
      await tx`insert into gift_card_entries (tenant_id, gift_card_id, kind, amount_minor, ref_type, ref_id) values (${r.tenantId}, ${r.id}, 'expire', ${-r.balanceMinor}, 'gift_card', ${r.id}) on conflict do nothing`;
      await tx`update gift_cards set balance_minor = 0 where id = ${r.id}`;
    }
  }
  return { expired: rows.length };
}

/** Report listing: never includes codes or ciphertext. */
export async function listGiftCards(tx: Tx, opts: { status?: string } = {}) {
  return tx`select id, code_last4, initial_minor, balance_minor, status, template_key, recipient_name, expires_at, activated_at, complimentary, created_at
            from gift_cards where (${opts.status ?? null}::text is null or status = ${opts.status ?? null}) order by created_at desc limit 200`;
}

export async function giftCardHistory(tx: Tx, id: string) {
  const [g] = await tx`select id, code_last4, initial_minor, balance_minor, status, template_key, recipient_name, message, expires_at, complimentary, created_at from gift_cards where id = ${id}`;
  if (!g) throw notFound('gift_card');
  const entries = await tx`select kind, amount_minor, ref_type, created_at from gift_card_entries where gift_card_id = ${id} order by created_at`;
  return { card: g, entries };
}
