import { api } from '@/server/http/handler';
import { listTemplates, templateInput, upsertTemplate } from '@/server/platform/service';

export const GET = api.platform('platform.templates.manage', async (c) => ({ items: await listTemplates(c.p) }));
export const POST = api.platform('platform.templates.manage', async (c) => upsertTemplate(c.p, await c.json(templateInput)));
