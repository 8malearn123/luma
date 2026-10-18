import { z } from 'zod';
import type { Tx } from '../db';
import { AppError, forbidden, notFound } from '../errors';
import { audit } from '../audit';
import type { TenantContext } from '../tenancy/context';
import { FONTS, type FontKey, type PageBlock, type StorefrontDocument } from '@/lib/builder/schema';
import { brandContrastIssues, contrast } from '@/lib/builder/defaults';
import { runAi } from '../ai/run';
import { getProvider } from '../ai/provider';
import { normalizeText } from './trends';

/**
 * Natural-language storefront customization (spec §14).
 * request → (AI structured patch | deterministic keyword parser) → validation
 * against an allowlist → proposal with diff → owner accepts/rejects. Accepting
 * applies through the builder's draft service (same validation as manual
 * edits, optimistic version check). Never touches prices, policies,
 * appointments, permissions or links, and never publishes.
 */
const COLOR_KEYS = ['background', 'surface', 'text', 'mutedText', 'primary', 'primaryText', 'accent', 'border'] as const;
const STYLE = { radius: ['none', 'sm', 'md', 'lg', 'pill'], buttonStyle: ['solid', 'outline', 'soft'], cardStyle: ['flat', 'bordered', 'elevated'], density: ['compact', 'comfortable', 'airy'] } as const;
const APPEAR = { navStyle: ['simple', 'pill', 'bottom'], serviceDisplay: ['list', 'cards'], productDisplay: ['grid', 'list'] } as const;
const TEXT_PROPS = ['heading', 'title', 'subtitle', 'text', 'label', 'message'] as const;

export const opSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('set_color'), key: z.enum(COLOR_KEYS), value: z.string().regex(/^#[0-9a-fA-F]{6}$/) }),
  z.object({ op: z.literal('set_font'), key: z.enum(['heading', 'body']), value: z.string() }),
  z.object({ op: z.literal('set_style'), key: z.enum(['radius', 'buttonStyle', 'cardStyle', 'density']), value: z.string() }),
  z.object({ op: z.literal('set_appearance'), key: z.enum(['navStyle', 'serviceDisplay', 'productDisplay']), value: z.string() }),
  z.object({ op: z.literal('move_block'), pageId: z.string().max(40).nullable(), blockId: z.string().max(40), beforeBlockId: z.string().max(40).nullable() }),
  z.object({ op: z.literal('set_visibility'), pageId: z.string().max(40).nullable(), blockId: z.string().max(40), enabled: z.boolean() }),
  z.object({ op: z.literal('set_text'), pageId: z.string().max(40).nullable(), blockId: z.string().max(40), prop: z.enum(TEXT_PROPS), lang: z.enum(['ar', 'en']), value: z.string().max(240) }),
]);
export type PatchOp = z.infer<typeof opSchema>;
export interface Rejected {
  request: string;
  reason: string;
}

// ── deterministic parser ──
const COLORS: [RegExp, string][] = [
  [/كريمي|كريم|cream/, '#F6F0E1'], [/زيتي|زيتوني|olive/, '#6B6B2F'], [/بيج|beige/, '#E8DCC8'], [/ذهبي|gold/, '#B8963E'],
  [/وردي|زهري|pink|rose/, '#C97B88'], [/عنابي|burgundy|maroon/, '#7A1F2B'], [/كحلي|navy/, '#1F2A44'], [/ازرق|blue/, '#3B5B8C'],
  [/اخضر|green/, '#4F6B57'], [/بنفسجي|موف|purple|lilac/, '#7E5A9B'], [/رمادي|gray|grey/, '#8A8A8A'], [/اسود|black/, '#111111'],
  [/ابيض|white/, '#FFFFFF'], [/بني|brown/, '#6B4A35'], [/نحاسي|copper|bronze/, '#A97E4F'], [/مرجاني|coral/, '#E07A5F'],
];
const BLOCK_WORDS: [RegExp, PageBlock['type'][]][] = [
  [/معرض|اعمال|اعمالنا|portfolio|gallery/, ['gallery']],
  [/خدمات|الخدمات|services?/, ['service_list', 'categories']],
  [/منتجات|المنتجات|products?/, ['product_grid']],
  [/فريق|الفريق|team|staff/, ['team']],
  [/تقييمات|اراء|اراء العملاء|reviews?/, ['reviews']],
  [/ساعات|اوقات العمل|hours/, ['hours']],
  [/تواصل|اتصال|contact/, ['contact']],
  [/نبذه|من نحن|about|intro/, ['intro']],
  [/اسئله|faq/, ['faq']],
  [/عروض|باقات|offers?|packages?/, ['offers']],
  [/خريطه|موقع|map|location/, ['map']],
  [/بانر|الواجهه|hero|banner/, ['hero']],
];
const FORBIDDEN: [RegExp, string][] = [
  [/سعر|اسعار|price|pricing/, 'customize.reject_prices'],
  [/خصم|discount|coupon|كوبون/, 'customize.reject_prices'],
  [/سياسه|سياسات|policy|policies|استرجاع|refund|عربون|deposit|دفع|payment/, 'customize.reject_policies'],
  [/موعد|مواعيد|حجز|appointment|booking slot/, 'customize.reject_appointments'],
  [/صلاحي|permission|role|مدير/, 'customize.reject_permissions'],
  [/انشر|نشر|publish|go live/, 'customize.reject_publish'],
  [/رابط|link|https?:|www\.|url/, 'customize.reject_links'],
  [/script|html|كود|code|javascript/, 'customize.reject_code'],
];

