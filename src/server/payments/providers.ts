import { createHmac } from 'node:crypto';
import { env, isProduction } from '../env';
import { AppError } from '../errors';
import { safeEqual } from '../crypto';

/**
 * Payment provider adapters. LUMA never sees card numbers: customers pay on
 * the provider's hosted page. Browser redirects are NEVER trusted — payment
 * state changes only through verified provider events or server-side fetches.
 *
 * - sandbox: local simulated hosted checkout + HMAC-signed webhooks.
 *   Development/review only; refused in production. Moves no money.
 * - moyasar: adapter written against Moyasar's documented REST API
 *   (invoices, payments, refunds; webhooks carry a shared `secret_token`).
 *   NOT live-tested in this environment (no network access / no keys).
 *   Because the webhook has no body signature, events are treated only as a
 *   hint: the payment is re-fetched from the API and matched before applying.
 */
export interface CheckoutRequest {
  paymentId: string;
  amountMinor: number;
  currency: string;
  description: string;
  returnUrl: string;
  methods: string[];
  idempotencyKey: string;
}

export interface ProviderPayment {
  providerPaymentId: string;
  status: 'pending' | 'succeeded' | 'failed' | 'cancelled';
  amountMinor: number;
  currency: string;
  accountRef?: string | null;
  method?: string | null;
}

export interface VerifiedEvent {
  eventId: string;
  type: string;
  providerPaymentId: string | null;
  providerRefundId?: string | null;
  status: ProviderPayment['status'] | 'refunded' | 'refund_failed';
  amountMinor: number | null;
  currency: string | null;
  accountRef: string | null;
  /** true when the payload itself is authoritative (signed); false = re-fetch required */
  authoritative: boolean;
}

export interface PaymentProvider {
  name: 'sandbox' | 'moyasar';
  createCheckout(req: CheckoutRequest, secret: string, accountRef: string): Promise<{ providerPaymentId: string; checkoutUrl: string }>;
  fetchPayment(providerPaymentId: string, secret: string): Promise<ProviderPayment>;
  refund(providerPaymentId: string, amountMinor: number, secret: string, idempotencyKey: string): Promise<{ providerRefundId: string; status: 'succeeded' | 'pending' | 'failed' }>;
  verifyWebhook(rawBody: string, headers: Headers, webhookSecret: string, now?: number): VerifiedEvent;
}

// ─────────────────────────────────────────────────────────────
// Sandbox
// ─────────────────────────────────────────────────────────────
export const SANDBOX_TOLERANCE_SEC = 300;

export function sandboxSign(body: string, secret: string, ts: number): string {
  return createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
}

export const sandbox: PaymentProvider = {
  name: 'sandbox',
  async createCheckout(req) {
    if (isProduction() || !env().PAYMENTS_SANDBOX_ENABLED) throw new AppError('unavailable', 'errors.payments_unavailable');
    // provider-side id is derived from our id; the sandbox "hosted page" is served by this app
    return { providerPaymentId: `sbx_${req.paymentId.replace(/-/g, '')}`, checkoutUrl: `/sandbox/checkout/${req.paymentId}` };
  },
  async fetchPayment() {
    // The sandbox has no remote state; truth arrives only via signed events.
    throw new AppError('unavailable', 'errors.provider_fetch_unsupported');
  },
  async refund(providerPaymentId, amountMinor) {
    if (isProduction()) throw new AppError('unavailable', 'errors.payments_unavailable');
    return { providerRefundId: `sbxr_${providerPaymentId.slice(4, 20)}_${amountMinor}_${Date.now().toString(36)}`, status: 'succeeded' };
  },
  verifyWebhook(rawBody, headers, secret, now = Date.now()) {
    const sig = headers.get('x-sandbox-signature') ?? '';
    const m = /^t=(\d+),v1=([a-f0-9]{64})$/.exec(sig);
    if (!m) throw new AppError('unauthenticated', 'errors.webhook_signature');
    const ts = Number(m[1]);
    if (Math.abs(now / 1000 - ts) > SANDBOX_TOLERANCE_SEC) throw new AppError('unauthenticated', 'errors.webhook_stale');
    const expected = sandboxSign(rawBody, secret, ts);
    if (!safeEqual(Buffer.from(expected), Buffer.from(m[2]))) throw new AppError('unauthenticated', 'errors.webhook_signature');
    const e = JSON.parse(rawBody) as { id: string; type: string; data: { id: string; status: string; amount: number; currency: string; account: string; refund_id?: string } };
    return {
      eventId: e.id,
      type: e.type,
      providerPaymentId: e.data.id,
      providerRefundId: e.data.refund_id ?? null,
      status: e.data.status as VerifiedEvent['status'],
      amountMinor: e.data.amount,
      currency: e.data.currency,
      accountRef: e.data.account,
      authoritative: true,
    };
  },
};

