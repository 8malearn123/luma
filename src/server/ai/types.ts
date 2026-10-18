/**
 * AI provider contract. Providers are server-side only; API keys never reach
 * the browser, prompts or logs. Every call has a JSON-schema structured output,
 * a timeout and a cancellation signal. Failures are returned as explicit codes —
 * callers show honest states instead of fabricating output.
 */
export type AiFailureCode =
  | 'not_configured' // no provider/key/model configured
  | 'plan_not_included' // tenant plan has no AI runs
  | 'budget_exhausted' // monthly AI run budget used up
  | 'quota' // provider quota/billing exhausted
  | 'rate_limited' // provider 429 after bounded retries
  | 'timeout'
  | 'cancelled'
  | 'provider_error' // 5xx / network after retries
  | 'invalid_output' // schema-invalid after bounded format retries
  | 'refusal'; // model refused

export interface JsonSchema {
  type: string;
  [k: string]: unknown;
}

export interface AiRequest {
  /** Trusted system instructions (from the prompt registry only). */
  system: string;
  /** Trusted task text built by our code. */
  task: string;
  /**
   * Untrusted data blocks (web content, customer text, business free text).
   * Always wrapped as data with explicit delimiters; never treated as instructions.
   */
  untrusted?: { label: string; content: string }[];
  /** Structured, already-redacted business data (aggregates only). */
  data?: unknown;
  schemaName: string;
  schema: JsonSchema;
  maxOutputTokens?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export type AiResult =
  | { ok: true; output: unknown; model: string; tokensIn: number | null; tokensOut: number | null; latencyMs: number; attempts: number }
  | { ok: false; code: AiFailureCode; message: string; model?: string | null; latencyMs?: number; attempts?: number };

export interface AiProvider {
  name: string;
  model: string;
  /** true only for the deterministic test double */
  isFake: boolean;
  generate(req: AiRequest): Promise<AiResult>;
}