function findBlock(doc: StorefrontDocument, words: string, pageId?: string | null) {
  const page = doc.layout.pages.find((p) => (pageId ? p.id === pageId : p.kind === 'home'))!;
  for (const [re, types] of BLOCK_WORDS) if (re.test(words)) {
    const b = page.blocks.find((x) => types.includes(x.type));
    if (b) return { page, block: b };
  }
  return null;
}

export function parseRequestRules(doc: StorefrontDocument, prompt: string): { ops: PatchOp[]; rejected: Rejected[]; explanation: string } {
  const text = normalizeText(prompt);
  const ops: PatchOp[] = [];
  const rejected: Rejected[] = [];
  const clauses = text.split(/[,،.؛;]|\s+و(?=\S)|\s+and\s+|\s+ثم\s+|\s+then\s+/).map((c) => c.trim()).filter(Boolean);
  for (const clause of clauses) {
    const bad = FORBIDDEN.find(([re]) => re.test(clause));
    if (bad) {
      rejected.push({ request: clause, reason: bad[1] });
      continue;
    }
    const hex = /#[0-9a-f]{6}/i.exec(clause)?.[0];
    const named = COLORS.find(([re]) => re.test(clause))?.[1];
    const color = hex ?? named;
    if (color) {
      const up = color.toUpperCase();
      if (/خلفي|background|bg/.test(clause)) ops.push({ op: 'set_color', key: 'background', value: up });
      else if (/زر|ازرار|button/.test(clause)) {
        ops.push({ op: 'set_color', key: 'primary', value: up });
        ops.push({ op: 'set_color', key: 'primaryText', value: contrast('#FFFFFF', up) >= contrast('#111111', up) ? '#FFFFFF' : '#111111' });
      } else if (/نص|خط|كتاب|text/.test(clause)) ops.push({ op: 'set_color', key: 'text', value: up });
      else if (/بطاق|card|سطح|surface/.test(clause)) ops.push({ op: 'set_color', key: 'surface', value: up });
      else if (/حدود|border/.test(clause)) ops.push({ op: 'set_color', key: 'border', value: up });
      else ops.push({ op: 'set_color', key: 'accent', value: up });
      continue;
    }
    const before = /(.+?)\s+(?:قبل|before|above|فوق)\s+(.+)/.exec(clause);
    if (before) {
      const a = findBlock(doc, before[1]);
      const b = findBlock(doc, before[2]);
      if (a && b && a.block.id !== b.block.id) ops.push({ op: 'move_block', pageId: a.page.id, blockId: a.block.id, beforeBlockId: b.block.id });
      else rejected.push({ request: clause, reason: 'customize.reject_block_not_found' });
      continue;
    }
    const after = /(.+?)\s+(?:بعد|after|below|تحت)\s+(.+)/.exec(clause);
    if (after) {
      const a = findBlock(doc, after[1]);
      const b = findBlock(doc, after[2]);
      if (a && b && a.block.id !== b.block.id) {
        const idx = a.page.blocks.findIndex((x) => x.id === b.block.id);
        const next = a.page.blocks.filter((x) => x.id !== a.block.id)[a.page.blocks.filter((x) => x.id !== a.block.id).findIndex((x) => x.id === b.block.id) + 1];
        ops.push({ op: 'move_block', pageId: a.page.id, blockId: a.block.id, beforeBlockId: next?.id ?? (idx >= 0 ? null : null) });
      } else rejected.push({ request: clause, reason: 'customize.reject_block_not_found' });
      continue;
    }
    if (/اخف|hide|remove|احذف/.test(clause)) {
      const a = findBlock(doc, clause);
      if (a) ops.push({ op: 'set_visibility', pageId: a.page.id, blockId: a.block.id, enabled: false });
      else rejected.push({ request: clause, reason: 'customize.reject_block_not_found' });
      continue;
    }
    if (/اظهر|show|display/.test(clause)) {
      const a = findBlock(doc, clause);
      if (a) ops.push({ op: 'set_visibility', pageId: a.page.id, blockId: a.block.id, enabled: true });
      else rejected.push({ request: clause, reason: 'customize.reject_block_not_found' });
      continue;
    }
    if (/دائري|rounded|round/.test(clause)) { ops.push({ op: 'set_style', key: 'radius', value: 'lg' }); continue; }
    if (/حاد|sharp|square/.test(clause)) { ops.push({ op: 'set_style', key: 'radius', value: 'none' }); continue; }
    if (/بطاقات|cards/.test(clause) && /خدم|service/.test(clause)) { ops.push({ op: 'set_appearance', key: 'serviceDisplay', value: 'cards' }); continue; }
    if (/قائم|list/.test(clause) && /خدم|service/.test(clause)) { ops.push({ op: 'set_appearance', key: 'serviceDisplay', value: 'list' }); continue; }
    if (/مزدحم|compact|مضغوط/.test(clause)) { ops.push({ op: 'set_style', key: 'density', value: 'compact' }); continue; }
    if (/مساح|airy|واسع/.test(clause)) { ops.push({ op: 'set_style', key: 'density', value: 'airy' }); continue; }
    rejected.push({ request: clause, reason: 'customize.reject_not_understood' });
  }
  return { ops, rejected, explanation: 'customize.explain_rules' };
}

