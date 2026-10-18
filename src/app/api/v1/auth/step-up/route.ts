import { z } from 'zod';
import { api } from '@/server/http/handler';
import { stepUp } from '@/server/auth/service';

export const POST = api.user(async (c) => {
  const body = await c.json(z.object({ password: z.string().min(1).max(200) }));
  await stepUp(c.user, body.password);
  return { ok: true };
});
