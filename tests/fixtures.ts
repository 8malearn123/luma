import { randomUUID } from 'node:crypto';
import { sql, withTenant } from '@/server/db';
import { createSession, resolveSession, type SessionUser } from '@/server/auth/service';
import { hashPassword } from '@/server/crypto';
import { createTenant } from '@/server/services/tenants';
import { resolveTenantContext, type TenantContext } from '@/server/tenancy/context';
import type { TenantRole } from '@/server/tenancy/capabilities';

let n = 0;
const uniq = () => `${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export async function ensurePlans() {
  const [p] = await sql()`select id from plans where code = 'sanaa'`;
  if (p) return;
  await sql().begin(async (tx) => {
    const plans = [
      ['sanaa', 'سناء', 'Sanaa', 1, { 'branches.max': 1, 'staff.max': 3, 'services.max': 30, 'custom_pages.max': 3 }, ['products.enabled', 'waitlist.enabled']],
      ['wahaj', 'وهج', 'Wahaj', 2, { 'branches.max': 3, 'staff.max': 15, 'services.max': 150, 'custom_pages.max': 10, 'ai.monthly_runs': 30 }, ['products.enabled', 'marketing.enabled', 'loyalty.enabled', 'giftcards.enabled', 'waitlist.enabled', 'memberships.enabled', 'group_sessions.enabled']],
      ['fareed', 'فريد', 'Fareed', 3, { 'branches.max': null, 'staff.max': null, 'services.max': null, 'custom_pages.max': null, 'ai.monthly_runs': 200 }, ['products.enabled', 'marketing.enabled', 'loyalty.enabled', 'giftcards.enabled', 'waitlist.enabled', 'memberships.enabled', 'group_sessions.enabled', 'branding.remove_powered_by']],
    ] as const;
    for (const [code, ar, en, sort, limits, flags] of plans) {
      const [row] = await tx<{ id: string }[]>`insert into plans (code, name_ar, name_en, sort, price_is_test) values (${code}, ${ar}, ${en}, ${sort}, true) returning id`;
      for (const [k, v] of Object.entries(limits)) await tx`insert into plan_features (plan_id, feature_key, enabled, limit_value) values (${row.id}, ${k}, true, ${v})`;
      for (const k of flags) await tx`insert into plan_features (plan_id, feature_key, enabled) values (${row.id}, ${k}, true)`;
    }
  });
}

export async function makeUser(opts: { name?: string; email?: string; phone?: string; password?: string } = {}): Promise<SessionUser & { password: string }> {
  const email = opts.phone ? null : (opts.email ?? `u-${uniq()}@test.luma`);
  const password = opts.password ?? `pw-${uniq()}-Aa1!`;
  const [u] = await sql()<{ id: string }[]>`
    insert into users (email, phone, email_verified_at, phone_verified_at, password_hash, display_name)
    values (${email}, ${opts.phone ?? null}, ${email ? new Date() : null}, ${opts.phone ? new Date() : null},
            ${await hashPassword(password)}, ${opts.name ?? 'Test User'})
    returning id`;
  await sql()`insert into customer_profiles (user_id, full_name) values (${u.id}, ${opts.name ?? 'Test User'})`;
  const s = await createSession(u.id, null, 'vitest');
  const su = (await resolveSession(s.token))!;
  return { ...su, password };
}

export interface TenantFixture {
  tenantId: string;
  slug: string;
  branchId: string;
  owner: SessionUser;
  ctx: (u?: SessionUser) => Promise<TenantContext>;
}

export async function makeTenant(opts: { name?: string; businessType?: 'salon' | 'expert' } = {}): Promise<TenantFixture> {
  await ensurePlans();
  const owner = await makeUser({ name: 'Owner' });
  const slug = `t-${uniq()}`.toLowerCase().slice(0, 40);
  const r = await createTenant(owner, { name: opts.name ?? 'Test Salon', businessType: opts.businessType ?? 'salon', city: 'Riyadh', slug, locale: 'ar' });
  return {
    tenantId: r.tenantId,
    slug,
    branchId: r.branchId,
    owner,
    ctx: (u = owner) => resolveTenantContext(u, slug, randomUUID(), null),
  };
}

export async function addMember(t: TenantFixture, role: TenantRole, opts: { granted?: string[]; staffProfileId?: string | null } = {}) {
  const u = await makeUser({ name: role });
  await withTenant({ tenantId: t.tenantId }, (tx) => tx`
    insert into tenant_memberships (tenant_id, user_id, role, granted_caps, staff_profile_id)
    values (${t.tenantId}, ${u.userId}, ${role}, ${opts.granted ?? []}, ${opts.staffProfileId ?? null})`);
  return u;
}

export { uniq };
