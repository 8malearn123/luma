import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { incidentInput, listIncidents, submitIncident } from '@/server/policy/service';

export const GET = api.tenant(['incidents.submit', 'incidents.review'], async (c) => {
  const q = c.query(z.object({ status: z.enum(['submitted', 'under_review', 'confirmed', 'rejected', 'corrected']).optional() }));
  return { items: await tx(c.t, (db) => listIncidents(db, q)) };
});

export const POST = api.tenant('incidents.submit', async (c) => {
  const body = await c.json(incidentInput);
  return tx(c.t, (db) => submitIncident(db, c.t, body));
}, { idempotent: true });
