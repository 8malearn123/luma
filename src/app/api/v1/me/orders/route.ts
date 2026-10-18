import { api } from '@/server/http/handler';
import { myOrders } from '@/server/booking/customer';

export const GET = api.user(async (c) => ({ items: await myOrders(c.user.userId) }));
