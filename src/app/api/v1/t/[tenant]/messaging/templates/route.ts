import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { CHANNELS, listTemplates, resetTemplate, saveTemplate, TEMPLATE_KEYS, TEMPLATE_VARS, templateInput } from '@/server/services/messages';

export const GET = api.tenant('tenant.settings.manage', async (c) => ({ items: await tx(c.t, (db) => listTemplates(db, c.t.tenant.id)), vars: TEMPLATE_VARS }));

export const PUT = api.tenant('tenant.settings.manage', async (c) => {
  const b = await c.json(templateInput);
  await tx(c.t, (db) => saveTemplate(db, c.t, b));
  return { ok: true };
});

export const DELETE = api.tenant('tenant.settings.manage', async (c) => {
  const q = c.query(z.object({ key: z.enum(TEMPLATE_KEYS), channel: z.enum(CHANNELS), locale: z.enum(['ar', 'en']) }));
  await tx(c.t, (db) => resetTemplate(db, c.t, q));
  return { ok: true };
});
