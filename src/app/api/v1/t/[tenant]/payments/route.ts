import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { connectSandbox, disconnectProvider } from '@/server/payments/service';
import { env, isProduction } from '@/server/env';
import { PROVIDER_METHODS } from '@/server/payments/providers';
import { paymentConnections } from '@/server/payments/connect';

/** Payment provider status — honest: sandbox (test, no money), Moyasar adapter untested/not connected. */
export const GET = api.tenant(['payments.configure', 'finance.view'], async (c) =>
  tx(c.t, async (db) => {
    const conn = await paymentConnections(db);
    return {
      ...conn,
      providers: [
        { key: 'sandbox', available: !isProduction() && env().PAYMENTS_SANDBOX_ENABLED, status: 'test_only', methods: PROVIDER_METHODS.sandbox },
        { key: 'moyasar', available: env().MOYASAR_ENABLED, status: 'untested_adapter', methods: PROVIDER_METHODS.moyasar },
      ],
    };
  }),
);
export const POST = api.tenant('payments.configure', async (c) => {
  const b = await c.json(z.object({ provider: z.literal('sandbox') }));
  void b;
  return tx(c.t, (db) => connectSandbox(db, c.t));
}, { idempotent: true });
export const DELETE = api.tenant('payments.configure', async (c) => {
  await tx(c.t, (db) => disconnectProvider(db, c.t));
  return { ok: true };
});
