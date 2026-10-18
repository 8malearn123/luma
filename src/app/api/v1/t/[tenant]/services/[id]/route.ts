import { z } from 'zod';
import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { getService, updateService } from '@/server/services/catalog';
import { redactCosts } from '@/server/services/catalog-redact';
import { serviceInput } from '@/lib/validation/catalog';

export const GET = api.tenant<{ id: string }>(['catalog.manage', 'bookings.manage'], async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  const s = await tx(c.t, (db) => getService(db, c.params.id));
  return { service: redactCosts(c.t, s as unknown as Record<string, unknown>) };
});

export const PUT = api.tenant<{ id: string }>('catalog.manage', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  const body = await c.json(serviceInput.extend({ expectedVersion: z.number().int().min(1) }));
  const { expectedVersion, ...input } = body;
  // without finance visibility the editor never saw the cost: keep the stored value
  return tx(c.t, async (db) => {
    if (!c.t.caps.has('finance.view')) {
      const [cur] = await db<{ materialCostMinor: number | null }[]>`select material_cost_minor from services where id = ${c.params.id}`;
      input.materialCostMinor = cur?.materialCostMinor ?? null;
    }
    return updateService(db, c.t, c.params.id, input, expectedVersion);
  });
});
