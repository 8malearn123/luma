import { z } from 'zod';
import type { Tx } from '../db';
import { AppError, forbidden, notFound } from '../errors';
import { audit } from '../audit';
import { encryptSecret, decryptSecret } from '../crypto';
import { env, isProduction } from '../env';
import { PROVIDER_METHODS } from './providers';
import type { TenantContext } from '../tenancy/context';

/**
 * Connecting a business's own Moyasar account.
 *
 *   enter keys ──► pending_verification ──(test ok)──► activate ──► active
 *
 * - Keys are entered by the business owner/manager with payments.configure and
 *   re-authentication (route). The secret key and webhook token are encrypted
 *   with LUMA_ENCRYPTION_KEY (AES-256-GCM) and NEVER returned to any browser;
 *   only a short hint (prefix + last 4) is shown.
 * - Mode comes from the key prefixes (pk_test_/sk_test_ vs pk_live_/sk_live_);
 *   mixed test/live keys are refused.
 * - "Test connection" makes one read-only authenticated call (list payments,
 *   page 1). In environments without network access to Moyasar or with
 *   MOYASAR_ENABLED=0 the result is recorded honestly as `unreachable`.
 * - Activation requires a successful test in the last 24 hours. LIVE keys can
 *   only be activated on the real production deployment AND when the platform
 *   explicitly allowed live payments (MOYASAR_LIVE_ALLOWED=1): no real money
 *   moves in development/review.
 * Not verified against the live Moyasar API from this environment.
 */
const PK = /^pk_(test|live)_[A-Za-z0-9]{16,80}$/;
const SK = /^sk_(test|live)_[A-Za-z0-9]{16,80}$/;

export const moyasarKeysInput = z.object({
  publishableKey: z.string().trim().regex(PK, 'errors.moyasar_publishable_invalid'),
  secretKey: z.string().trim().regex(SK, 'errors.moyasar_secret_invalid'),
  webhookSecret: z.string().trim().min(20, 'errors.webhook_secret_short').max(200),
  methods: z.array(z.enum(PROVIDER_METHODS.moyasar as [string, ...string[]])).min(1),
});

const hint = (k: string) => `${k.slice(0, 8)}…${k.slice(-4)}`;

export function webhookUrl() {
  return `${env().APP_BASE_URL}/api/v1/webhooks/payments/moyasar`;
}

export async function paymentConnections(tx: Tx) {
  const accounts = await tx`select id, provider, mode, status, methods_enabled, publishable_key, key_hint, last_test_at, last_test_result, last_test_detail,
                              verified_at, created_at, updated_at from payment_accounts where provider <> 'manual' order by created_at desc limit 20`;
  return {
    accounts,
    webhookUrl: webhookUrl(),
    adapterEnabled: env().MOYASAR_ENABLED,
    liveAllowed: isProduction() && env().MOYASAR_LIVE_ALLOWED,
    deployment: env().LUMA_DEPLOYMENT,
  };
}

export async function saveMoyasarKeys(tx: Tx, ctx: TenantContext, p: z.infer<typeof moyasarKeysInput>) {
  if (!ctx.caps.has('payments.configure')) throw forbidden();
  const pm = PK.exec(p.publishableKey)![1];
  const sm = SK.exec(p.secretKey)![1];
  if (pm !== sm) throw new AppError('validation', 'errors.moyasar_mode_mismatch', { field: 'secretKey' });
  const mode = pm as 'test' | 'live';
  await tx`update payment_accounts set status = 'disabled', updated_at = now() where provider = 'moyasar' and status = 'pending_verification'`;
  const [a] = await tx<{ id: string }[]>`
    insert into payment_accounts (tenant_id, provider, mode, status, publishable_key, secret_ciphertext, webhook_secret_ciphertext, methods_enabled, key_hint, configured_by)
    values (${ctx.tenant.id}, 'moyasar', ${mode}, 'pending_verification', ${p.publishableKey}, ${encryptSecret(p.secretKey)}, ${encryptSecret(p.webhookSecret)},
            ${p.methods}, ${hint(p.secretKey)}, ${ctx.user.userId}) returning id`;
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: 'payments.moyasar_keys_saved', targetType: 'payment_account', targetId: a.id, requestId: ctx.requestId, metadata: { mode, methods: p.methods } });
  return { id: a.id, mode, status: 'pending_verification' };
}

