import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { subscriptionView } from '@/server/dashboard/settings';

export const GET = api.tenant(['subscription.view', 'subscription.manage'], async (c) => tx(c.t, (db) => subscriptionView(db, c.t.tenant.id)));
