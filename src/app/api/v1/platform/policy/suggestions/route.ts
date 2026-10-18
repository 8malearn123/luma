import { z } from 'zod';
import { api } from '@/server/http/handler';
import { platformSuggestions } from '@/server/policy/service';

/** Rule-based suggestions for a reviewer. Never applied automatically. */
export const GET = api.platform('platform.policy.review', async (c) => {
  const { customerUserId } = c.query(z.object({ customerUserId: z.string().uuid() }));
  return { items: await platformSuggestions(c.p, customerUserId), note: 'suggestions_only' };
});
