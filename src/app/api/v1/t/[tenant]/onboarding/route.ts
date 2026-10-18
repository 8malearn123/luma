import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { getSession, patchInput, readiness, saveStep } from '@/server/services/onboarding';

export const GET = api.tenant('tenant.settings.manage', async (c) =>
  tx(c.t, async (db) => {
    const [session, ready, profile, tenant, branch, hours] = await Promise.all([
      getSession(db),
      readiness(db),
      db`select logo_asset_id, cover_asset_id, wordmark_text, tagline, intro, contact_phone, whatsapp, contact_email, address, socials,
                brand_character, brand_description, excluded_colors, target_audience, store_priorities from tenant_profiles limit 1`,
      db`select name, business_type, city, slug from tenants where id = ${c.t.tenant.id}`,
      db`select id, name, city from branches where is_primary and status = 'active' limit 1`,
      db`select weekday, to_char(start_time,'HH24:MI') as start, to_char(end_time,'HH24:MI') as end from working_hours w
         join branches b on b.id = w.branch_id and b.is_primary where w.staff_id is null order by weekday, start_time`,
    ]);
    return { session, readiness: ready, profile: profile[0] ?? null, tenant: tenant[0], branch: branch[0] ?? null, hours };
  }),
);

export const PATCH = api.tenant('tenant.settings.manage', async (c) => {
  const body = await c.json(patchInput);
  const session = await tx(c.t, (db) => saveStep(db, c.t, body));
  return { session };
});
