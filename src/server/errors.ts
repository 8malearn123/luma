/**
 * Application errors with stable codes. Messages are translation keys; the
 * client renders them through the i18n dictionary. Never put another tenant's
 * data or record existence into an error.
 */
export type ErrorCode =
  | 'unauthenticated' // 401
  | 'forbidden' // 403
  | 'not_found' // 404
  | 'conflict' // 409
  | 'version_conflict' // 409
  | 'slot_unavailable' // 409
  | 'insufficient_stock' // 409
  | 'invalid_transition' // 409
  | 'validation' // 422
  | 'plan_limit' // 403 (plan does not include / limit reached)
  | 'rate_limited' // 429
  | 'unavailable' // 503 (integration disconnected)
  | 'idempotency_mismatch' // 422
  | 'payment_required' // 402
  | 'internal'; // 500

const STATUS: Record<ErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  version_conflict: 409,
  slot_unavailable: 409,
  insufficient_stock: 409,
  invalid_transition: 409,
  validation: 422,
  plan_limit: 403,
  rate_limited: 429,
  unavailable: 503,
  idempotency_mismatch: 422,
  payment_required: 402,
  internal: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;
  readonly retryAfter?: number;
  constructor(code: ErrorCode, message?: string, details?: unknown, retryAfter?: number) {
    super(message ?? code);
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
    this.retryAfter = retryAfter;
  }
}

export const notFound = (what = 'resource') => new AppError('not_found', `errors.not_found`, { what });
export const forbidden = (reason = 'errors.forbidden') => new AppError('forbidden', reason);
export const invalid = (details: unknown, message = 'errors.validation') => new AppError('validation', message, details);

/** Map PostgreSQL errors to application errors (never leaking constraint internals to clients). */
export function fromDbError(e: unknown): AppError | null {
  const err = e as { code?: string; constraint_name?: string; message?: string };
  if (!err || typeof err.code !== 'string') return null;
  switch (err.code) {
    case '23P01': // exclusion_violation
      if (err.constraint_name?.startsWith('alloc_')) return new AppError('slot_unavailable', 'errors.slot_unavailable');
      return new AppError('conflict', 'errors.conflict', { constraint: err.constraint_name });
    case '23505': // unique_violation
      return new AppError('conflict', 'errors.duplicate', { constraint: err.constraint_name });
    case '23514': // check_violation
      if (err.constraint_name?.startsWith('inventory_items_')) return new AppError('insufficient_stock', 'errors.insufficient_stock');
      return new AppError('validation', 'errors.validation', { constraint: err.constraint_name });
    case '23503': // foreign_key_violation (incl. cross-tenant references)
      return new AppError('validation', 'errors.invalid_reference', { constraint: err.constraint_name });
    case '42501': // insufficient_privilege / RLS violation
      return new AppError('not_found', 'errors.not_found');
    case '40001':
    case '40P01':
      return new AppError('conflict', 'errors.retry');
    case '22P02': // invalid_text_representation (e.g. bad uuid)
      return new AppError('not_found', 'errors.not_found');
    default:
      return null;
  }
}
