import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { z, type ZodType } from 'zod';
import { sql } from '../db';
import { env } from '../env';
import { AppError, fromDbError } from '../errors';
import { resolveSession, SESSION_COOKIE, type SessionUser } from '../auth/service';
import { resolvePlatformContext, resolveTenantContext, type PlatformContext, type TenantContext } from '../tenancy/context';
import type { Capability, PlatformCapability } from '../tenancy/capabilities';
import { sha256hex } from '../crypto';
import { rateLimit } from '../rate-limit';

type Params = Record<string, string>;

export interface BaseCtx<P extends Params = Params> {
  req: NextRequest;
  params: P;
  requestId: string;
  ip: string | null;
  ua: string | null;
  user: SessionUser | null;
  json<T>(schema: ZodType<T>): Promise<T>;
  query<T>(schema: ZodType<T>): T;
}
export interface UserCtx<P extends Params = Params> extends BaseCtx<P> {
  user: SessionUser;
}
export interface TenantCtx<P extends Params = Params> extends UserCtx<P> {
  t: TenantContext;
}
export interface PlatformCtx<P extends Params = Params> extends UserCtx<P> {
  p: PlatformContext;
}

interface Opts {
  /** Require an Idempotency-Key header and replay stored results. */
  idempotent?: boolean;
  /** Per-user (or per-IP when anonymous) limit: [count, windowSeconds] */
  rateLimit?: [number, number];
  /** Skip the Origin check (webhooks: authenticated by signature instead). */
  allowCrossOrigin?: boolean;
}

const UNSAFE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function clientIp(req: NextRequest): string | null {
  const xf = req.headers.get('x-forwarded-for');
  const ip = xf ? xf.split(',')[0].trim() : req.headers.get('x-real-ip');
  return ip && /^[0-9a-fA-F:.]{3,45}$/.test(ip) ? ip : null;
}

export function errorResponse(e: unknown, requestId: string): NextResponse {
  const err = e instanceof AppError ? e : fromDbError(e);
  if (!err) {
    console.error(JSON.stringify({ level: 'error', requestId, message: (e as Error)?.message, stack: (e as Error)?.stack }));
    return NextResponse.json({ error: { code: 'internal', message: 'errors.internal' }, requestId }, { status: 500 });
  }
  const headers: Record<string, string> = { 'x-request-id': requestId };
  if (err.retryAfter) headers['retry-after'] = String(err.retryAfter);
  return NextResponse.json(
    { error: { code: err.code, message: err.message, details: err.details ?? undefined }, requestId },
    { status: err.status, headers },
  );
}

function checkOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  const allowed = new URL(env().APP_BASE_URL).origin;
  const self = req.nextUrl.origin;
  // Browsers always send Origin on cross-site unsafe requests. Absent Origin
  // (server-to-server, tests) is allowed only with the explicit CSRF header.
  if (origin) {
    if (origin !== allowed && origin !== self) throw new AppError('forbidden', 'errors.bad_origin');
  } else if (req.headers.get('x-luma-request') !== '1') {
    throw new AppError('forbidden', 'errors.bad_origin');
  }
}

async function baseCtx<P extends Params>(req: NextRequest, rawParams: Promise<P> | undefined, requestId: string): Promise<BaseCtx<P>> {
  const params = ((await rawParams) ?? {}) as P;
  const jar = await cookies();
  const user = await resolveSession(jar.get(SESSION_COOKIE)?.value);
  let bodyRead: unknown = undefined;
  return {
    req,
    params,
    requestId,
    ip: clientIp(req),
    ua: req.headers.get('user-agent'),
    user,
    async json<T>(schema: ZodType<T>) {
      if (bodyRead === undefined) {
        const text = await req.text();
        if (text.length > 512 * 1024) throw new AppError('validation', 'errors.payload_too_large');
        try {
          bodyRead = text ? JSON.parse(text) : {};
        } catch {
          throw new AppError('validation', 'errors.bad_json');
        }
      }
      const r = schema.safeParse(bodyRead);
      if (!r.success) throw new AppError('validation', 'errors.validation', z.flattenError(r.error));
      return r.data;
    },
    query<T>(schema: ZodType<T>) {
      const obj = Object.fromEntries(req.nextUrl.searchParams.entries());
      const r = schema.safeParse(obj);
      if (!r.success) throw new AppError('validation', 'errors.validation', z.flattenError(r.error));
      return r.data;
    },
  };
}

