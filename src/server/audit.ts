import type { Db } from './db';

export type ActorKind = 'user' | 'platform' | 'support' | 'system' | 'customer';

export interface AuditInput {
  actorUserId?: string | null;
  actorKind: ActorKind;
  tenantId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  requestId?: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
}

const SECRET_KEYS = /pass(word)?|secret|token|code|otp|pan|cvv|card|key/i;

/** Strips anything secret-looking and truncates long strings before persisting. */
export function redact(meta: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (SECRET_KEYS.test(k)) {
      out[k] = '[redacted]';
    } else if (typeof v === 'string') {
      out[k] = v.length > 200 ? `${v.slice(0, 200)}…` : v;
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = redact(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export async function audit(db: Db, a: AuditInput): Promise<void> {
  await db`
    insert into audit_logs (actor_user_id, actor_kind, tenant_id, action, target_type, target_id, request_id, reason, metadata, ip)
    values (${a.actorUserId ?? null}, ${a.actorKind}, ${a.tenantId ?? null}, ${a.action}, ${a.targetType ?? null},
            ${a.targetId ?? null}, ${a.requestId ?? null}, ${a.reason ?? null}, ${db.json(redact(a.metadata) as never)},
            ${a.ip ?? null})`;
}
