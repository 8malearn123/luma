import { NextResponse } from 'next/server';
import { z } from 'zod';
import { api } from '@/server/http/handler';
import { AppError } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { getDraft, saveDraft } from '@/server/storefront/drafts';

export const GET = api.tenant('storefront.edit', async (c) => {
  const d = await tx(c.t, (db) => getDraft(db));
  return NextResponse.json({ document: d.document, version: d.version, updatedAt: d.updatedAt }, { headers: { etag: `"${d.version}"`, 'cache-control': 'no-store' } });
});

/** Full-document save. Version from body.expectedVersion or If-Match; mismatch → 409. */
export const PUT = api.tenant('storefront.edit', async (c) => {
  const body = await c.json(z.object({ document: z.unknown(), expectedVersion: z.number().int().optional() }));
  const ifMatch = c.req.headers.get('if-match')?.replace(/"/g, '');
  const expected = body.expectedVersion ?? (ifMatch && /^\d+$/.test(ifMatch) ? Number(ifMatch) : undefined);
  if (expected === undefined) throw new AppError('validation', 'errors.version_required');
  const r = await tx(c.t, (db) => saveDraft(db, c.t, body.document, expected, { source: 'manual' }));
  return NextResponse.json({ version: r.version, issues: r.issues }, { headers: { etag: `"${r.version}"` } });
}, { rateLimit: [240, 3600] });
