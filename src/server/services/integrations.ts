import type { Tx } from '../db';
import { aiStatus } from '../ai/provider';
import { checkBudget } from '../ai/run';
import { env, isProduction } from '../env';
import { providerStatus } from './messages';
import { paymentConnections } from '../payments/connect';
import { realtimeStats } from '../realtime';
import type { TenantContext } from '../tenancy/context';

/**
 * One honest status page for a business: what is connected, what is simulated,
 * what is waiting for an external account/key. Never returns a secret.
 */
export async function integrationsOverview(tx: Tx, ctx: TenantContext) {
  const ai = await aiStatus(tx);
  const budget = await checkBudget(tx, ctx.tenant.id);
  const period = `${new Date().toISOString().slice(0, 7)}-01`;
  const [usage] = await tx<{ runs: number; tokensIn: number; tokensOut: number; costMicroUsd: number }[]>`
    select runs, tokens_in, tokens_out, cost_micro_usd from ai_usage where tenant_id = ${ctx.tenant.id} and period = ${period}`;
  const recentAi = await tx`select purpose, status, error_code, provider, model, latency_ms, created_at from ai_runs order by created_at desc limit 10`;
  const pay = await paymentConnections(tx);
  const [fs] = await tx<{ taxRegistered: boolean; sellerVatNumber: string | null; einvoicingStatus: string }[]>`select tax_registered, seller_vat_number, einvoicing_status from finance_settings`;
  const [inv] = await tx<{ n: number; withQr: number }[]>`select count(*)::int as n, count(*) filter (where qr_tlv is not null)::int as with_qr from invoices where issued_at > now() - interval '30 days'`;
  const [dl] = await tx<{ simulated: number }[]>`select count(*) filter (where status = 'simulated')::int as simulated from notification_deliveries where tenant_id = ${ctx.tenant.id} and created_at > now() - interval '30 days'`;
  const active = (pay.accounts as unknown as { provider: string; mode: string; status: string }[]).find((a) => a.status === 'active');
  return {
    deployment: env().LUMA_DEPLOYMENT,
    payments: {
      state: active ? (active.provider === 'sandbox' ? 'sandbox' : active.mode === 'live' ? 'live' : 'test') : 'disconnected',
      provider: active?.provider ?? null,
      sandboxAvailable: !isProduction() && env().PAYMENTS_SANDBOX_ENABLED,
      moyasarAdapterEnabled: pay.adapterEnabled,
      pending: (pay.accounts as unknown as { status: string }[]).filter((a) => a.status === 'pending_verification').length,
    },
    ai: {
      state: ai.status,
      provider: ai.provider,
      model: ai.model,
      lastSuccessAt: ai.lastSuccessAt,
      budget: budget.ok ? { included: true, remaining: budget.remaining } : { included: budget.code !== 'plan_not_included', remaining: 0, code: budget.code },
      usage: usage ?? { runs: 0, tokensIn: 0, tokensOut: 0, costMicroUsd: 0 },
      recent: recentAi,
    },
    messaging: { providers: providerStatus(), simulatedLast30: dl?.simulated ?? 0 },
    einvoicing: { state: fs?.einvoicingStatus ?? 'not_connected', taxRegistered: fs?.taxRegistered ?? false, vatNumberSet: !!fs?.sellerVatNumber, invoicesLast30: inv?.n ?? 0, withQrLast30: inv?.withQr ?? 0 },
    realtime: { transport: 'sse', fallback: 'polling_60s', ...realtimeStats() },
  };
}
