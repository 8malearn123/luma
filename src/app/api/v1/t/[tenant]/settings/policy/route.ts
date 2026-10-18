import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { policyInput, updatePolicy } from '@/server/dashboard/settings';

export const PUT = api.tenant('tenant.settings.manage', async (c) => {
  const b = await c.json(policyInput);
  return tx(c.t, (db) => updatePolicy(db, c.t, b));
});
