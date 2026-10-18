import { z } from 'zod';
import type { Tx } from '../db';
import { AppError, notFound } from '../errors';
import { audit } from '../audit';
import { post } from '../finance/journal';
import type { TenantContext } from '../tenancy/context';

export const expenseInput = z.object({
  branchId: z.string().uuid().nullable().optional(),
  category: z.enum(['rent', 'salaries', 'supplies', 'utilities', 'marketing', 'maintenance', 'other']),
  amountMinor: z.number().int().min(1).max(1_000_000_000),
  incurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  description: z.string().max(500).optional().nullable(),
  paidFrom: z.enum(['cash', 'accounts_payable']).default('cash'),
});

/** Expenses are never deleted: voiding posts an offsetting journal entry and keeps the row. */
export async function createExpense(tx: Tx, ctx: TenantContext, input: z.infer<typeof expenseInput>) {
  const [e] = await tx<{ id: string }[]>`insert into expenses (tenant_id, branch_id, category, amount_minor, incurred_on, description, recorded_by)
    values (${ctx.tenant.id}, ${input.branchId ?? null}, ${input.category}, ${input.amountMinor}, ${input.incurredOn}, ${input.description ?? null}, ${ctx.user.userId}) returning id`;
  await post(tx, { tenantId: ctx.tenant.id, refType: 'expense', refId: e.id, memo: input.category, actorUserId: ctx.user.userId, lines: [{ account: 'expenses', debit: input.amountMinor }, { account: input.paidFrom, credit: input.amountMinor }] });
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: 'expense.created', targetType: 'expense', targetId: e.id, requestId: ctx.requestId, metadata: { amountMinor: input.amountMinor } });
  return e;
}

export async function voidExpense(tx: Tx, ctx: TenantContext, id: string, reason: string) {
  if (!reason.trim()) throw new AppError('validation', 'errors.reason_required');
  const [e] = await tx<{ amountMinor: number }[]>`update expenses set voided_at = now(), void_reason = ${reason} where id = ${id} and voided_at is null returning amount_minor`;
  if (!e) throw notFound('expense');
  const [orig] = await tx<{ account: string }[]>`select account from financial_entries where ref_type = 'expense' and ref_id = ${id} and credit_minor > 0 limit 1`;
  await post(tx, { tenantId: ctx.tenant.id, refType: 'expense_void', refId: id, memo: `void: ${reason}`.slice(0, 200), actorUserId: ctx.user.userId, lines: [{ account: (orig?.account ?? 'cash') as 'cash', debit: e.amountMinor }, { account: 'expenses', credit: e.amountMinor }] });
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: 'expense.voided', targetType: 'expense', targetId: id, requestId: ctx.requestId, reason });
}

export async function listExpenses(tx: Tx, from: string, to: string) {
  return tx`select e.id, e.category, e.amount_minor, to_char(e.incurred_on, 'YYYY-MM-DD') as incurred_on, e.description, e.voided_at, e.void_reason, e.created_at, u.display_name as recorded_by_name
            from expenses e left join users u on u.id = e.recorded_by where e.incurred_on >= ${from} and e.incurred_on < ${to} order by e.incurred_on desc, e.created_at desc limit 500`;
}