// ─────────────────────────────────────────────────────────────
// Moyasar (untested adapter)
// ─────────────────────────────────────────────────────────────
const basic = (secret: string) => `Basic ${Buffer.from(`${secret}:`).toString('base64')}`;
async function moyasarFetch(path: string, secret: string, init: RequestInit = {}) {
  const res = await fetch(`${env().MOYASAR_API_BASE}${path}`, {
    ...init,
    headers: { authorization: basic(secret), 'content-type': 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new AppError('unavailable', 'errors.provider_error', { status: res.status });
  return res.json() as Promise<Record<string, unknown>>;
}
const mapMoyasarStatus = (s: string): ProviderPayment['status'] =>
  s === 'paid' || s === 'captured' ? 'succeeded' : s === 'failed' ? 'failed' : s === 'voided' || s === 'canceled' ? 'cancelled' : 'pending';

export const moyasar: PaymentProvider = {
  name: 'moyasar',
  async createCheckout(req, secret) {
    if (!env().MOYASAR_ENABLED) throw new AppError('unavailable', 'errors.payments_unavailable');
    const inv = await moyasarFetch('/invoices', secret, {
      method: 'POST',
      body: JSON.stringify({
        amount: req.amountMinor,
        currency: req.currency,
        description: req.description.slice(0, 250),
        callback_url: `${env().APP_BASE_URL}${req.returnUrl}`,
        metadata: { luma_payment_id: req.paymentId },
      }),
    });
    return { providerPaymentId: String(inv.id), checkoutUrl: String(inv.url) };
  },
  async fetchPayment(id, secret) {
    const p = await moyasarFetch(`/payments/${encodeURIComponent(id)}`, secret);
    return { providerPaymentId: String(p.id), status: mapMoyasarStatus(String(p.status)), amountMinor: Number(p.amount), currency: String(p.currency), method: (p.source as { type?: string } | undefined)?.type ?? null };
  },
  async refund(id, amountMinor, secret) {
    const r = await moyasarFetch(`/payments/${encodeURIComponent(id)}/refund`, secret, { method: 'POST', body: JSON.stringify({ amount: amountMinor }) });
    return { providerRefundId: `${r.id}:${r.refunded ?? amountMinor}`, status: String(r.status) === 'refunded' ? 'succeeded' : 'pending' };
  },
  verifyWebhook(rawBody, _headers, webhookSecret) {
    const e = JSON.parse(rawBody) as { id: string; type: string; secret_token?: string; data?: { id?: string; status?: string; amount?: number; currency?: string } };
    if (!e.secret_token || !safeEqual(Buffer.from(e.secret_token), Buffer.from(webhookSecret))) throw new AppError('unauthenticated', 'errors.webhook_signature');
    return {
      eventId: e.id,
      type: e.type,
      providerPaymentId: e.data?.id ?? null,
      status: mapMoyasarStatus(e.data?.status ?? ''),
      amountMinor: e.data?.amount ?? null,
      currency: e.data?.currency ?? null,
      accountRef: null,
      authoritative: false,
    };
  },
};

export function providerByName(name: string): PaymentProvider {
  if (name === 'sandbox') return sandbox;
  if (name === 'moyasar') return moyasar;
  throw new AppError('unavailable', 'errors.payments_unavailable');
}

/** Methods each provider can actually offer (subset shown only if the business enabled them). */
export const PROVIDER_METHODS: Record<string, string[]> = {
  sandbox: ['sandbox_card'],
  // Per Moyasar documentation: mada, credit cards, Apple Pay, STC Pay. Tabby/Tamara are separate BNPL providers (not integrated).
  moyasar: ['mada', 'creditcard', 'applepay', 'stcpay'],
};
