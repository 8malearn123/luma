import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { integrationsOverview } from '@/server/services/integrations';

export const GET = api.tenant(['tenant.settings.manage', 'payments.configure'], async (c) => tx(c.t, (db) => integrationsOverview(db, c.t)));
