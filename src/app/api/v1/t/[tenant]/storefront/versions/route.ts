import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { listVersions } from '@/server/storefront/publish';

export const GET = api.tenant(['storefront.edit', 'storefront.publish'], async (c) => ({ items: await tx(c.t, (db) => listVersions(db)) }));
