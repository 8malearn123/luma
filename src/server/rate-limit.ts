import { sql } from './db';
import { AppError } from './errors';

/**
 * Fixed-window counters in PostgreSQL (shared across app instances; no Redis
 * needed at this scale). Throws 429 with Retry-After when exceeded.
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<void> {
  const [row] = await sql()`
    insert into rate_limit_buckets as b (key, window_start, count)
    values (${key}, now(), 1)
    on conflict (key) do update set
      count = case when b.window_start < now() - make_interval(secs => ${windowSec}) then 1 else b.count + 1 end,
      window_start = case when b.window_start < now() - make_interval(secs => ${windowSec}) then now() else b.window_start end
    returning count, extract(epoch from (window_start + make_interval(secs => ${windowSec}) - now()))::int as retry_after`;
  if (Number(row.count) > limit) {
    throw new AppError('rate_limited', 'errors.rate_limited', undefined, Math.max(1, Number(row.retryAfter)));
  }
}

export async function clearRateLimit(key: string) {
  await sql()`delete from rate_limit_buckets where key = ${key}`;
}
