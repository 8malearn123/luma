import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { regeneratePlan } from '@/server/marketing/analysis';

export const POST = api.tenant<{ id: string }>('marketing.manage', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  return tx(c.t, (db) => regeneratePlan(db, c.t, c.params.id));
}, { rateLimit: [20, 3600] });