async function withIdempotency(
  ctx: BaseCtx,
  scope: string,
  run: () => Promise<NextResponse>,
): Promise<NextResponse> {
  const key = ctx.req.headers.get('idempotency-key');
  if (!key || !/^[A-Za-z0-9_-]{8,128}$/.test(key)) throw new AppError('validation', 'errors.idempotency_key_required');
  const bodyText = await ctx.req.clone().text();
  const hash = sha256hex(`${ctx.req.method} ${ctx.req.nextUrl.pathname}\n${bodyText}`);
  const inserted = await sql()`
    insert into idempotency_records (scope, key, request_hash) values (${scope}, ${key}, ${hash})
    on conflict (scope, key) do nothing returning key`;
  if (inserted.length === 0) {
    const [rec] = await sql()<{ requestHash: string; status: string; responseStatus: number; responseBody: unknown }[]>`
      select request_hash, status, response_status, response_body from idempotency_records where scope = ${scope} and key = ${key}`;
    if (!rec) throw new AppError('conflict', 'errors.retry');
    if (rec.requestHash !== hash) throw new AppError('idempotency_mismatch', 'errors.idempotency_mismatch');
    if (rec.status !== 'completed') throw new AppError('conflict', 'errors.request_in_progress');
    return NextResponse.json(rec.responseBody, { status: rec.responseStatus, headers: { 'idempotent-replay': 'true' } });
  }
  try {
    const res = await run();
    const body = await res.clone().json().catch(() => null);
    if (res.status < 500) {
      await sql()`update idempotency_records set status = 'completed', response_status = ${res.status},
                  response_body = ${sql().json(body as never)} where scope = ${scope} and key = ${key}`;
    } else {
      await sql()`delete from idempotency_records where scope = ${scope} and key = ${key}`;
    }
    return res;
  } catch (e) {
    // a failed attempt can be retried with the same key
    await sql()`delete from idempotency_records where scope = ${scope} and key = ${key}`;
    throw e;
  }
}

const toResponse = (r: unknown, requestId: string): NextResponse => {
  if (r instanceof NextResponse || r instanceof Response) {
    (r as NextResponse).headers.set('x-request-id', requestId);
    return r as NextResponse;
  }
  return NextResponse.json(r ?? { ok: true }, { headers: { 'x-request-id': requestId, 'cache-control': 'no-store' } });
};

type RouteFn = (req: NextRequest, ctx: { params: Promise<Params> }) => Promise<NextResponse>;

function wrap<C extends BaseCtx>(opts: Opts, build: (b: BaseCtx) => Promise<C>, scopeOf: (c: C) => string, fn: (c: C) => Promise<unknown>): RouteFn {
  return async (req, routeCtx) => {
    const requestId = req.headers.get('x-request-id')?.slice(0, 64) || randomUUID();
    try {
      if (UNSAFE.has(req.method) && !opts.allowCrossOrigin) checkOrigin(req);
      const b = await baseCtx(req, routeCtx?.params, requestId);
      const c = await build(b);
      if (opts.rateLimit) {
        await rateLimit(`rl:${req.nextUrl.pathname}:${c.user?.userId ?? c.ip ?? 'anon'}`, opts.rateLimit[0], opts.rateLimit[1]);
      }
      const run = async () => toResponse(await fn(c), requestId);
      return opts.idempotent ? await withIdempotency(c, scopeOf(c), run) : await run();
    } catch (e) {
      return errorResponse(e, requestId);
    }
  };
}

const requireUser = (b: BaseCtx): UserCtx => {
  if (!b.user) throw new AppError('unauthenticated', 'errors.unauthenticated');
  return b as UserCtx;
};

export const api = {
  public<P extends Params = Params>(fn: (c: BaseCtx<P>) => Promise<unknown>, opts: Opts = {}): RouteFn {
    return wrap(opts, async (b) => b, (c) => `anon:${c.user?.userId ?? c.ip ?? 'anon'}`, fn as (c: BaseCtx) => Promise<unknown>);
  },
  user<P extends Params = Params>(fn: (c: UserCtx<P>) => Promise<unknown>, opts: Opts = {}): RouteFn {
    return wrap(opts, async (b) => requireUser(b), (c) => `user:${c.user.userId}`, fn as (c: UserCtx) => Promise<unknown>);
  },
  /** Route params must include `tenant` (the slug). Capabilities are checked before the handler runs. */
  tenant<P extends Params = Params>(caps: Capability[] | Capability | null, fn: (c: TenantCtx<P & { tenant: string }>) => Promise<unknown>, opts: Opts = {}): RouteFn {
    const need = caps === null ? [] : Array.isArray(caps) ? caps : [caps];
    return wrap(
      opts,
      async (b) => {
        const u = requireUser(b);
        const t = await resolveTenantContext(u.user, String(u.params.tenant ?? ''), u.requestId, u.ip);
        // any-of semantics when several capabilities are listed
        if (need.length && !need.some((c) => t.caps.has(c))) throw new AppError('forbidden', 'errors.forbidden');
        if (t.supportGrant?.accessLevel === 'read' && UNSAFE.has(b.req.method)) throw new AppError('forbidden', 'errors.support_read_only');
        return { ...u, t } as TenantCtx;
      },
      (c) => `tenant:${c.t.tenant.id}:${c.user.userId}`,
      fn as (c: TenantCtx) => Promise<unknown>,
    );
  },
  platform<P extends Params = Params>(cap: PlatformCapability, fn: (c: PlatformCtx<P>) => Promise<unknown>, opts: Opts = {}): RouteFn {
    return wrap(
      opts,
      async (b) => {
        const u = requireUser(b);
        const p = await resolvePlatformContext(u.user, u.requestId, u.ip);
        if (!p.caps.has(cap)) throw new AppError('forbidden', 'errors.forbidden');
        return { ...u, p } as PlatformCtx;
      },
      (c) => `platform:${c.user.userId}`,
      fn as (c: PlatformCtx) => Promise<unknown>,
    );
  },
};

// Shared query schemas
export const pageQuery = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(100).optional(),
  sort: z.string().max(40).optional(),
});

export const uuid = z.string().uuid();