/** Validate ops against the current draft; unknown targets/values are rejected, never guessed. */
export function validateOps(doc: StorefrontDocument, raw: unknown[]): { ops: PatchOp[]; rejected: Rejected[]; warnings: string[] } {
  const ops: PatchOp[] = [];
  const rejected: Rejected[] = [];
  for (const r of raw.slice(0, 30)) {
    const p = opSchema.safeParse(r);
    if (!p.success) {
      rejected.push({ request: JSON.stringify(r).slice(0, 120), reason: 'customize.reject_unsupported' });
      continue;
    }
    const op = p.data;
    const page = (id: string | null) => doc.layout.pages.find((x) => (id ? x.id === id : x.kind === 'home'));
    if (op.op === 'set_font' && !(op.value in FONTS)) { rejected.push({ request: op.value, reason: 'customize.reject_font' }); continue; }
    if (op.op === 'set_style' && !(STYLE[op.key] as readonly string[]).includes(op.value)) { rejected.push({ request: op.value, reason: 'customize.reject_unsupported' }); continue; }
    if (op.op === 'set_appearance' && !(APPEAR[op.key] as readonly string[]).includes(op.value)) { rejected.push({ request: op.value, reason: 'customize.reject_unsupported' }); continue; }
    if (op.op === 'move_block' || op.op === 'set_visibility' || op.op === 'set_text') {
      const pg = page(op.pageId);
      const blk = pg?.blocks.find((b) => b.id === op.blockId);
      if (!pg || !blk) { rejected.push({ request: op.blockId, reason: 'customize.reject_block_not_found' }); continue; }
      if (op.op === 'move_block' && op.beforeBlockId && !pg.blocks.some((b) => b.id === op.beforeBlockId)) { rejected.push({ request: op.beforeBlockId, reason: 'customize.reject_block_not_found' }); continue; }
      if (op.op === 'set_text') {
        if (/<|>|https?:|www\.|javascript:/i.test(op.value)) { rejected.push({ request: op.value.slice(0, 60), reason: 'customize.reject_links' }); continue; }
        const cur = (blk.props as Record<string, unknown>)[op.prop];
        if (!cur || typeof cur !== 'object') { rejected.push({ request: `${op.blockId}.${op.prop}`, reason: 'customize.reject_unsupported' }); continue; }
      }
    }
    ops.push(op);
  }
  const preview = applyOps(doc, ops);
  return { ops, rejected, warnings: brandContrastIssues(preview.brand.colors).map((w) => `builder.warn_contrast_${w}`) };
}

