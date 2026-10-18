import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { financeSettingsInput, updateFinanceSettings } from '@/server/dashboard/settings';

export const PUT = api.tenant('tenant.settings.manage', async (c) => {
  const b = await c.json(financeSettingsInput);
  await tx(c.t, (db) => updateFinanceSettings(db, c.t, b));
  return { ok: true };
});
