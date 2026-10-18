import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { deliveryBoard } from '@/server/commerce/delivery';

/** Active delivery orders (staff board). */
export const GET = api.tenant('orders.manage', async (c) => ({ items: await tx(c.t, (db) => deliveryBoard(db)) }));
