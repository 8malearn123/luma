import { z } from 'zod';
import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { deleteAsset, updateAssetAlt } from '@/server/services/assets';

export const PATCH = api.tenant<{ id: string }>(['storefront.edit', 'catalog.manage'], async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  const b = await c.json(z.object({ altAr: z.string().max(300), altEn: z.string().max(300).optional() }));
  await tx(c.t, (db) => updateAssetAlt(db, c.t, c.params.id, b.altAr, b.altEn));
  return { ok: true };
});

export const DELETE = api.tenant<{ id: string }>(['storefront.edit', 'catalog.manage'], async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  await tx(c.t, (db) => deleteAsset(db, c.t, c.params.id));
  return { ok: true };
});
