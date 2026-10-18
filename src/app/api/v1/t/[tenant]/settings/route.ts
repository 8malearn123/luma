import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { businessInput, getSettings, updateBusiness } from '@/server/dashboard/settings';

export const GET = api.tenant(['tenant.settings.manage', 'team.manage', 'subscription.view', 'payments.configure'], async (c) => tx(c.t, (db) => getSettings(db)));
export const PATCH = api.tenant('tenant.settings.manage', async (c) => {
  const b = await c.json(businessInput);
  await tx(c.t, (db) => updateBusiness(db, c.t, b));
  return { ok: true };
});
