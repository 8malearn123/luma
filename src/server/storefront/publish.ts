import { withSystem, type Tx } from '../db';
import { AppError, notFound } from '../errors';
import { audit } from '../audit';
import { randomToken, sha256 } from '../crypto';
import type { TenantContext } from '../tenancy/context';
import type { StorefrontDocument } from '@/lib/builder/schema';
import { getDraft, prepareDocument } from './drafts';

/**
 * Publishing = immutable snapshot in page_versions + tenants.published_version_id,
 * in ONE transaction (the FK is deferred; the snapshot table rejects UPDATEs).
 * Rollback creates a NEW version from an older snapshot; it only affects design.
 * Bookings, orders and inventory are never touched by publishing or rollback.
 */
const act = (ctx: TenantContext) => ({ actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, requestId: ctx.requestId });

async function nextVersionNumber(tx: Tx) {
  const [r] = await tx<{ n: number }[]>`select coalesce(max(number), 0) + 1 as n from page_versions`;
  return r.n;
}

async function snapshot(tx: Tx, ctx: TenantContext, doc: StorefrontDocument, draftVersion: number, extra: { restoredFromId?: string; note?: string }) {
  const number = await nextVersionNumber(tx);
  const [v] = await tx<{ id: string }[]>`
    insert into page_versions (tenant_id, number, document, draft_version, published_by, restored_from_id, note)
    values (${ctx.tenant.id}, ${number}, ${tx.json(doc as never)}, ${draftVersion}, ${ctx.user.userId}, ${extra.restoredFromId ?? null}, ${extra.note ?? null})
    returning id`;
  await tx`update tenants set published_version_id = ${v.id} where id = ${ctx.tenant.id}`;
  await tx`update storefront_drafts set base_version_id = ${v.id}`;
  return { id: v.id, number };
}

/** Publish the current draft. `expectedVersion` guarantees we publish what the owner saw. */
export async function publishDraft(tx: Tx, ctx: TenantContext, expectedVersion: number, note?: string) {
  const [d] = await tx<{ version: number; document: unknown }[]>`select version, document from storefront_drafts for update`;
  if (!d) throw notFound('draft');
  if (d.version !== expectedVersion) throw new AppError('version_conflict', 'errors.version_conflict', { currentVersion: d.version });
  const p = await prepareDocument(tx, ctx.tenant.id, d.document);
  const v = await snapshot(tx, ctx, p.doc, d.version, { note });
  await audit(tx, { ...act(ctx), action: 'storefront.published', targetType: 'page_version', targetId: v.id, metadata: { number: v.number, draftVersion: d.version, warnings: p.issues.length } });
  return { versionId: v.id, number: v.number, warnings: p.issues.filter((i) => i.severity === 'warning') };
}

export async function listVersions(tx: Tx) {
  const [t] = await tx<{ publishedVersionId: string | null }[]>`select published_version_id from tenants where id = app.tenant_id()`;
  const rows = await tx<{ id: string; number: number; publishedAt: Date; publishedBy: string | null; publisherName: string | null; restoredFromId: string | null; note: string | null; draftVersion: number }[]>`
    select v.id, v.number, v.published_at, v.published_by, u.display_name as publisher_name, v.restored_from_id, v.note, v.draft_version
    from page_versions v left join users u on u.id = v.published_by order by v.number desc limit 100`;
  return rows.map((r) => ({ ...r, current: r.id === t?.publishedVersionId }));
}

/**
 * Restore an earlier snapshot into the draft (version-checked). With
 * `republish`, it is also published immediately as a new version (rollback).
 */
export async function restoreVersion(tx: Tx, ctx: TenantContext, versionId: string, expectedDraftVersion: number, republish: boolean) {
  const [v] = await tx<{ id: string; number: number; document: StorefrontDocument }[]>`select id, number, document from page_versions where id = ${versionId}`;
  if (!v) throw notFound('version');
  const [d] = await tx<{ version: number }[]>`select version from storefront_drafts for update`;
  if (d.version !== expectedDraftVersion) throw new AppError('version_conflict', 'errors.version_conflict', { currentVersion: d.version });
  // references may have been archived/removed since; the same checks apply
  const p = await prepareDocument(tx, ctx.tenant.id, v.document);
  const newDraftVersion = d.version + 1;
  await tx`update storefront_drafts set document = ${tx.json(p.doc as never)}, version = ${newDraftVersion}, updated_by = ${ctx.user.userId}, updated_at = now()`;
  await audit(tx, { ...act(ctx), action: 'storefront.version_restored_to_draft', targetType: 'page_version', targetId: v.id, metadata: { number: v.number } });
  let published: { id: string; number: number } | null = null;
  if (republish) {
    published = await snapshot(tx, ctx, p.doc, newDraftVersion, { restoredFromId: v.id, note: `rollback to v${v.number}` });
    await audit(tx, { ...act(ctx), action: 'storefront.rolled_back', targetType: 'page_version', targetId: published.id, metadata: { from: v.number, newNumber: published.number } });
  }
  return { draftVersion: newDraftVersion, published, warnings: p.issues.filter((i) => i.severity === 'warning') };
}

// ── preview tokens ──
export async function createPreviewToken(tx: Tx, ctx: TenantContext, hours = 24) {
  const h = Math.min(Math.max(1, Math.floor(hours)), 168);
  const token = randomToken(24);
  const [r] = await tx<{ id: string; expiresAt: Date }[]>`
    insert into preview_tokens (tenant_id, token_hash, expires_at, created_by)
    values (${ctx.tenant.id}, ${sha256(token)}, now() + make_interval(hours => ${h}), ${ctx.user.userId}) returning id, expires_at`;
  await audit(tx, { ...act(ctx), action: 'storefront.preview_token_created', targetType: 'preview_token', targetId: r.id, metadata: { hours: h } });
  return { id: r.id, token, expiresAt: r.expiresAt, path: `/preview/${token}` };
}

export async function revokePreviewTokens(tx: Tx, ctx: TenantContext) {
  await tx`update preview_tokens set revoked_at = now() where revoked_at is null`;
  await audit(tx, { ...act(ctx), action: 'storefront.preview_tokens_revoked' });
}

/** Resolve a preview token to its tenant (opaque lookup by hash). */
export async function resolvePreviewToken(token: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const [r] = await withSystem('preview token lookup by hash', (tx) => tx<{ tenantId: string }[]>`
    select tenant_id from preview_tokens where token_hash = ${sha256(token)} and revoked_at is null and expires_at > now()`);
  return r?.tenantId ?? null;
}

export { getDraft };
