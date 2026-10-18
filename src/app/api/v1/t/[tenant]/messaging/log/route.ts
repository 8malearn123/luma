import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { deliveryLog } from '@/server/services/messages';

export const GET = api.tenant(['tenant.settings.manage', 'marketing.view'], async (c) => {
  const q = c.query(z.object({
    channel: z.enum(['email', 'sms', 'whatsapp', 'push', 'in_app']).optional(),
    status: z.enum(['simulated', 'queued', 'sent', 'delivered', 'failed', 'suppressed']).optional(),
    offset: z.coerce.number().int().min(0).max(10000).default(0),
  }));
  return tx(c.t, (db) => deliveryLog(db, c.t.tenant.id, q));
});
