import { z } from 'zod';
import { api } from '@/server/http/handler';
import { acceptInvitation } from '@/server/dashboard/members';

export const POST = api.user(async (c) => {
  const b = await c.json(z.object({ token: z.string().min(20).max(100) }));
  return acceptInvitation(c.user, b.token);
}, { rateLimit: [20, 3600] });
