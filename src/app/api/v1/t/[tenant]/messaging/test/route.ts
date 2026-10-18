import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { testSend, testSendInput } from '@/server/services/messages';

/** Simulated test send: renders with sample data; nothing leaves the server. */
export const POST = api.tenant('tenant.settings.manage', async (c) => {
  const b = await c.json(testSendInput);
  return tx(c.t, (db) => testSend(db, c.t, b));
}, { rateLimit: [20, 600] });
