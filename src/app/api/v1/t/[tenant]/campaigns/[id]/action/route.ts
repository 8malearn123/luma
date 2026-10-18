import { z } from 'zod';
import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { approveCampaign, cancelCampaign, scheduleCampaign, sendCampaign } from '@/server/marketing/campaigns';
import { isProduction } from '@/server/env';

const body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve') }),
  z.object({ action: z.literal('schedule'), at: z.string().datetime({ offset: true }) }),
  z.object({ action: z.literal('send_simulated') }),
  z.object({ action: z.literal('cancel') }),
]);

export const POST = api.tenant<{ id: string }>(['marketing.manage', 'campaign.approve'], async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  const b = await c.json(body);
  return tx(c.t, async (db) => {
    if (b.action === 'approve') return approveCampaign(db, c.t, c.params.id).then(() => ({ ok: true }));
    if (b.action === 'schedule') return scheduleCampaign(db, c.t, c.params.id, new Date(b.at));
    if (b.action === 'send_simulated') return sendCampaign(db, c.t, c.params.id, { production: isProduction() });
    await cancelCampaign(db, c.t, c.params.id);
    return { ok: true };
  });
}, { idempotent: true });
