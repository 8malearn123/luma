import type { Tx } from '../db';

/**
 * In-app notification center (persisted per user + tenant). Titles are i18n
 * keys; target paths must be relative in-app paths (enforced by a CHECK too).
 * External channels (email/SMS/WhatsApp) go through notification_deliveries
 * and the messaging adapters; with no provider connected they are recorded as
 * 'simulated' and nothing is sent.
 */
export interface NotificationInput {
  type: string;
  title: string;
  body?: string;
  targetPath?: string;
  dedupeKey?: string;
}

const safePath = (p?: string) => (p && /^\/[^/\\]/.test(p) ? p.slice(0, 500) : null);

export async function notifyUser(tx: Tx, userId: string, tenantId: string | null, n: NotificationInput) {
  await tx`insert into notifications (user_id, tenant_id, type, title, body, target_path, dedupe_key)
           values (${userId}, ${tenantId}, ${n.type}, ${n.title}, ${n.body ?? null}, ${safePath(n.targetPath)}, ${n.dedupeKey ?? null})
           on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing`;
}

export async function notifyTenantRoles(tx: Tx, tenantId: string, roles: string[], n: NotificationInput) {
  const members = await tx<{ userId: string }[]>`
    select user_id from tenant_memberships where tenant_id = ${tenantId} and status = 'active' and role = any(${roles})`;
  for (const m of members) await notifyUser(tx, m.userId, tenantId, n);
}

/** External-channel delivery record. Simulated unless a provider adapter is connected. */
export async function recordDelivery(
  tx: Tx,
  d: { tenantId: string | null; channel: 'email' | 'sms' | 'whatsapp'; template: string; recipientUserId?: string | null; recipientRef?: string; dedupeKey: string },
) {
  await tx`insert into notification_deliveries (tenant_id, channel, template, recipient_user_id, recipient_ref, status, dedupe_key)
           values (${d.tenantId}, ${d.channel}, ${d.template}, ${d.recipientUserId ?? null}, ${d.recipientRef ?? null}, 'simulated', ${d.dedupeKey})
           on conflict (dedupe_key) do nothing`;
}

export async function listNotifications(tx: Tx, userId: string, opts: { before?: Date; limit?: number } = {}) {
  const limit = Math.min(opts.limit ?? 20, 50);
  const rows = await tx`select id, tenant_id, type, title, body, target_path, read_at, created_at from notifications
                        where user_id = ${userId} and expires_at > now() and (${opts.before ?? null}::timestamptz is null or created_at < ${opts.before ?? null}::timestamptz)
                        order by created_at desc limit ${limit + 1}`;
  const [{ unread }] = await tx<{ unread: number }[]>`select count(*)::int as unread from notifications where user_id = ${userId} and read_at is null and expires_at > now()`;
  return { items: rows.slice(0, limit), hasMore: rows.length > limit, unread };
}

export async function markRead(tx: Tx, userId: string, ids: string[] | 'all') {
  if (ids === 'all') await tx`update notifications set read_at = now() where user_id = ${userId} and read_at is null`;
  else await tx`update notifications set read_at = now() where user_id = ${userId} and id = any(${ids}::uuid[]) and read_at is null`;
}
