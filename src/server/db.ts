import postgres from 'postgres';
import { env } from './env';

/**
 * Data access. The application role is NOT the schema owner, so row-level
 * security is enforced on every tenant table. Every unit of work runs in a
 * transaction that pins its scope with set_config(..., is_local = true):
 *
 *   withTenant(...)  app.tenant_id + app.user_id   — business/storefront work
 *   withUser(...)    app.user_id only              — customer's cross-tenant view
 *   withSystem(...)  app.system = on               — trusted internals only
 *                                                    (auth, webhooks, job dispatch)
 */
export type Sql = postgres.Sql<Record<string, unknown>>;
export type Tx = postgres.TransactionSql<Record<string, unknown>>;
export type Db = Sql | Tx;

const g = globalThis as unknown as { __lumaSql?: Sql };

export function sql(): Sql {
  if (!g.__lumaSql) {
    g.__lumaSql = postgres(env().DATABASE_URL, {
      max: Number(process.env.DB_POOL_MAX ?? 10),
      idle_timeout: 30,
      connect_timeout: 10,
      transform: { column: { from: postgres.toCamel } },
      types: {
        // bigint → number. All money values are minor units well below 2^53.
        bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
      },
      onnotice: () => {},
    }) as unknown as Sql;
  }
  return g.__lumaSql;
}

export async function closeDb() {
  if (g.__lumaSql) {
    await g.__lumaSql.end({ timeout: 5 });
    g.__lumaSql = undefined;
  }
}

export interface TenantScope {
  tenantId: string;
  userId?: string | null;
}

async function scoped<T>(settings: Record<string, string>, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (await sql().begin(async (tx) => {
    for (const [k, v] of Object.entries(settings)) {
      await tx`select set_config(${k}, ${v}, true)`;
    }
    return fn(tx as Tx);
  })) as T;
}

export function withTenant<T>(scope: TenantScope, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!scope.tenantId) throw new Error('withTenant requires tenantId');
  return scoped({ 'app.tenant_id': scope.tenantId, 'app.user_id': scope.userId ?? '' }, fn);
}

export function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return scoped({ 'app.user_id': userId, 'app.tenant_id': '' }, fn);
}

/** Trusted server internals only. `reason` documents why the scope is needed. */
export function withSystem<T>(_reason: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return scoped({ 'app.system': 'on', 'app.tenant_id': '', 'app.user_id': '' }, fn);
}

/** Run within an existing transaction as a savepoint, or start a system tx. */
export async function savepoint<T>(tx: Tx, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (await tx.savepoint(async (sp) => fn(sp as unknown as Tx))) as T;
}
