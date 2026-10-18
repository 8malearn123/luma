import { sql } from './db';
import { env } from './env';

export const demoLoginAllowed = () => env().LUMA_DEMO_MODE && env().NODE_ENV !== 'production';

export async function listDemoAccounts() {
  if (!demoLoginAllowed()) return [];
  return sql()<{ userId: string; displayName: string; label: string }[]>`
    select u.id as user_id, u.display_name,
      coalesce(
        (select 'LUMA · ' || p.role from platform_staff p where p.user_id = u.id),
        (select t.name || ' · ' || m.role from tenant_memberships m join tenants t on t.id = m.tenant_id
          where m.user_id = u.id and m.status = 'active' order by m.created_at limit 1),
        'customer') as label
    from users u where u.is_demo and u.status = 'active' order by u.created_at`;
}

export async function demoHomeFor(userId: string): Promise<string> {
  const [p] = await sql()`select 1 from platform_staff where user_id = ${userId} and status = 'active'`;
  if (p) return '/platform';
  const [m] = await sql()<{ slug: string; role: string }[]>`
    select t.slug, m.role from tenant_memberships m join tenants t on t.id = m.tenant_id
    where m.user_id = ${userId} and m.status = 'active' order by m.created_at limit 1`;
  if (m) return m.role === 'specialist' ? `/staff?t=${m.slug}` : `/app/${m.slug}`;
  return '/account';
}
