import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { assessCluster } from '@/server/marketing/trends';

export const POST = api.tenant('marketing.manage', async (c) => {
  const b = await c.json(z.object({ clusterKey: z.string().min(1).max(200) }));
  return tx(c.t, (db) => assessCluster(db, c.t, b.clusterKey));
}, { rateLimit: [60, 3600] });
