import { api } from '@/server/http/handler';
import { myPaymentStatus } from '@/server/booking/customer';

/** Return-page polling. Truth comes from verified provider events, never from the redirect. */
export const GET = api.user<{ id: string }>(async (c) => myPaymentStatus(c.user.userId, c.params.id), { rateLimit: [120, 60] });
