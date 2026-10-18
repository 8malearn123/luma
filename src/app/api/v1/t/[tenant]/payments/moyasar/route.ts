import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { moyasarKeysInput, saveMoyasarKeys } from '@/server/payments/connect';
import { requireRecentStepUp } from '@/server/auth/service';

/** Save the business's Moyasar keys (encrypted). Requires re-authentication. Never echoes a secret. */
export const POST = api.tenant('payments.configure', async (c) => {
  requireRecentStepUp(c.user);
  const b = await c.json(moyasarKeysInput);
  return tx(c.t, (db) => saveMoyasarKeys(db, c.t, b));
}, { idempotent: true, rateLimit: [10, 3600] });
