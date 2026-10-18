'use client';

/**
 * Browser API client. Sends the CSRF marker header, generates idempotency keys
 * for unsafe operations (stable per logical submission — pass the same key on
 * retry), and normalizes errors so forms can keep the user's input.
 */
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: unknown,
    public requestId?: string,
  ) {
    super(message);
  }
}

export function newIdempotencyKey(): string {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function apiFetch<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown; idempotencyKey?: string; ifMatch?: string | number; signal?: AbortSignal } = {},
): Promise<T> {
  const method = init.method ?? (init.body !== undefined ? 'POST' : 'GET');
  const headers: Record<string, string> = { 'x-luma-request': '1' };
  if (init.body !== undefined) headers['content-type'] = 'application/json';
  if (init.idempotencyKey) headers['idempotency-key'] = init.idempotencyKey;
  if (init.ifMatch !== undefined) headers['if-match'] = String(init.ifMatch);
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      headers,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      credentials: 'same-origin',
      signal: init.signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError('network', 'errors.network', 0);
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const err = (data as { error?: { code: string; message: string; details?: unknown }; requestId?: string } | null) ?? {};
    throw new ApiError(err.error?.code ?? 'internal', err.error?.message ?? 'errors.internal', res.status, err.error?.details, err.requestId);
  }
  return data as T;
}
