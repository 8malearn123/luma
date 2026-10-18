import type { AiProvider, AiRequest, AiResult } from './types';
import { untrustedBlock } from './redact';

/**
 * OpenAI Responses API adapter (POST {base}/responses) with Structured Outputs:
 *   { model, input: [{role:'system',content}, {role:'user',content}],
 *     text: { format: { type:'json_schema', name, schema, strict:true } },
 *     max_output_tokens }
 * Output text is read from output[].content[] items of type 'output_text'
 * (a 'refusal' item means the model refused). Usage: usage.input_tokens /
 * usage.output_tokens when present.
 *
 * Retries: up to 2 extra attempts for invalid/unparseable output, and
 * exponential backoff for 429/5xx/network errors. Never retries after the
 * caller's signal aborts. The API key is read per call and never logged.
 */
export interface OpenAiConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const FORMAT_RETRIES = 2;
const TRANSPORT_RETRIES = 2;

export function buildUserContent(req: AiRequest): string {
  const parts = [req.task];
  if (req.data !== undefined) parts.push(`<data>\n${JSON.stringify(req.data)}\n</data>`);
  for (const u of req.untrusted ?? []) parts.push(untrustedBlock(u.label, u.content));
  return parts.join('\n\n');
}

export function buildRequestBody(cfg: Pick<OpenAiConfig, 'model'>, req: AiRequest, extraInstruction?: string) {
  return {
    model: cfg.model,
    input: [
      { role: 'system', content: req.system },
      { role: 'user', content: buildUserContent(req) + (extraInstruction ? `\n\n${extraInstruction}` : '') },
    ],
    text: { format: { type: 'json_schema', name: req.schemaName, schema: req.schema, strict: true } },
    max_output_tokens: req.maxOutputTokens ?? 2000,
    store: false,
  };
}

interface ResponsesPayload {
  status?: string;
  output?: { type?: string; content?: { type?: string; text?: string; refusal?: string }[] }[];
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { code?: string; message?: string } | null;
  incomplete_details?: { reason?: string } | null;
}

export function extractOutput(p: ResponsesPayload): { text: string | null; refusal: string | null } {
  let text: string | null = null;
  let refusal: string | null = null;
  for (const item of p.output ?? []) {
    for (const c of item.content ?? []) {
      if (c.type === 'output_text' && typeof c.text === 'string') text = (text ?? '') + c.text;
      if (c.type === 'refusal') refusal = c.refusal ?? 'refused';
    }
  }
  return { text, refusal };
}

export function createOpenAiProvider(cfg: OpenAiConfig): AiProvider {
  const doFetch = cfg.fetchImpl ?? fetch;
  const sleep = cfg.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  return {
    name: 'openai',
    model: cfg.model,
    isFake: false,
    async generate(req: AiRequest): Promise<AiResult> {
      const started = Date.now();
      let attempts = 0;
      let formatFailures = 0;
      let transportFailures = 0;
      let lastFormatError = '';
      for (;;) {
        if (req.signal?.aborted) return { ok: false, code: 'cancelled', message: 'cancelled', model: cfg.model, attempts };
        attempts++;
        const timeout = AbortSignal.timeout(req.timeoutMs ?? cfg.timeoutMs);
        const signal = req.signal ? AbortSignal.any([req.signal, timeout]) : timeout;
        let res: Response;
        try {
          res = await doFetch(`${cfg.baseUrl.replace(/\/$/, '')}/responses`, {
            method: 'POST',
            headers: { authorization: `Bearer ${cfg.apiKey}`, 'content-type': 'application/json' },
            body: JSON.stringify(buildRequestBody(cfg, req, formatFailures ? `Your previous answer was invalid (${lastFormatError}). Return ONLY JSON matching the schema.` : undefined)),
            signal,
          });
        } catch (e) {
          if (req.signal?.aborted) return { ok: false, code: 'cancelled', message: 'cancelled', model: cfg.model, attempts };
          const name = (e as Error)?.name;
          if (name === 'TimeoutError' || name === 'AbortError') return { ok: false, code: 'timeout', message: 'provider timeout', model: cfg.model, attempts, latencyMs: Date.now() - started };
          if (transportFailures++ < TRANSPORT_RETRIES) {
            await sleep(500 * 2 ** transportFailures);
            continue;
          }
          return { ok: false, code: 'provider_error', message: 'network error', model: cfg.model, attempts, latencyMs: Date.now() - started };
        }
        if (res.status === 429 || res.status >= 500) {
          const body = (await res.json().catch(() => ({}))) as ResponsesPayload;
          const quota = body.error?.code === 'insufficient_quota';
          if (quota) return { ok: false, code: 'quota', message: 'provider quota exhausted', model: cfg.model, attempts, latencyMs: Date.now() - started };
          if (transportFailures++ < TRANSPORT_RETRIES) {
            const ra = Number(res.headers.get('retry-after'));
            await sleep(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 20) * 1000 : 1000 * 2 ** transportFailures);
            continue;
          }
          return { ok: false, code: res.status === 429 ? 'rate_limited' : 'provider_error', message: `provider status ${res.status}`, model: cfg.model, attempts, latencyMs: Date.now() - started };
        }
        if (res.status === 401 || res.status === 403) return { ok: false, code: 'not_configured', message: 'provider rejected credentials', model: cfg.model, attempts };
        if (!res.ok) return { ok: false, code: 'provider_error', message: `provider status ${res.status}`, model: cfg.model, attempts, latencyMs: Date.now() - started };
        const payload = (await res.json().catch(() => null)) as ResponsesPayload | null;
        const { text, refusal } = extractOutput(payload ?? {});
        if (refusal) return { ok: false, code: 'refusal', message: 'model refused', model: cfg.model, attempts, latencyMs: Date.now() - started };
        try {
          if (!text) throw new Error(payload?.incomplete_details?.reason ?? 'empty output');
          const output = JSON.parse(text);
          return {
            ok: true,
            output,
            model: cfg.model,
            tokensIn: payload?.usage?.input_tokens ?? null,
            tokensOut: payload?.usage?.output_tokens ?? null,
            latencyMs: Date.now() - started,
            attempts,
          };
        } catch (e) {
          lastFormatError = String((e as Error).message).slice(0, 80);
          if (formatFailures++ < FORMAT_RETRIES) continue;
          return { ok: false, code: 'invalid_output', message: 'invalid structured output', model: cfg.model, attempts, latencyMs: Date.now() - started };
        }
      }
    },
  };
}