export function applyOps(doc: StorefrontDocument, ops: PatchOp[]): StorefrontDocument {
  const d: StorefrontDocument = structuredClone(doc);
  const page = (id: string | null) => d.layout.pages.find((x) => (id ? x.id === id : x.kind === 'home'))!;
  for (const op of ops) {
    if (op.op === 'set_color') d.brand.colors[op.key] = op.value;
    else if (op.op === 'set_font') d.brand.fonts[op.key] = op.value as FontKey;
    else if (op.op === 'set_style') (d.brand as unknown as Record<string, string>)[op.key] = op.value;
    else if (op.op === 'set_appearance') (d.appearance as unknown as Record<string, string>)[op.key] = op.value;
    else {
      const pg = page(op.pageId);
      const idx = pg.blocks.findIndex((b) => b.id === op.blockId);
      if (idx < 0) continue;
      if (op.op === 'set_visibility') pg.blocks[idx].visibility = { enabled: op.enabled };
      else if (op.op === 'set_text') {
        const props = pg.blocks[idx].props as Record<string, Record<string, string>>;
        props[op.prop] = { ...(props[op.prop] ?? {}), [op.lang]: op.value };
      } else if (op.op === 'move_block') {
        const [b] = pg.blocks.splice(idx, 1);
        const to = op.beforeBlockId ? pg.blocks.findIndex((x) => x.id === op.beforeBlockId) : pg.blocks.length;
        pg.blocks.splice(to < 0 ? pg.blocks.length : to, 0, b);
      }
    }
  }
  return d;
}

export function diffDocs(a: StorefrontDocument, b: StorefrontDocument) {
  const out: { path: string; before: unknown; after: unknown }[] = [];
  for (const k of COLOR_KEYS) if (a.brand.colors[k] !== b.brand.colors[k]) out.push({ path: `brand.colors.${k}`, before: a.brand.colors[k], after: b.brand.colors[k] });
  for (const k of ['heading', 'body'] as const) if (a.brand.fonts[k] !== b.brand.fonts[k]) out.push({ path: `brand.fonts.${k}`, before: a.brand.fonts[k], after: b.brand.fonts[k] });
  for (const k of Object.keys(STYLE) as (keyof typeof STYLE)[]) if (a.brand[k] !== b.brand[k]) out.push({ path: `brand.${k}`, before: a.brand[k], after: b.brand[k] });
  for (const k of Object.keys(APPEAR) as (keyof typeof APPEAR)[]) if (a.appearance[k] !== b.appearance[k]) out.push({ path: `appearance.${k}`, before: a.appearance[k], after: b.appearance[k] });
  for (const pa of a.layout.pages) {
    const pb = b.layout.pages.find((p) => p.id === pa.id);
    if (!pb) continue;
    const oa = pa.blocks.map((x) => x.type).join(' › ');
    const ob = pb.blocks.map((x) => x.type).join(' › ');
    if (oa !== ob) out.push({ path: `layout.${pa.slug}.order`, before: oa, after: ob });
    for (const ba of pa.blocks) {
      const bb = pb.blocks.find((x) => x.id === ba.id);
      if (!bb) continue;
      if (ba.visibility.enabled !== bb.visibility.enabled) out.push({ path: `layout.${pa.slug}.${ba.type}.visible`, before: ba.visibility.enabled, after: bb.visibility.enabled });
      for (const p of TEXT_PROPS) {
        const x = JSON.stringify((ba.props as Record<string, unknown>)[p] ?? null);
        const y = JSON.stringify((bb.props as Record<string, unknown>)[p] ?? null);
        if (x !== y) out.push({ path: `layout.${pa.slug}.${ba.type}.${p}`, before: (ba.props as Record<string, unknown>)[p], after: (bb.props as Record<string, unknown>)[p] });
      }
    }
  }
  return out;
}

const nullable = (t: string) => ({ type: [t, 'null'] });
const AI_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ops', 'rejected', 'explanation'],
  properties: {
    ops: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['op', 'key', 'value', 'pageId', 'blockId', 'beforeBlockId', 'enabled', 'prop', 'lang'],
        properties: {
          op: { type: 'string', enum: ['set_color', 'set_font', 'set_style', 'set_appearance', 'move_block', 'set_visibility', 'set_text'] },
          key: nullable('string'), value: nullable('string'), pageId: nullable('string'), blockId: nullable('string'),
          beforeBlockId: nullable('string'), enabled: nullable('boolean'), prop: nullable('string'), lang: nullable('string'),
        },
      },
    },
    rejected: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['request', 'reason'], properties: { request: { type: 'string' }, reason: { type: 'string' } } } },
    explanation: { type: 'string' },
  },
};

const compact = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));

