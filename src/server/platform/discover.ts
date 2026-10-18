import { z } from 'zod';
import { withSystem } from '../db';

/**
 * Public directory: only ACTIVE tenants with a PUBLISHED storefront, and only
 * allowlisted public fields. Counts are computed from data, never hardcoded.
 * Service matching uses visible, active services in non-hidden categories.
 */
export const discoverQuery = z.object({
  city: z.string().trim().max(80).optional(),
  type: z.enum(['salon', 'expert', 'spa', 'clinic', 'studio']).optional(),
  q: z.string().trim().max(80).optional(),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});

export async function discoverTenants(q: z.infer<typeof discoverQuery>) {
  const like = q.q ? `%${q.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%` : null;
  return withSystem('public directory (allowlisted fields)', async (tx) => {
    const where = tx`t.status = 'active' and t.published_version_id is not null and not t.is_demo
      and (${q.city ?? null}::text is null or t.city = ${q.city ?? null})
      and (${q.type ?? null}::text is null or t.business_type = ${q.type ?? null})
      and (${like}::text is null or t.name ilike ${like} or exists (
        select 1 from services s left join categories c on c.id = s.category_id
        where s.tenant_id = t.id and s.status = 'active' and s.is_visible and coalesce(c.status, 'active') = 'active'
          and (s.name ilike ${like} or s.name_en ilike ${like} or c.name ilike ${like})))`;
    const items = await tx<{ slug: string; name: string; city: string | null; businessType: string; tagline: string | null; serviceCount: number }[]>`
      select t.slug, t.name, t.city, t.business_type, p.tagline,
        (select count(*)::int from services s where s.tenant_id = t.id and s.status = 'active' and s.is_visible) as service_count
      from tenants t left join tenant_profiles p on p.tenant_id = t.id
      where ${where} order by t.name limit 25 offset ${q.offset}`;
    const [{ total }] = await tx<{ total: number }[]>`select count(*)::int as total from tenants t where ${where}`;
    const cities = (await tx<{ city: string }[]>`select distinct city from tenants where status = 'active' and published_version_id is not null and city is not null order by city`).map((c) => c.city);
    return { items: items.slice(0, 24), hasMore: items.length > 24, total, cities };
  });
}
