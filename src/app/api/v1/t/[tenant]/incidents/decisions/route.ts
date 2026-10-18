import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { createTenantDecision, decisionInput, listTenantDecisions } from '@/server/policy/service';

export const GET = api.tenant('incidents.review', async (c) => ({ items: await tx(c.t, (db) => listTenantDecisions(db, c.t)) }));
export const POST = api.tenant('incidents.review', async (c) => {
  const body = await c.json(decisionInput);
  return tx(c.t, (db) => createTenantDecision(db, c.t, body));
}, { idempotent: true });
