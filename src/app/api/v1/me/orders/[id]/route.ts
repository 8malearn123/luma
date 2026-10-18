import { api } from '@/server/http/handler';
import { myOrderDetail } from '@/server/booking/customer';

export const GET = api.user<{ id: string }>(async (c) => myOrderDetail(c.user.userId, c.params.id));
