import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { futureAssignments } from '@/server/services/team';

export const GET = api.tenant<{ id: string }>(['staff.manage', 'hr.manage'], async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  return { items: await tx(c.t, (db) => futureAssignments(db, c.params.id)) };
});
