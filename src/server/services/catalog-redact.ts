import type { TenantContext } from '../tenancy/context';

/** Costs are confidential: only finance-capable roles see them (receptionists never do). */
export function redactCosts<T extends Record<string, unknown>>(ctx: TenantContext, row: T): T {
  if (ctx.caps.has('finance.view')) return row;
  const { materialCostMinor: _m, costMinor: _c, ...rest } = row as Record<string, unknown>;
  return rest as T;
}
