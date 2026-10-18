import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';

/** Open recommendations stay available for study until a decision or a material data change. */
export const GET = api.tenant('marketing.view', async (c) => {
  const q = c.query(z.object({ status: z.enum(['proposed', 'accepted', 'dismissed', 'deferred', 'expired', 'superseded', 'all']).default('proposed') }));
  return tx(c.t, async (db) => {
    await db`update recommendations set status = 'expired' where status in ('proposed','deferred') and expires_at < now()`;
    const items = await db`select id, category, horizon, title, content, validation, status, source_type, provenance, data_as_of, review_at, expires_at, decided_at, created_at
                           from recommendations where (${q.status} = 'all' or status = ${q.status}) order by created_at desc limit 100`;
    return { items: c.t.caps.has('finance.view') ? items : items.map((r) => ({ ...r, content: stripCosts(r.content as Record<string, unknown>) })) };
  });
});

/** Members without finance.view never see material-cost figures. */
function stripCosts(content: Record<string, unknown>) {
  const mm = (content.measured_metrics ?? {}) as Record<string, number>;
  return { ...content, measured_metrics: Object.fromEntries(Object.entries(mm).filter(([k]) => !k.includes('cost'))) };
}
