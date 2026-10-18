import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { branchInput, upsertBranch } from '@/server/dashboard/settings';

export const POST = api.tenant('tenant.settings.manage', async (c) => {
  const b = await c.json(branchInput);
  return tx(c.t, (db) => upsertBranch(db, c.t, b));
}, { idempotent: true });
