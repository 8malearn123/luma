import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';

export const GET = api.tenant('marketing.view', async (c) =>
  tx(c.t, async (db) => ({
    items: await db`select id, kind, status, attempts, error, payload, created_at, finished_at from job_runs
                    where tenant_id = ${c.t.tenant.id} and kind in ('marketing.analysis') order by created_at desc limit 20`,
  })),
);
