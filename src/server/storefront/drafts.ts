import sanitizeHtml from 'sanitize-html';
import type { Tx } from '../db';
import { AppError } from '../errors';
import { audit } from '../audit';
import type { TenantContext } from '../tenancy/context';
import { entitlements, featureEnabled } from '../tenancy/plan';
import { collectRefs, validateDocument, type PageBlock, type StorefrontDocument, type ValidationIssue } from '@/lib/builder/schema';
import { brandContrastIssues } from '@/lib/builder/defaults';

/**
 * Storefront drafts. Every write goes through prepareDocument():
 *   structural validation → rich-text sanitizing → tenant-scoped reference
 *   checks (ids of other tenants are indistinguishable from missing ones) →
 *   plan enforcement → contrast warnings.
 * Writes use optimistic concurrency on storefront_drafts.version; a stale
 * version is a 409 version_conflict — never a silent overwrite.
 */

export const RICH_TEXT_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ['p', 'strong', 'em', 'ul', 'ol', 'li', 'br', 'a'],
  allowedAttributes: { a: ['href'] },
  allowedSchemes: ['https', 'mailto', 'tel'],
  allowedSchemesAppliedToAttributes: ['href'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
  transformTags: {
    a: (tagName, attribs) => ({ tagName, attribs: { href: attribs.href ?? '', rel: 'noopener noreferrer nofollow', target: '_blank' } }),
  },
};
// rel/target are added by the transform above; allow them on output
RICH_TEXT_OPTIONS.allowedAttributes = { a: ['href', 'rel', 'target'] };

export function sanitizeRichText(html: string): string {
  return sanitizeHtml(html ?? '', RICH_TEXT_OPTIONS).trim();
}

function walkBlocks(blocks: PageBlock[], fn: (b: PageBlock) => void) {
  for (const b of blocks) {
    fn(b);
    if (b.children) walkBlocks(b.children, fn);
  }
}

export function sanitizeDocument(doc: StorefrontDocument): StorefrontDocument {
  for (const page of doc.layout.pages) {
    walkBlocks(page.blocks, (b) => {
      if (b.type === 'text') {
        const html = (b.props.html ?? {}) as { ar?: string; en?: string };
        b.props = { ...b.props, html: { ar: sanitizeRichText(html.ar ?? ''), ...(html.en !== undefined ? { en: sanitizeRichText(html.en) } : {}) } };
      }
    });
  }
  return doc;
}

