import { NextResponse } from 'next/server';
import { z } from 'zod';
import { api, uuid } from '@/server/http/handler';
import { notFound } from '@/server/errors';
import { tx } from '@/server/tenancy/context';
import { getPlan, planToCsv } from '@/server/marketing/plans';

export const GET = api.tenant<{ id: string }>('marketing.view', async (c) => {
  if (!uuid.safeParse(c.params.id).success) throw notFound();
  const q = c.query(z.object({ format: z.enum(['json', 'csv']).default('json'), version: z.coerce.number().int().optional() }));
  const p = await tx(c.t, (db) => getPlan(db, c.params.id));
  const v = q.version ? p.versions.find((x) => x.number === q.version) : p.current;
  if (!v) throw notFound();
  const name = `plan-${p.plan.periodStart}-v${v.number}`;
  if (q.format === 'csv') {
    return new NextResponse(`﻿${planToCsv(v.content, c.user.locale)}`, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}.csv"`, 'cache-control': 'no-store' } });
  }
  return new NextResponse(JSON.stringify({ plan: p.plan, version: v.number, content: v.content }, null, 2), { headers: { 'content-type': 'application/json', 'content-disposition': `attachment; filename="${name}.json"`, 'cache-control': 'no-store' } });
});
