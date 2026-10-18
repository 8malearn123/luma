import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { conditionSchema, explainSegment, segmentMembers } from '@/server/marketing/campaigns';

/** Counts only — never lists customers. */
export const POST = api.tenant('marketing.manage', async (c) => {
  const b = await c.json(z.object({ conditions: z.array(conditionSchema).min(1).max(8) }));
  return tx(c.t, async (db) => ({ count: (await segmentMembers(db, b)).length, explanation: explainSegment(b, c.user.locale) }));
});
