import { sql, withTenant, type Tx } from '../db';
import { AppError, forbidden, notFound } from '../errors';
import type { SessionUser } from '../auth/service';
import {
  effectiveCapabilities,
  PLATFORM_ROLE_CAPS,
  SUPPORT_READ_CAPS,
  SUPPORT_WRITE_CAPS,
  type Capability,
  type PlatformCapability,
  type PlatformRole,
  type TenantRole,
} from './capabilities';

export interface TenantInfo {
  id: string;
  slug: string;
  name: string;
  businessType: string;
  status: string;
  timezone: string;
  defaultLocale: 'ar' | 'en';
  currency: string;
  publishedVersionId: string | null;
  isDemo: boolean;
}

export interface TenantContext {
  tenant: TenantInfo;
  user: SessionUser;
  actorKind: 'user' | 'support';
  role: TenantRole | null;
  membershipId: string | null;
  staffProfileId: string | null;
  branchIds: string[] | null;
  caps: Set<Capability>;
  supportGrant: { id: string; accessLevel: 'read' | 'write'; reason: string; expiresAt: Date } | null;
  requestId: string;
  ip: string | null;
}

export async function tenantBySlug(slug: string): Promise<TenantInfo | null> {
  if (!/^[a-z0-9-]{3,48}$/.test(slug)) return null;
  const [t] = await sql()<TenantInfo[]>`
    select id, slug, name, business_type, status, timezone, default_locale, currency, published_version_id, is_demo
    from tenants where slug = ${slug} and status <> 'archived'`;
  return t ?? null;
}

export async function tenantById(id: string): Promise<TenantInfo | null> {
  const [t] = await sql()<TenantInfo[]>`
    select id, slug, name, business_type, status, timezone, default_locale, currency, published_version_id, is_demo
    from tenants where id = ${id}`;
  return t ?? null;
}

/**
 * Tenant scope always comes from the authenticated session + an active
 * membership (or an active, audited support grant). A slug or id in the URL
 * only selects WHICH of the caller's tenants; it never grants access. Unknown
 * and unauthorized tenants are indistinguishable (404).
 */
export async function resolveTenantContext(
  user: SessionUser,
  slug: string,
  requestId: string,
  ip: string | null,
): Promise<TenantContext> {
  const tenant = await tenantBySlug(slug);
  if (!tenant) throw notFound('tenant');

  const m = await withTenant({ tenantId: tenant.id, userId: user.userId }, async (tx) => {
    const [row] = await tx<
      { id: string; role: TenantRole; grantedCaps: string[]; revokedCaps: string[]; staffProfileId: string | null; branchIds: string[] | null }[]
    >`select id, role, granted_caps, revoked_caps, staff_profile_id, branch_ids
      from tenant_memberships where tenant_id = ${tenant.id} and user_id = ${user.userId} and status = 'active'`;
    return row;
  });

  if (m) {
    return {
      tenant,
      user,
      actorKind: 'user',
      role: m.role,
      membershipId: m.id,
      staffProfileId: m.staffProfileId,
      branchIds: m.branchIds,
      caps: effectiveCapabilities(m.role, m.grantedCaps, m.revokedCaps),
      supportGrant: null,
      requestId,
      ip,
    };
  }

  // LUMA support: only with an active, time-limited grant that carries a reason.
  // support_access_grants is tenant-RLS protected: look it up inside this tenant's scope
  const [grant] = await withTenant({ tenantId: tenant.id, userId: user.userId }, (t) => t<{ id: string; accessLevel: 'read' | 'write'; reason: string; expiresAt: Date }[]>`
    select g.id, g.access_level, g.reason, g.expires_at
    from support_access_grants g
    join platform_staff p on p.user_id = g.platform_user_id and p.status = 'active'
    where g.platform_user_id = ${user.userId} and g.tenant_id = ${tenant.id}
      and g.revoked_at is null and g.starts_at <= now() and g.expires_at > now()
    order by g.expires_at desc limit 1`);
  if (grant) {
    return {
      tenant,
      user,
      actorKind: 'support',
      role: null,
      membershipId: null,
      staffProfileId: null,
      branchIds: null,
      caps: new Set(grant.accessLevel === 'write' ? SUPPORT_WRITE_CAPS : SUPPORT_READ_CAPS),
      supportGrant: grant,
      requestId,
      ip,
    };
  }
  throw notFound('tenant');
}

export function requireCap(ctx: TenantContext, ...caps: Capability[]) {
  for (const c of caps) if (!ctx.caps.has(c)) throw forbidden();
}

export function hasAnyCap(ctx: TenantContext, ...caps: Capability[]) {
  return caps.some((c) => ctx.caps.has(c));
}

/** Run a unit of work in this tenant's RLS scope. */
export function tx<T>(ctx: TenantContext, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return withTenant({ tenantId: ctx.tenant.id, userId: ctx.user.userId }, fn);
}

export const actorKindOf = (ctx: TenantContext) => (ctx.actorKind === 'support' ? 'support' : 'user');

/** Memberships for the business selector (does not grant anything by itself). */
export async function listMyTenants(userId: string) {
  return sql().begin(async (t) => {
    await t`select set_config('app.user_id', ${userId}, true)`;
    return t<{ slug: string; name: string; role: TenantRole; status: string; businessType: string }[]>`
      select t.slug, t.name, m.role, t.status, t.business_type
      from tenant_memberships m join tenants t on t.id = m.tenant_id
      where m.user_id = ${userId} and m.status = 'active' and t.status <> 'archived'
      order by t.name`;
  });
}

// ─────────────────────────────────────────────────────────────
// Platform context
// ─────────────────────────────────────────────────────────────
export interface PlatformContext {
  user: SessionUser;
  role: PlatformRole;
  caps: Set<PlatformCapability>;
  requestId: string;
  ip: string | null;
}

export async function resolvePlatformContext(user: SessionUser, requestId: string, ip: string | null): Promise<PlatformContext> {
  const [p] = await sql()<{ role: PlatformRole }[]>`
    select role from platform_staff where user_id = ${user.userId} and status = 'active'`;
  if (!p) throw new AppError('not_found', 'errors.not_found');
  return { user, role: p.role, caps: new Set(PLATFORM_ROLE_CAPS[p.role]), requestId, ip };
}

export function requirePlatformCap(ctx: PlatformContext, cap: PlatformCapability) {
  if (!ctx.caps.has(cap)) throw forbidden();
}

export async function isPlatformStaff(userId: string): Promise<PlatformRole | null> {
  const [p] = await sql()<{ role: PlatformRole }[]>`select role from platform_staff where user_id = ${userId} and status = 'active'`;
  return p?.role ?? null;
}
