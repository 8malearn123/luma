import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { getProfile, profileInput, updateProfile } from '@/server/storefront/profile';

export const GET = api.tenant(['storefront.edit', 'tenant.settings.manage'], async (c) => ({ profile: await tx(c.t, (db) => getProfile(db)) }));

export const PATCH = api.tenant(['storefront.edit', 'tenant.settings.manage'], async (c) => {
  const b = await c.json(profileInput);
  return { profile: await tx(c.t, (db) => updateProfile(db, c.t, b)) };
});
