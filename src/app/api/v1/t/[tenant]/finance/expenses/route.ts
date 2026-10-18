import { api } from '@/server/http/handler';
import { tx } from '@/server/tenancy/context';
import { createExpense, expenseInput, listExpenses } from '@/server/dashboard/expenses';
import { periodQuery, resolvePeriod } from '@/server/dashboard/period';

export const GET = api.tenant(['finance.view', 'expenses.manage'], async (c) => {
  const p = resolvePeriod(c.query(periodQuery), c.t.tenant.timezone);
  return { items: await tx(c.t, (db) => listExpenses(db, p.fromDate, p.endDateExclusive)) };
});
export const POST = api.tenant('expenses.manage', async (c) => {
  const b = await c.json(expenseInput);
  return tx(c.t, (db) => createExpense(db, c.t, b));
}, { idempotent: true });
