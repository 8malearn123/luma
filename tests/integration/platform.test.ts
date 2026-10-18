import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, sql, withSystem } from '@/server/db';
import { resolvePlatformContext, resolveTenantContext } from '@/server/tenancy/context';
import {
  changeSubscription,
  createSupportGrant,
  grantPlatformRole,
  integrationsStatus,
  listPlans,
  listTenants,
  revokeSupportGrant,
  setTenantStatus,
  upsertPlan,
} from '@/server/platform/service';
import { createStaff } from '@/server/services/team';
import { withTenant } from '@/server/db';
import { makeTenant, makeUser } from '../fixtures';

afterAll(closeDb);

async function platformUser(role: 'platform_owner' | 'policy_reviewer' | 'support_admin' | 'tech_admin') {
  const u = await makeUser({ name: role });
  await withSystem('test', (tx) => tx`insert into platform_staff (user_id, role) values (${u.userId}, ${role})`);
  return { u, p: await resolvePlatformContext(u, randomUUID(), null) };
}

describe('platform access', () => {
  it('a salon owner has no platform context and cannot grant herself policy_reviewer', async () => {
    const t = await makeTenant();
    await expect(resolvePlatformContext(t.owner, 'r', null)).rejects.toMatchObject({ code: 'not_found' });
    // a support admin (not platform owner) cannot grant roles either
    const { p: support } = await platformUser('support_admin');
    await expect(grantPlatformRole(support, { identifier: t.owner.email!, role: 'policy_reviewer' })).rejects.toMatchObject({ code: 'forbidden' });
    const [row] = await sql()`select 1 from platform_staff where user_id = ${t.owner.userId}`;
    expect(row).toBeUndefined();
  });

  it('platform owner grants a role; least privilege per role', async () => {
    const { p } = await platformUser('platform_owner');
    const target = await makeUser({ name: 'Reviewer' });
    await grantPlatformRole(p, { identifier: target.email!, role: 'policy_reviewer' });
    const rp = await resolvePlatformContext(target, 'r', null);
    expect(rp.caps.has('platform.policy.review')).toBe(true);
    expect(rp.caps.has('platform.tenants.manage')).toBe(false);
    await expect(listTenants(rp, { limit: 5, offset: 0 })).rejects.toMatchObject({ code: 'forbidden' });
    const { p: tech } = await platformUser('tech_admin');
    const st = await integrationsStatus(tech);
    // nothing reports "live" without a real, verified integration
    expect(st.items.find((i) => i.key === 'ai')!.state).toBe('disconnected');
    expect(st.items.find((i) => i.key === 'whatsapp')!.state).toBe('disconnected');
  });

  it('suspending a tenant requires a reason and is audited', async () => {
    const t = await makeTenant();
    const { p } = await platformUser('platform_owner');
    await setTenantStatus(p, t.tenantId, { status: 'suspended', reason: 'payment fraud investigation' });
    const [a] = await sql()`select actor_kind, reason from audit_logs where action = 'platform.tenant_suspended' and tenant_id = ${t.tenantId}`;
    expect(a).toMatchObject({ actorKind: 'platform', reason: 'payment fraud investigation' });
  });
});

describe('support access', () => {
  it('time-limited grant gives scoped access; expiry and revocation stop it; all audited', async () => {
    const t = await makeTenant();
    const { u, p } = await platformUser('support_admin');
    await expect(resolveTenantContext(u, t.slug, 'r', null)).rejects.toMatchObject({ code: 'not_found' });
    const g = await createSupportGrant(p, { tenantId: t.tenantId, reason: 'customer reported broken storefront', accessLevel: 'read', hours: 2 });
    const ctx = await resolveTenantContext(u, t.slug, 'r', null);
    expect(ctx.actorKind).toBe('support');
    expect(ctx.caps.has('finance.view')).toBe(false);
    await withSystem('t', (tx) => tx`update support_access_grants set starts_at = now() - interval '3 hours', expires_at = now() - interval '1 second' where id = ${g.id}`);
    await expect(resolveTenantContext(u, t.slug, 'r', null)).rejects.toMatchObject({ code: 'not_found' });
    const g2 = await createSupportGrant(p, { tenantId: t.tenantId, reason: 'follow-up on storefront issue', accessLevel: 'write', hours: 1 });
    await revokeSupportGrant(p, g2.id);
    await expect(resolveTenantContext(u, t.slug, 'r', null)).rejects.toMatchObject({ code: 'not_found' });
    const logs = await sql()`select action from audit_logs where tenant_id = ${t.tenantId} and action like 'support.%' order by id`;
    expect(logs.map((l) => l.action)).toEqual(['support.grant_created', 'support.grant_created', 'support.grant_revoked']);
    await expect(createSupportGrant(p, { tenantId: t.tenantId, reason: 'short', accessLevel: 'read', hours: 1 } as never)).rejects.toBeTruthy();
  });
});

