import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { getIncident } from '@/server/policy/service';

export const GET = api.tenant<{ id: string }>(['incidents.submit', 'incidents.review'], async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  return tx(c.t, (db) => getIncident(db, c.params.id));
});
