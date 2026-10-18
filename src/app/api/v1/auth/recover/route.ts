import { z } from 'zod';
import { api } from '@/server/http/handler';
import { requestRecovery } from '@/server/auth/service';

export const POST = api.public(async (c) => {
  const body = await c.json(z.object({ identifier: z.string().min(5).max(254) }));
  return requestRecovery(body.identifier, c.ip);
});
