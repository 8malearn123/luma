import { z } from 'zod';
import { api } from '@/server/http/handler';
import { CONSENT_CHANNELS, myConsents, setConsent } from '@/server/booking/customer';
import { audit } from '@/server/audit';
import { sql } from '@/server/db';

/** Marketing consent per business and channel. Every change is a new record (history kept). */
export const GET = api.user(async (c) => ({ items: await myConsents(c.user.userId) }));

export const POST = api.user(async (c) => {
  const b = await c.json(z.object({ tenantId: z.string().uuid(), channel: z.enum(CONSENT_CHANNELS), granted: z.boolean() }));
  await setConsent(c.user.userId, b.tenantId, b.channel, b.granted);
  await audit(sql(), { actorUserId: c.user.userId, actorKind: 'customer', tenantId: b.tenantId, action: b.granted ? 'consent.granted' : 'consent.revoked', metadata: { channel: b.channel } });
  return { ok: true };
});
