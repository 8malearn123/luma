import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { messagingSettings, messagingSettingsInput, providerStatus, updateMessagingSettings } from '@/server/services/messages';

export const GET = api.tenant('tenant.settings.manage', async (c) => ({ settings: await tx(c.t, (db) => messagingSettings(db)), providers: providerStatus() }));

export const PUT = api.tenant('tenant.settings.manage', async (c) => {
  const b = await c.json(messagingSettingsInput);
  await tx(c.t, (db) => updateMessagingSettings(db, c.t, b));
  return { ok: true };
});
