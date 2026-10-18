import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { proposeCustomization } from '@/server/marketing/customize';

export const GET = api.tenant('storefront.edit', async (c) =>
  tx(c.t, async (db) => ({
    items: await db`select id, prompt, patch, explanation, rejected_ops, status, base_draft_version, applied_draft_version, created_at from customization_requests order by created_at desc limit 20`,
  })),
);

/** Propose a design patch from natural language. Applies nothing until accepted. */
export const POST = api.tenant('storefront.edit', async (c) => {
  const b = await c.json(z.object({ prompt: z.string().trim().min(3).max(1000) }));
  return tx(c.t, (db) => proposeCustomization(db, c.t, b.prompt));
}, { rateLimit: [40, 3600] });
