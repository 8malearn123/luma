import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { readiness } from '@/server/services/onboarding';

export const GET = api.tenant(['tenant.settings.manage', 'storefront.publish', 'storefront.edit'], async (c) => tx(c.t, (db) => readiness(db)));
