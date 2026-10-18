import { api } from '@/server/http/handler';
import { myBookingDetail } from '@/server/booking/customer';

export const GET = api.user<{ id: string }>(async (c) => myBookingDetail(c.user.userId, c.params.id));
