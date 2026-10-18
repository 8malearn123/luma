import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { aiStatus } from '@/server/ai/provider';
import { checkBudget } from '@/server/ai/run';

/** Truthful AI connection state: not_configured | configured_untested | live_verified. */
export const GET = api.tenant(['marketing.view', 'storefront.edit'], async (c) =>
  tx(c.t, async (db) => {
    const status = await aiStatus(db);
    const budget = await checkBudget(db, c.t.tenant.id);
    const [usage] = await db`select runs, tokens_in, tokens_out, cost_micro_usd from ai_usage where period = ${`${new Date().toISOString().slice(0, 7)}-01`}`;
    return { ...status, budget, usage: usage ?? { runs: 0, tokensIn: 0, tokensOut: 0, costMicroUsd: 0 } };
  }),
);
