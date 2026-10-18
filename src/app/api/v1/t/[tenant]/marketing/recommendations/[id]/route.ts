import { z } from 'zod';
import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { audit } from '@/server/audit';

export const POST = api.tenant<{ id: string }>('marketing.manage', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  const b = await c.json(z.object({ decision: z.enum(['accepted', 'dismissed', 'deferred']) }));
  return tx(c.t, async (db) => {
    const r = await db`update recommendations set status = ${b.decision}, decided_by = ${c.user.userId}, decided_at = now()
                       where id = ${c.params.id} and status in ('proposed','deferred') returning id`;
    if (!r.length) throw notFound();
    await audit(db, { actorUserId: c.user.userId, actorKind: c.t.actorKind, tenantId: c.t.tenant.id, action: `marketing.recommendation_${b.decision}`, targetType: 'recommendation', targetId: c.params.id, requestId: c.requestId });
    return { ok: true };
  });
});
