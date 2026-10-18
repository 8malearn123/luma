import { NextResponse } from 'next/server';
import { z } from 'zod';
import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { audit } from '@/server/audit';
import { listPayments } from '@/server/finance/reports';
import { listExpenses } from '@/server/dashboard/expenses';
import { periodQuery, resolvePeriod } from '@/server/dashboard/period';
import { requireRecentStepUp } from '@/server/auth/service';

const csvCell = (v: unknown) => {
  let s = v == null ? '' : v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // formula-injection guard
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV export — finance.export, step-up, audited. POST because it records an audit event. */
export const POST = api.tenant('finance.export', async (c) => {
  requireRecentStepUp(c.user);
  const b = await c.json(periodQuery.extend({ kind: z.enum(['payments', 'expenses', 'journal']) }));
  const p = resolvePeriod(b, c.t.tenant.timezone);
  const rows = await tx(c.t, async (db) => {
    let r: Record<string, unknown>[];
    if (b.kind === 'payments') r = (await listPayments(db, p.start, p.end)) as unknown as Record<string, unknown>[];
    else if (b.kind === 'expenses') r = (await listExpenses(db, p.fromDate, p.endDateExclusive)) as unknown as Record<string, unknown>[];
    else r = await db`select at, txn_id, account, debit_minor, credit_minor, ref_type, ref_id, memo from financial_entries where at >= ${p.start} and at < ${p.end} order by at, id`;
    await audit(db, { actorUserId: c.user.userId, actorKind: c.t.actorKind, tenantId: c.t.tenant.id, action: 'finance.exported', requestId: c.requestId, metadata: { kind: b.kind, from: p.fromDate, to: p.toDate, rows: r.length } });
    return r;
  });
  const cols = rows[0] ? Object.keys(rows[0]) : ['empty'];
  const csv = '﻿' + [cols.join(','), ...rows.map((r) => cols.map((k) => csvCell(r[k])).join(','))].join('\n');
  return new NextResponse(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${b.kind}-${p.fromDate}-${p.toDate}.csv"`, 'cache-control': 'no-store' } });
});