type TestResult = { result: 'ok' | 'failed' | 'unreachable'; detail: string };

/** One read-only authenticated request. Injected in tests. */
export type MoyasarProbe = (secretKey: string) => Promise<TestResult>;

export const defaultProbe: MoyasarProbe = async (secretKey) => {
  if (!env().MOYASAR_ENABLED) return { result: 'unreachable', detail: 'adapter_disabled' };
  try {
    const res = await fetch(`${env().MOYASAR_API_BASE}/payments?page=1`, {
      headers: { authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}` },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) return { result: 'ok', detail: `http_${res.status}` };
    if (res.status === 401 || res.status === 403) return { result: 'failed', detail: `http_${res.status}_unauthorized` };
    return { result: 'failed', detail: `http_${res.status}` };
  } catch (e) {
    return { result: 'unreachable', detail: (e as Error).name === 'TimeoutError' ? 'timeout' : 'network_error' };
  }
};

export async function testMoyasar(tx: Tx, ctx: TenantContext, accountId: string, probe: MoyasarProbe = defaultProbe) {
  if (!ctx.caps.has('payments.configure')) throw forbidden();
  const [a] = await tx<{ id: string; secretCiphertext: string; status: string }[]>`select id, secret_ciphertext, status from payment_accounts where id = ${accountId} and provider = 'moyasar' for update`;
  if (!a) throw notFound('payment_account');
  if (a.status === 'disabled') throw new AppError('invalid_transition', 'errors.invalid_transition');
  const r = await probe(decryptSecret(a.secretCiphertext));
  await tx`update payment_accounts set last_test_at = now(), last_test_result = ${r.result}, last_test_detail = ${r.detail.slice(0, 300)}, updated_at = now() where id = ${a.id}`;
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: 'payments.moyasar_tested', targetType: 'payment_account', targetId: a.id, requestId: ctx.requestId, metadata: { result: r.result, detail: r.detail } });
  return r;
}

export async function activateMoyasar(tx: Tx, ctx: TenantContext, accountId: string) {
  if (!ctx.caps.has('payments.configure')) throw forbidden();
  const [a] = await tx<{ id: string; mode: string; status: string; lastTestAt: Date | null; lastTestResult: string | null }[]>`
    select id, mode, status, last_test_at, last_test_result from payment_accounts where id = ${accountId} and provider = 'moyasar' for update`;
  if (!a) throw notFound('payment_account');
  if (a.status !== 'pending_verification') throw new AppError('invalid_transition', 'errors.invalid_transition');
  if (!env().MOYASAR_ENABLED) throw new AppError('unavailable', 'errors.moyasar_adapter_disabled');
  if (a.lastTestResult !== 'ok' || !a.lastTestAt || Date.now() - a.lastTestAt.getTime() > 24 * 3600000) throw new AppError('validation', 'errors.moyasar_test_required');
  if (a.mode === 'live' && !(isProduction() && env().MOYASAR_LIVE_ALLOWED)) throw new AppError('forbidden', 'errors.live_payments_not_allowed');
  await tx`update payment_accounts set status = 'disabled', updated_at = now() where tenant_id = ${ctx.tenant.id} and status = 'active'`;
  await tx`update payment_accounts set status = 'active', verified_at = now(), updated_at = now() where id = ${a.id}`;
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: 'payments.moyasar_activated', targetType: 'payment_account', targetId: a.id, requestId: ctx.requestId, metadata: { mode: a.mode } });
  return { status: 'active' };
}

export async function removeMoyasarDraft(tx: Tx, ctx: TenantContext, accountId: string) {
  if (!ctx.caps.has('payments.configure')) throw forbidden();
  const r = await tx`update payment_accounts set status = 'disabled', updated_at = now() where id = ${accountId} and provider = 'moyasar' and status = 'pending_verification' returning id`;
  if (!r.length) throw notFound('payment_account');
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: 'payments.moyasar_draft_removed', targetType: 'payment_account', targetId: accountId, requestId: ctx.requestId });
}
