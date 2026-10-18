import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { auditLog } from '@/server/dashboard/settings';

export const GET = api.tenant('audit.view', async (c) => {
  const q = c.query(z.object({ action: z.string().max(60).optional(), actor: z.string().max(60).optional(), from: z.string().datetime({ offset: true }).optional(), to: z.string().datetime({ offset: true }).optional(), offset: z.coerce.number().int().min(0).default(0) }));
  return tx(c.t, (db) => auditLog(db, c.t.tenant.id, q));
});