export interface RefCheck {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

/** Every referenced id must exist in THIS tenant (RLS scopes the queries). */
export async function checkReferences(tx: Tx, doc: StorefrontDocument): Promise<RefCheck> {
  const refs = collectRefs(doc);
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const check = async (what: string, ids: Set<string>, rows: () => Promise<{ id: string; state: string }[]>, okStates: string[]) => {
    if (!ids.size) return;
    const found = new Map((await rows()).map((r) => [r.id, r.state]));
    for (const id of ids) {
      const st = found.get(id);
      if (!st) errors.push({ path: `${what}:${id}`, message: 'errors.builder_ref_missing', severity: 'error' });
      else if (!okStates.includes(st)) warnings.push({ path: `${what}:${id}`, message: `builder.warn_target_${st}`, severity: 'warning' });
    }
  };
  const list = (s: Set<string>) => [...s];
  await check('service', refs.services, () => tx`select id, case when status <> 'active' then status when not is_visible then 'hidden' else 'active' end as state from services where id = any(${list(refs.services)}::uuid[])` as never, ['active']);
  await check('product', refs.products, () => tx`select id, case when status <> 'active' then status when not is_visible then 'hidden' else 'active' end as state from products where id = any(${list(refs.products)}::uuid[])` as never, ['active']);
  await check('category', refs.categories, () => tx`select id, status as state from categories where id = any(${list(refs.categories)}::uuid[])` as never, ['active']);
  await check('staff', refs.staff, () => tx`select id, case when status <> 'active' then status when not public_visible then 'hidden' else 'active' end as state from staff_profiles where id = any(${list(refs.staff)}::uuid[])` as never, ['active']);
  await check('package', refs.packages, () => tx`select id, status as state from packages where id = any(${list(refs.packages)}::uuid[])` as never, ['active']);
  await check('asset', refs.assets, () => tx`select id, case when status = 'ready' and purpose <> 'evidence' then 'active' else 'missing' end as state from assets where id = any(${list(refs.assets)}::uuid[]) and status = 'ready' and purpose <> 'evidence'` as never, ['active']);
  await check('branch', refs.branches, () => tx`select id, status as state from branches where id = any(${list(refs.branches)}::uuid[])` as never, ['active']);
  return { errors, warnings };
}

export interface Prepared {
  doc: StorefrontDocument;
  issues: ValidationIssue[];
}

/** Validates + sanitizes + enforces plan + checks refs. Throws 422 with issues on errors. */
export async function prepareDocument(tx: Tx, tenantId: string, raw: unknown): Promise<Prepared> {
  const v = validateDocument(raw);
  if (!v.ok) throw new AppError('validation', 'errors.builder_invalid', { issues: v.issues });
  const doc = sanitizeDocument(v.doc);
  const issues: ValidationIssue[] = [...v.issues];

  const ent = await entitlements(tx, tenantId);
  if (!featureEnabled(ent, 'branding.remove_powered_by')) doc.appearance.showPoweredBy = true;
  const custom = doc.layout.pages.filter((p) => p.kind === 'custom').length;
  const lim = ent.features.get('custom_pages.max');
  const limit = lim && lim.enabled ? lim.limit : 0;
  if (limit !== null && custom > limit) {
    throw new AppError('plan_limit', 'errors.plan_limit', { feature: 'custom_pages.max', limit, issues: [{ path: 'layout.pages', message: 'errors.plan_limit', severity: 'error' }] });
  }

  const refs = await checkReferences(tx, doc);
  if (refs.errors.length) throw new AppError('validation', 'errors.builder_invalid', { issues: refs.errors });
  issues.push(...refs.warnings);
  for (const c of brandContrastIssues(doc.brand.colors)) issues.push({ path: `brand.colors.${c}`, message: `builder.warn_contrast_${c}`, severity: 'warning' });
  return { doc, issues };
}

export async function getDraft(tx: Tx) {
  const [d] = await tx<{ document: StorefrontDocument; version: number; updatedAt: Date; baseVersionId: string | null }[]>`
    select document, version, updated_at, base_version_id from storefront_drafts limit 1`;
  if (!d) throw new AppError('not_found', 'errors.not_found');
  return d;
}

async function lockDraft(tx: Tx, expectedVersion: number) {
  const [d] = await tx<{ version: number }[]>`select version from storefront_drafts for update`;
  if (!d) throw new AppError('not_found', 'errors.not_found');
  if (d.version !== expectedVersion) throw new AppError('version_conflict', 'errors.version_conflict', { currentVersion: d.version });
  return d;
}

async function writeDraft(tx: Tx, ctx: TenantContext, doc: StorefrontDocument, current: number, meta: { source: string; note?: string }) {
  await tx`update storefront_drafts set document = ${tx.json(doc as never)}, version = ${current + 1}, updated_by = ${ctx.user.userId}, updated_at = now()`;
  await audit(tx, {
    actorUserId: ctx.user.userId,
    actorKind: ctx.actorKind,
    tenantId: ctx.tenant.id,
    action: 'storefront.draft_saved',
    targetType: 'storefront_draft',
    requestId: ctx.requestId,
    metadata: { source: meta.source, version: current + 1, note: meta.note },
  });
  return current + 1;
}

export async function saveDraft(tx: Tx, ctx: TenantContext, raw: unknown, expectedVersion: number, meta: { source: 'manual' | 'assistant' | 'legacy_import' | 'restore'; note?: string } = { source: 'manual' }) {
  const d = await lockDraft(tx, expectedVersion);
  const p = await prepareDocument(tx, ctx.tenant.id, raw);
  const version = await writeDraft(tx, ctx, p.doc, d.version, meta);
  return { version, document: p.doc, issues: p.issues };
}

/**
 * Contract for other workstreams (e.g. the customization assistant): apply a
 * pure transform to the current draft. Same validation as manual saves; never
 * publishes.
 */
export async function applyDraftPatch(
  tx: Tx,
  ctx: TenantContext,
  transform: (doc: StorefrontDocument) => StorefrontDocument,
  expectedVersion: number,
  meta: { source: 'manual' | 'assistant'; note?: string },
) {
  const d = await lockDraft(tx, expectedVersion);
  const [cur] = await tx<{ document: StorefrontDocument }[]>`select document from storefront_drafts`;
  const next = transform(structuredClone(cur.document));
  const p = await prepareDocument(tx, ctx.tenant.id, next);
  const version = await writeDraft(tx, ctx, p.doc, d.version, meta);
  return { version, document: p.doc, issues: p.issues };
}
