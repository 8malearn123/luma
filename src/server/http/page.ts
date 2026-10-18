import { randomUUID } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { resolveSession, SESSION_COOKIE, type SessionUser } from '../auth/service';
import { AppError } from '../errors';
import { resolvePlatformContext, resolveTenantContext, type PlatformContext, type TenantContext } from '../tenancy/context';
import type { Capability, PlatformCapability } from '../tenancy/capabilities';
import { LOCALE_COOKIE, translate } from '@/lib/i18n';
import type { Locale } from '@/lib/format';

export async function sessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  return resolveSession(jar.get(SESSION_COOKIE)?.value);
}

export async function pageLocale(user?: SessionUser | null): Promise<Locale> {
  const jar = await cookies();
  const c = jar.get(LOCALE_COOKIE)?.value;
  if (c === 'ar' || c === 'en') return c;
  return user?.locale ?? 'ar';
}

export async function pageT(user?: SessionUser | null) {
  const locale = await pageLocale(user);
  return { locale, t: (k: string, v?: Record<string, string | number>) => translate(locale, k, v) };
}

async function currentPath(): Promise<string> {
  const h = await headers();
  return h.get('x-luma-path') ?? '/';
}

export async function requireUser(): Promise<SessionUser> {
  const u = await sessionUser();
  if (!u) redirect(`/auth/login?next=${encodeURIComponent(await currentPath())}`);
  return u;
}

async function reqMeta() {
  const h = await headers();
  return { requestId: h.get('x-request-id') ?? randomUUID(), ip: h.get('x-forwarded-for')?.split(',')[0].trim() ?? null };
}

/** For dashboard pages: membership-protected; unknown/unauthorized tenants → 404. */
export async function requireTenant(slug: string): Promise<TenantContext> {
  const user = await requireUser();
  const { requestId, ip } = await reqMeta();
  try {
    return await resolveTenantContext(user, slug, requestId, ip);
  } catch (e) {
    if (e instanceof AppError && e.code === 'not_found') notFound();
    throw e;
  }
}

export async function requirePlatform(): Promise<PlatformContext> {
  const user = await requireUser();
  const { requestId, ip } = await reqMeta();
  try {
    return await resolvePlatformContext(user, requestId, ip);
  } catch {
    notFound();
  }
}

export const can = (t: TenantContext, ...caps: Capability[]) => caps.some((c) => t.caps.has(c));
export const canPlatform = (p: PlatformContext, cap: PlatformCapability) => p.caps.has(cap);