export async function proposeCustomization(tx: Tx, ctx: TenantContext, prompt: string) {
  if (!ctx.caps.has('storefront.edit')) throw forbidden();
  const { getDraft } = await import('../storefront/drafts');
  const draft = await getDraft(tx);
  const doc = draft.document;
  let mode: 'ai' | 'rules' = 'rules';
  let aiFailure: string | null = null;
  let runId: string | null = null;
  let rawOps: unknown[] = [];
  let rejected: Rejected[] = [];
  let explanation = 'customize.explain_rules';
  if (getProvider()) {
    const home = doc.layout.pages.find((p) => p.kind === 'home');
    const res = await runAi(tx, {
      tenantId: ctx.tenant.id,
      userId: ctx.user.userId,
      purpose: 'storefront_customize',
      promptId: 'storefront.customize@1',
      task: `Allowed fonts: ${Object.keys(FONTS).join(', ')}. Allowed style values: ${JSON.stringify(STYLE)}. Appearance values: ${JSON.stringify(APPEAR)}. Owner locale: ${ctx.user.locale}.`,
      data: { brand: doc.brand, appearance: doc.appearance, homeBlocks: home?.blocks.map((b) => ({ id: b.id, type: b.type, visible: b.visibility.enabled })) ?? [], pages: doc.layout.pages.map((p) => ({ id: p.id, kind: p.kind })) },
      untrusted: [{ label: 'owner_request', content: prompt }],
      schemaName: 'storefront_patch',
      schema: AI_SCHEMA,
      useCache: false,
    });
    runId = res.runId;
    if (res.ok) {
      mode = 'ai';
      const out = res.output as { ops: Record<string, unknown>[]; rejected: Rejected[]; explanation: string };
      rawOps = (out.ops ?? []).map(compact);
      rejected = (out.rejected ?? []).slice(0, 20).map((r) => ({ request: String(r.request).slice(0, 120), reason: String(r.reason).slice(0, 200) }));
      explanation = String(out.explanation ?? '').slice(0, 800);
    } else aiFailure = res.code;
  }
  if (mode === 'rules') {
    const r = parseRequestRules(doc, prompt);
    rawOps = r.ops;
    rejected = r.rejected;
    explanation = r.explanation;
  }
  // forbidden intents are rejected regardless of what the model returned
  const normalized = normalizeText(prompt);
  for (const [re, reason] of FORBIDDEN) if (re.test(normalized) && !rejected.some((x) => x.reason === reason)) rejected.push({ request: prompt.slice(0, 120), reason });
  const v = validateOps(doc, rawOps);
  const all = [...rejected, ...v.rejected];
  const preview = applyOps(doc, v.ops);
  const diff = diffDocs(doc, preview);
  const status = v.ops.length ? 'proposed' : 'invalid';
  const [row] = await tx<{ id: string }[]>`
    insert into customization_requests (tenant_id, prompt, patch, explanation, rejected_ops, status, base_draft_version, ai_run_id, created_by)
    values (${ctx.tenant.id}, ${prompt}, ${tx.json({ ops: v.ops, mode, warnings: v.warnings, diff } as never)}, ${explanation}, ${tx.json(all as never)},
            ${status}, ${draft.version}, ${runId}, ${ctx.user.userId})
    returning id`;
  return { id: row.id, status, mode, aiFailure, ops: v.ops, rejected: all, warnings: v.warnings, diff, explanation, baseDraftVersion: draft.version };
}

export async function decideCustomization(tx: Tx, ctx: TenantContext, id: string, decision: 'accept' | 'reject') {
  if (!ctx.caps.has('storefront.edit')) throw forbidden();
  const [r] = await tx<{ id: string; status: string; patch: { ops: PatchOp[] }; baseDraftVersion: number }[]>`
    select id, status, patch, base_draft_version from customization_requests where id = ${id} for update`;
  if (!r) throw notFound('customization');
  if (r.status !== 'proposed') throw new AppError('invalid_transition', 'errors.invalid_transition');
  if (decision === 'reject') {
    await tx`update customization_requests set status = 'rejected', decided_at = now() where id = ${id}`;
    return { status: 'rejected' as const };
  }
  const { applyDraftPatch } = await import('../storefront/drafts');
  const ops = r.patch.ops;
  const res = await applyDraftPatch(tx, ctx, (doc) => applyOps(doc, validateOps(doc, ops).ops), r.baseDraftVersion, { source: 'assistant', note: `customization ${id}` });
  await tx`update customization_requests set status = 'applied', applied_draft_version = ${res.version}, decided_at = now() where id = ${id}`;
  await audit(tx, { actorUserId: ctx.user.userId, actorKind: ctx.actorKind, tenantId: ctx.tenant.id, action: 'storefront.assistant_applied', targetType: 'customization', targetId: id, requestId: ctx.requestId, metadata: { draftVersion: res.version, ops: ops.length } });
  return { status: 'applied' as const, draftVersion: res.version, issues: res.issues };
}
