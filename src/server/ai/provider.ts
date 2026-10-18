import { env } from '../env';
import { createOpenAiProvider } from './openai';
import type { AiProvider } from './types';
import type { Db } from '../db';

let testProvider: AiProvider | null = null;

/** Tests only. Throws outside NODE_ENV=test so fakes can never serve real users. */
export function setTestProvider(p: AiProvider | null) {
  if (process.env.NODE_ENV !== 'test') throw new Error('test provider is only available in tests');
  testProvider = p;
}

/** The configured provider, or null when AI is not configured (honest state). */
export function getProvider(): AiProvider | null {
  if (process.env.NODE_ENV === 'test' && testProvider) return testProvider;
  const e = env();
  if (e.AI_PROVIDER !== 'openai' || !e.OPENAI_API_KEY || !e.OPENAI_MODEL) return null;
  return createOpenAiProvider({ apiKey: e.OPENAI_API_KEY, model: e.OPENAI_MODEL, baseUrl: e.OPENAI_BASE_URL, timeoutMs: e.AI_TIMEOUT_MS });
}

export type AiStatus = 'not_configured' | 'configured_untested' | 'live_verified';

/**
 * not_configured      — no provider/key/model
 * configured_untested — configured, but no real (non-fake) successful call recorded yet
 * live_verified       — at least one real successful call with this provider+model is recorded
 */
export async function aiStatus(db: Db): Promise<{ status: AiStatus; provider: string | null; model: string | null; lastSuccessAt: Date | null }> {
  const p = getProvider();
  if (!p) return { status: 'not_configured', provider: null, model: null, lastSuccessAt: null };
  if (p.isFake) return { status: 'configured_untested', provider: p.name, model: p.model, lastSuccessAt: null };
  const [r] = await db<{ at: Date | null }[]>`
    select max(created_at) as at from ai_runs where provider = ${p.name} and model = ${p.model} and status = 'succeeded'`;
  return { status: r?.at ? 'live_verified' : 'configured_untested', provider: p.name, model: p.model, lastSuccessAt: r?.at ?? null };
}

/** Cost from documented per-token prices (env); null when pricing is not configured. */
export function costMicroUsd(tokensIn: number | null, tokensOut: number | null): number | null {
  const e = env();
  if (!e.AI_PRICE_IN_PER_MTOK_MICROUSD || !e.AI_PRICE_OUT_PER_MTOK_MICROUSD || tokensIn == null || tokensOut == null) return null;
  return Math.round((tokensIn * e.AI_PRICE_IN_PER_MTOK_MICROUSD + tokensOut * e.AI_PRICE_OUT_PER_MTOK_MICROUSD) / 1_000_000);
}
