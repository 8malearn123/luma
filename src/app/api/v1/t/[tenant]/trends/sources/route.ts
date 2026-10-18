import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { addSource } from '@/server/marketing/trends';

export const POST = api.tenant('marketing.manage', async (c) => {
  const b = await c.json(z.object({ kind: z.enum(['rss', 'user_link']), name: z.string().trim().min(1).max(120), url: z.string().max(500) }));
  return tx(c.t, (db) => addSource(db, c.t, b));
}, { rateLimit: [30, 3600] });
