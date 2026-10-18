import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, sql, withTenant, withUser } from '@/server/db';
import { addMember, makeTenant, makeUser } from '../fixtures';
import { effectiveCapabilities } from '@/server/tenancy/capabilities';
import { resolveTenantContext } from '@/server/tenancy/context';

afterAll(closeDb);

describe('tenant isolation (database level)', () => {
  it('RLS hides other tenants rows even with a hand-written query', async () => {
    const a = await makeTenant({ name: 'Salon A' });
    const b = await makeTenant({ name: 'Salon B' });
    const rows = await withTenant({ tenantId: a.tenantId }, (tx) => tx`select tenant_id from branches`);
    expect(rows.every((r) => r.tenantId === a.tenantId)).toBe(true);
    // direct id guess of B's branch from A's scope returns nothing
    const guess = await withTenant({ tenantId: a.tenantId }, (tx) => tx`select id from branches where id = ${b.branchId}`);
    expect(guess).toHaveLength(0);
  });

  it('RLS rejects writing a row into another tenant', async () => {
    const a = await makeTenant();
    const b = await makeTenant();
    await expect(
      withTenant({ tenantId: a.tenantId }, (tx) => tx`insert into categories (tenant_id, kind, name) values (${b.tenantId}, 'service', 'x')`),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('composite FKs prevent referencing another tenant’s entity', async () => {
    const a = await makeTenant();
    const b = await makeTenant();
    const [catB] = await withTenant({ tenantId: b.tenantId }, (tx) => tx<{ id: string }[]>`
      insert into categories (tenant_id, kind, name) values (${b.tenantId}, 'service', 'B cat') returning id`);
    await expect(
      withTenant({ tenantId: a.tenantId }, (tx) => tx`
        insert into services (tenant_id, category_id, name, price_minor, duration_min)
        values (${a.tenantId}, ${catB.id}, 'S', 1000, 30)`),
    ).rejects.toMatchObject({ code: '23503' });
  });

  it('without tenant scope, no tenant rows are visible', async () => {
    const a = await makeTenant();
    const rows = await withUser(a.owner.userId, (tx) => tx`select id from branches`);
    expect(rows).toHaveLength(0);
  });

  it('app role cannot modify append-only ledgers or the capability catalog', async () => {
    await expect(sql()`update audit_logs set action = 'x'`).rejects.toMatchObject({ code: '42501' });
    await expect(sql()`delete from audit_logs`).rejects.toMatchObject({ code: '42501' });
    await expect(sql()`insert into role_permissions (role_key, permission_key) values ('specialist', 'finance.view')`).rejects.toMatchObject({ code: '42501' });
  });

  it('a non-member cannot resolve a tenant context (404, not 403)', async () => {
    const a = await makeTenant();
    const stranger = await makeUser();
    await expect(resolveTenantContext(stranger, a.slug, 'r', null)).rejects.toMatchObject({ code: 'not_found' });
  });
});

describe('capabilities', () => {
  it('specialist defaults exclude costs and other bookings', () => {
    const caps = effectiveCapabilities('specialist', [], []);
    expect(caps.has('bookings.view_assigned')).toBe(true);
    expect(caps.has('bookings.manage')).toBe(false);
    expect(caps.has('finance.view')).toBe(false);
  });

  it('delegation only grants capabilities delegable to that role', () => {
    const rec = effectiveCapabilities('receptionist', ['finance.view', 'storefront.edit', 'ownership.transfer'], []);
    expect(rec.has('finance.view')).toBe(false); // receptionists never see confidential costs
    expect(rec.has('storefront.edit')).toBe(true);
    expect(rec.has('ownership.transfer')).toBe(false);
    const mgr = effectiveCapabilities('manager', ['finance.view', 'campaign.approve'], []);
    expect(mgr.has('finance.view')).toBe(true);
    expect(mgr.has('campaign.approve')).toBe(true);
  });

  it('membership context carries effective capabilities', async () => {
    const t = await makeTenant();
    const rec = await addMember(t, 'receptionist');
    const ctx = await t.ctx(rec);
    expect(ctx.role).toBe('receptionist');
    expect(ctx.caps.has('bookings.manage')).toBe(true);
    expect(ctx.caps.has('finance.view')).toBe(false);
  });
});

describe('customer self-read never crosses tenant scope', () => {
  it('inside tenant A scope, the customer’s booking-relationship row at tenant B is invisible', async () => {
    const { ensureTenantCustomer } = await import('@/server/booking/service');
    const a = await makeTenant({ name: 'Salon One' });
    const b = await makeTenant({ name: 'Salon Two' });
    const cust = await makeUser({ name: 'Shared Customer' });
    await withTenant({ tenantId: b.tenantId, userId: cust.userId }, (tx) => ensureTenantCustomer(tx, b.tenantId, { userId: cust.userId, displayName: 'C' }));
    const seenInA = await withTenant({ tenantId: a.tenantId, userId: cust.userId }, (tx) => tx`select tenant_id from tenant_customers`);
    expect(seenInA).toHaveLength(0);
    const own = await withUser(cust.userId, (tx) => tx`select tenant_id from tenant_customers`);
    expect(own.map((r) => r.tenantId)).toEqual([b.tenantId]);
  });
});

describe('member self-read never crosses tenant scope', () => {
  it('a member of tenant B cannot resolve tenant A, and sees no B memberships inside A scope', async () => {
    const a = await makeTenant({ name: 'Salon Alpha' });
    const b = await makeTenant({ name: 'Salon Beta' });
    await expect(resolveTenantContext(b.owner, a.slug, 'r', null)).rejects.toMatchObject({ code: 'not_found' });
    const rows = await withTenant({ tenantId: a.tenantId, userId: b.owner.userId }, (tx) => tx`select tenant_id from tenant_memberships`);
    expect(rows.every((r) => r.tenantId === a.tenantId)).toBe(true);
    expect(rows.some((r) => r.tenantId === b.tenantId)).toBe(false);
  });
});
