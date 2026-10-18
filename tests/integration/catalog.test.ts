import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, withTenant } from '@/server/db';
import { createCategory, createService, decidePriceChange, getService, listServices, resolvePricing, setServiceStatus, updateCategory, updateService } from '@/server/services/catalog';
import { createStaff } from '@/server/services/team';
import { redactCosts } from '@/server/services/catalog-redact';
import { serviceInput } from '@/lib/validation/catalog';
import { addMember, makeTenant } from '../fixtures';
import type { TenantContext } from '@/server/tenancy/context';

afterAll(closeDb);
const run = <T>(ctx: TenantContext, fn: Parameters<typeof withTenant<T>>[1]) => withTenant({ tenantId: ctx.tenant.id, userId: ctx.user.userId }, fn);
const svc = (o: Record<string, unknown> = {}) => serviceInput.parse({ name: 'Cut', priceMinor: 10000, durationMin: 60, ...o });

describe('catalog permissions', () => {
  it('receptionist cannot edit services without delegation; can with catalog delegation; never sees costs', async () => {
    const t = await makeTenant();
    const rec = await addMember(t, 'receptionist');
    const recCtx = await t.ctx(rec);
    await expect(run(recCtx, (tx) => createService(tx, recCtx, svc()))).rejects.toMatchObject({ code: 'forbidden' });
    const del = await addMember(t, 'receptionist', { granted: ['catalog.manage'] });
    const delCtx = await t.ctx(del);
    const s = await run(delCtx, (tx) => createService(tx, delCtx, svc({ materialCostMinor: 1500 })));
    const row = await run(delCtx, (tx) => getService(tx, s.id));
    expect(redactCosts(delCtx, row as never)).not.toHaveProperty('materialCostMinor');
    const owner = await t.ctx();
    expect(redactCosts(owner, row as never)).toHaveProperty('materialCostMinor', 1500);
  });

  it('price changes by a delegate become proposals; owner approval applies them', async () => {
    const t = await makeTenant();
    const owner = await t.ctx();
    const s = await run(owner, (tx) => createService(tx, owner, svc()));
    const del = await t.ctx(await addMember(t, 'receptionist', { granted: ['catalog.manage'] }));
    const r = await run(del, (tx) => updateService(tx, del, s.id, svc({ priceMinor: 12000 }), 1));
    expect(r.pricePendingApproval).toBe(true);
    let cur = await run(owner, (tx) => getService(tx, s.id));
    expect(cur.priceMinor).toBe(10000);
    await expect(run(del, (tx) => decidePriceChange(tx, del, (cur.pendingPriceChanges[0] as { id: string }).id, true))).rejects.toMatchObject({ code: 'forbidden' });
    await run(owner, (tx) => decidePriceChange(tx, owner, (cur.pendingPriceChanges[0] as { id: string }).id, true));
    cur = await run(owner, (tx) => getService(tx, s.id));
    expect(cur.priceMinor).toBe(12000);
    // stale version
    await expect(run(owner, (tx) => updateService(tx, owner, s.id, svc(), 1))).rejects.toMatchObject({ code: 'version_conflict' });
  });

  it('plan service limit is enforced server-side and existing data is kept after downgrade', async () => {
    const t = await makeTenant();
    const owner = await t.ctx();
    const [plan] = await run(owner, (tx) => tx<{ planId: string }[]>`select plan_id from subscriptions limit 1`);
    // simulate a downgrade to a 2-service limit after 3 services exist
    for (let i = 0; i < 3; i++) await run(owner, (tx) => createService(tx, owner, svc({ name: `S${i}` })));
    await run(owner, (tx) => tx`update plan_features set limit_value = 2 where plan_id = ${plan.planId} and feature_key = 'services.max'`);
    await expect(run(owner, (tx) => createService(tx, owner, svc({ name: 'S4' })))).rejects.toMatchObject({ code: 'plan_limit' });
    const list = await run(owner, (tx) => listServices(tx));
    expect(list.items).toHaveLength(3);
    await run(owner, (tx) => tx`update plan_features set limit_value = 30 where plan_id = ${plan.planId} and feature_key = 'services.max'`);
  });

  it('variant + specialist price rules resolve most-specific-first', async () => {
    const t = await makeTenant();
    const owner = await t.ctx();
    const staff = await run(owner, (tx) => createStaff(tx, owner, { displayName: 'Senior', branchIds: [t.branchId], serviceIds: [], publicVisible: true, allocationWeight: 100 }));
    const s = await run(owner, (tx) => createService(tx, owner, svc({ staffIds: [staff.id], variants: [{ name: 'Long hair', priceMinor: 15000, durationMin: 90 }] })));
    const full = await run(owner, (tx) => getService(tx, s.id));
    const variantId = (full.variants[0] as { id: string }).id;
    await run(owner, (tx) => updateService(tx, owner, s.id, svc({ staffIds: [staff.id], variants: [{ id: variantId, name: 'Long hair', priceMinor: 15000, durationMin: 90 }], priceRules: [{ staffId: staff.id, priceMinor: 13000 }, { staffId: staff.id, variantId, priceMinor: 18000, durationMin: 100 }] }), 1));
    expect(await run(owner, (tx) => resolvePricing(tx, s.id, null, staff.id))).toEqual({ priceMinor: 13000, durationMin: 60 });
    expect(await run(owner, (tx) => resolvePricing(tx, s.id, variantId, staff.id))).toEqual({ priceMinor: 18000, durationMin: 100 });
    expect(await run(owner, (tx) => resolvePricing(tx, s.id, variantId, null))).toEqual({ priceMinor: 15000, durationMin: 90 });
  });

  it('other tenants’ staff cannot be attached to a service', async () => {
    const a = await makeTenant();
    const b = await makeTenant();
    const bOwner = await b.ctx();
    const bStaff = await run(bOwner, (tx) => createStaff(tx, bOwner, { displayName: 'B', branchIds: [b.branchId], serviceIds: [], publicVisible: true, allocationWeight: 100 }));
    const aOwner = await a.ctx();
    await expect(run(aOwner, (tx) => createService(tx, aOwner, svc({ staffIds: [bStaff.id] })))).rejects.toMatchObject({ code: '23503' });
  });

  it('hidden categories keep their items; archived services stay in history', async () => {
    const t = await makeTenant();
    const owner = await t.ctx();
    const cat = await run(owner, (tx) => createCategory(tx, owner, { kind: 'service', name: 'Hair' }));
    const s = await run(owner, (tx) => createService(tx, owner, svc({ categoryId: cat.id })));
    await run(owner, (tx) => updateCategory(tx, owner, cat.id, { status: 'hidden' }));
    const [row] = await run(owner, (tx) => tx`select category_id, status from services where id = ${s.id}`);
    expect(row).toMatchObject({ categoryId: cat.id, status: 'active' });
    await run(owner, (tx) => setServiceStatus(tx, owner, s.id, 'archived'));
    expect((await run(owner, (tx) => listServices(tx))).items).toHaveLength(0);
    expect((await run(owner, (tx) => listServices(tx, { status: 'archived' }))).items).toHaveLength(1);
  });
});
