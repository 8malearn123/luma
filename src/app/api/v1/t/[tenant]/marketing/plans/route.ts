import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { listPlans } from '@/server/marketing/plans';

export const GET = api.tenant('marketing.view', async (c) => tx(c.t, async (db) => ({ items: await listPlans(db) })));
