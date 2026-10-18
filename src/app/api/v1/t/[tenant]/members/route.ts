import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { invite, inviteInput, listMembers } from '@/server/dashboard/members';

export const GET = api.tenant('team.manage', async (c) => tx(c.t, (db) => listMembers(db)));
export const POST = api.tenant('team.manage', async (c) => {
  const b = await c.json(inviteInput);
  return tx(c.t, (db) => invite(db, c.t, b));
}, { idempotent: true, rateLimit: [30, 3600] });
