import { createHash } from 'node:crypto';
import type { Tx } from '../db';
import { entitlements } from '../tenancy/plan';
import { ensurePromptVersion } from './prompts';
import { costMicroUsd, getProvider } from './provider';
import { redactData, scrubText } from './redact';
import type { AiFailureCode, JsonSchema } from './types';

/**
 * The single entry point for model calls (spec §29 steps 1, 4, 6):
 *  1. tenant plan includes AI and the monthly run budget is not exhausted
 *  4. provider call through the server-side adapter with a JSON schema
 *  6. ai_runs row with provenance (provider, model, prompt version, input hash,
 *     redacted input summary, validation, tokens, cost when documented) +
 *     ai_usage accounting
 * Cache: identical (tenant, purpose, prompt version, model, input hash) reuse a
 * previous successful output — scoped by tenant so no context is ever shared.
 * Every call runs inside the tenant's RLS transaction.
 */
export interface RunInput {
  tenantId: string;
  userId?: string | null;
  jobId?: string | null;
  purpose: string;
  promptId: string;
  task: string;
  data?: unknown;
  untrusted?: { label: string; content: string }[];
  schemaName: string;
  schema: JsonSchema;
  maxOutputTokens?: number;
  signal?: AbortSignal;
  /** reuse a cached identical result (default true) */
  useCache?: boolean;
}

export type RunResult =
  | { ok: true; runId: string; output: unknown; provider: string; model: string; promptVersion: string; cached: boolean }
  | { ok: false; runId: string | null; code: AiFailureCode; message: string };

const monthStart = (d = new Date()) => `${d.toISOString().slice(0, 7)}-01`;

export async function checkBudget(tx: Tx, tenantId: string): Promise<{ ok: true; remaining: number | null } | { ok: false; code: 'plan_not_included' | 'budget_exhausted' }> {
  const ent = await entitlements(tx, tenantId);
  const f = ent.features.get('ai.monthly_runs');
  if (!f || !f.enabled) return { ok: false, code: 'plan_not_included' };
  if (f.limit === null) return { ok: true, remaining: null };
  const [u] = await tx<{ runs: number }[]>`select runs from ai_usage where tenant_id = ${tenantId} and period = ${monthStart()}`;
  const used = u?.runs ?? 0;
  if (used >= f.limit) return { ok: false, code: 'budget_exhausted' };
  return { ok: true, remaining: f.limit - used };
}

export async function runAi(tx: Tx, input: RunInput): Promise<RunResult> {
  const prompt = await ensurePromptVersion(tx, input.promptId);
  const data = input.data === undefined ? undefined : redactData(input.data);
  const untrusted = input.untrusted?.map((u) => ({ label: u.label, content: scrubText(u.content, 6000) }));
  const inputHash = createHash('sha256').update(JSON.stringify({ t: input.task, d: data, u: untrusted, s: input.schemaName })).digest('hex');
  const provider = getProvider();
  const summary = { purpose: input.purpose, dataKeys: data && typeof data === 'object' ? Object.keys(data as object).slice(0, 40) : [], untrustedBlocks: untrusted?.length ?? 0 };

  const record = async (r: { status: string; provider: string; model: string | null; errorCode?: string; output?: unknown; tokensIn?: number | null; tokensOut?: number | null; latencyMs?: number; cacheKey?: string | null }) => {
    const [row] = await tx<{ id: string }[]>`
      insert into ai_runs (tenant_id, job_id, purpose, provider, model, prompt_version, status, error_code, input_hash, input_summary, output,
                           tokens_in, tokens_out, cost_micro_usd, latency_ms, cache_key, created_by)
      values (${input.tenantId}, ${input.jobId ?? null}, ${input.purpose}, ${r.provider}, ${r.model}, ${prompt.id}, ${r.status}, ${r.errorCode ?? null},
              ${inputHash}, ${tx.json(summary as never)}, ${r.output === undefined ? null : tx.json(r.output as never)},
              ${r.tokensIn ?? null}, ${r.tokensOut ?? null}, ${costMicroUsd(r.tokensIn ?? null, r.tokensOut ?? null)}, ${r.latencyMs ?? null},
              ${r.cacheKey ?? null}, ${input.userId ?? null})
      returning id`;
    return row.id;
  };

  if (!provider) {
    const id = await record({ status: 'unavailable', provider: 'none', model: null, errorCode: 'not_configured' });
    return { ok: false, runId: id, code: 'not_configured', message: 'errors.ai_unavailable' };
  }
  const cacheKey = createHash('sha256').update(`${input.tenantId}|${input.purpose}|${prompt.id}|${provider.name}|${provider.model}|${inputHash}`).digest('hex');
  if (input.useCache !== false) {
    const [hit] = await tx<{ id: string; output: unknown }[]>`
      select id, output from ai_runs where tenant_id = ${input.tenantId} and cache_key = ${cacheKey} and status = 'succeeded'
      order by created_at desc limit 1`;
    if (hit) {
      const id = await record({ status: 'cached', provider: provider.name, model: provider.model, output: hit.output, cacheKey: null });
      return { ok: true, runId: id, output: hit.output, provider: provider.name, model: provider.model, promptVersion: prompt.id, cached: true };
    }
  }
  const budget = await checkBudget(tx, input.tenantId);
  if (!budget.ok) {
    const id = await record({ status: 'unavailable', provider: provider.name, model: provider.model, errorCode: budget.code });
    return { ok: false, runId: id, code: budget.code, message: `errors.ai_${budget.code}` };
  }
  const res = await provider.generate({ system: prompt.system, task: input.task, data, untrusted, schemaName: input.schemaName, schema: input.schema, maxOutputTokens: input.maxOutputTokens, signal: input.signal });
  // count every attempted call against the budget (cost was incurred or attempted)
  await tx`insert into ai_usage (tenant_id, period, runs, tokens_in, tokens_out, cost_micro_usd)
           values (${input.tenantId}, ${monthStart()}, 1, ${res.ok ? (res.tokensIn ?? 0) : 0}, ${res.ok ? (res.tokensOut ?? 0) : 0},
                   ${res.ok ? (costMicroUsd(res.tokensIn, res.tokensOut) ?? 0) : 0})
           on conflict (tenant_id, period) do update set runs = ai_usage.runs + 1, tokens_in = ai_usage.tokens_in + excluded.tokens_in,
             tokens_out = ai_usage.tokens_out + excluded.tokens_out, cost_micro_usd = ai_usage.cost_micro_usd + excluded.cost_micro_usd`;
  if (!res.ok) {
    const id = await record({ status: 'failed', provider: provider.name, model: res.model ?? provider.model, errorCode: res.code, latencyMs: res.latencyMs });
    return { ok: false, runId: id, code: res.code, message: `errors.ai_${res.code}` };
  }
  // test-double runs are recorded under provider 'fake' and can never make aiStatus report live_verified
  const id = await record({
    status: 'succeeded',
    provider: provider.name,
    model: res.model,
    output: res.output,
    tokensIn: res.tokensIn,
    tokensOut: res.tokensOut,
    latencyMs: res.latencyMs,
    cacheKey,
  });
  return { ok: true, runId: id, output: res.output, provider: provider.name, model: res.model, promptVersion: prompt.id, cached: false };
}

/** Attach validation results to a run (unsupported claims, rejected ops…). */
export async function recordValidation(tx: Tx, runId: string, validation: Record<string, unknown>, rejected = false) {
  await tx`update ai_runs set validation = ${tx.json(validation as never)}${rejected ? tx`, status = 'rejected'` : tx``} where id = ${runId}`;
}
