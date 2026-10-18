import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { listTrends } from '@/server/marketing/trends';
import { env } from '@/server/env';

export const GET = api.tenant('marketing.view', async (c) => tx(c.t, async (db) => ({ fetchingEnabled: env().TRENDS_FETCH_ENABLED, ...(await listTrends(db)) })));