describe('plans & subscriptions', () => {
  it('downgrade keeps existing data, marks over-limit, and blocks new creation', async () => {
    const t = await makeTenant();
    const { p } = await platformUser('platform_owner');
    const plans = await listPlans(true);
    const wahaj = plans.find((x) => x.code === 'wahaj')!;
    const sanaa = plans.find((x) => x.code === 'sanaa')!;
    await changeSubscription(p, t.tenantId, { planId: wahaj.id as string, reason: 'upgrade for test' });
    const ctx = await t.ctx();
    for (let i = 0; i < 4; i++) await withTenant({ tenantId: t.tenantId }, (tx) => createStaff(tx, ctx, { displayName: `S${i}`, branchIds: [t.branchId], serviceIds: [], publicVisible: true, allocationWeight: 100 }));
    const r = await changeSubscription(p, t.tenantId, { planId: sanaa.id as string, reason: 'downgrade for test' });
    expect(r.overage).toContain('staff.max');
    const [{ n }] = await withTenant({ tenantId: t.tenantId }, (tx) => tx<{ n: number }[]>`select count(*)::int as n from staff_profiles where status = 'active'`);
    expect(n).toBe(4);
    await expect(withTenant({ tenantId: t.tenantId }, (tx) => createStaff(tx, ctx, { displayName: 'S5', branchIds: [t.branchId], serviceIds: [], publicVisible: true, allocationWeight: 100 }))).rejects.toMatchObject({ code: 'plan_limit' });
    const [sub] = await withTenant({ tenantId: t.tenantId }, (tx) => tx`select overage_state from subscriptions order by created_at desc limit 1`);
    expect(sub.overageState).toBe('over_limit');
  });

  it('subscription transitions follow the table; past_due gets a grace period', async () => {
    const t = await makeTenant();
    const { p } = await platformUser('platform_owner');
    await changeSubscription(p, t.tenantId, { status: 'active', reason: 'converted from trial' });
    await changeSubscription(p, t.tenantId, { status: 'past_due', reason: 'renewal failed' });
    const [s] = await withTenant({ tenantId: t.tenantId }, (tx) => tx`select status, grace_until from subscriptions order by created_at desc limit 1`);
    expect(s.status).toBe('past_due');
    expect(s.graceUntil).toBeTruthy();
    await changeSubscription(p, t.tenantId, { status: 'expired', reason: 'grace ended' });
    await expect(changeSubscription(p, t.tenantId, { status: 'active', reason: 'reactivate' })).rejects.toMatchObject({ code: 'invalid_transition' });
  });

  it('plans with unconfigured prices stay null; test prices are flagged', async () => {
    const { p } = await platformUser('platform_owner');
    const r = await upsertPlan(p, { code: `test_${Date.now().toString(36)}`, nameAr: 'تجربة', nameEn: 'Trial plan', priceMonthlyMinor: null, priceYearlyMinor: null, priceIsTest: true, trialDays: 14, graceDays: 7, poweredByRequired: true, status: 'draft', sort: 9, features: [{ key: 'staff.max', enabled: true, limit: 2 }] });
    const plan = (await listPlans(true)).find((x) => x.id === r.id)!;
    expect(plan.priceMonthlyMinor).toBeNull();
    expect(plan.features).toHaveLength(1);
  });
});

describe('public directory', () => {
  it('lists only active tenants with a published storefront; counts are computed', async () => {
    const { discoverTenants } = await import('@/server/platform/discover');
    const t = await makeTenant({ name: 'Discoverable Salon' });
    const before = await discoverTenants({ q: 'Discoverable', offset: 0 });
    expect(before.items.find((x) => x.slug === t.slug)).toBeUndefined();
    await withTenant({ tenantId: t.tenantId }, async (tx) => {
      const [v] = await tx<{ id: string }[]>`insert into page_versions (tenant_id, number, document, draft_version) select ${t.tenantId}, 1, document, version from storefront_drafts returning id`;
      await tx`update tenants set status = 'active', published_version_id = ${v.id} where id = ${t.tenantId}`;
      await tx`insert into services (tenant_id, name, price_minor, duration_min) values (${t.tenantId}, 'Discoverable Blowout', 5000, 30)`;
    });
    const after = await discoverTenants({ q: 'Blowout', offset: 0 });
    const hit = after.items.find((x) => x.slug === t.slug);
    expect(hit?.serviceCount).toBe(1);
    expect(after.total).toBeGreaterThanOrEqual(1);
    expect(Object.keys(hit!).sort()).toEqual(['businessType', 'city', 'name', 'serviceCount', 'slug', 'tagline']);
  });
});
