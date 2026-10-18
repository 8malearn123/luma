import { BLOCK_META, LIMITS, newBlock, newBlockId, type BlockType, type PageBlock, type StorefrontDocument, type StorePage } from '@/lib/builder/schema';

/**
 * Pure, immutable document operations used by the builder (drag & drop,
 * keyboard/touch controls, properties). Each returns a NEW document; invalid
 * operations return the input unchanged so the UI can't create trees the
 * server would reject (the server validates again anyway).
 */
export type Container = { pageId: string; parentId: string | null };

const clone = <T,>(x: T): T => structuredClone(x);

export function findPage(doc: StorefrontDocument, pageId: string): StorePage | undefined {
  return doc.layout.pages.find((p) => p.id === pageId);
}

export function findBlock(blocks: PageBlock[], id: string): { block: PageBlock; parent: PageBlock | null; list: PageBlock[]; index: number } | null {
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.id === id) return { block: b, parent: null, list: blocks, index: i };
    if (b.children) {
      const j = b.children.findIndex((c) => c.id === id);
      if (j >= 0) return { block: b.children[j], parent: b, list: b.children, index: j };
    }
  }
  return null;
}

function listFor(page: StorePage, parentId: string | null): PageBlock[] | null {
  if (!parentId) return page.blocks;
  const p = page.blocks.find((b) => b.id === parentId);
  return p && BLOCK_META[p.type].container ? (p.children ??= []) : null;
}

/** Can a block of `type` live in this container (page root or a container block)? */
export function canPlace(doc: StorefrontDocument, at: Container, type: BlockType, movingId?: string): boolean {
  const page = findPage(doc, at.pageId);
  if (!page) return false;
  const meta = BLOCK_META[type];
  if (at.parentId) {
    const parent = page.blocks.find((b) => b.id === at.parentId);
    if (!parent || !BLOCK_META[parent.type].container) return false;
    if (!meta.childAllowed) return false;
    const count = (parent.children ?? []).filter((c) => c.id !== movingId).length;
    if (count >= LIMITS.childrenPerContainer) return false;
  } else {
    const count = page.blocks.filter((b) => b.id !== movingId).length;
    if (count >= LIMITS.blocksPerPage) return false;
  }
  if (meta.maxPerPage) {
    let n = 0;
    for (const b of page.blocks) {
      if (b.type === type && b.id !== movingId) n++;
      for (const c of b.children ?? []) if (c.type === type && c.id !== movingId) n++;
    }
    if (n >= meta.maxPerPage) return false;
  }
  return true;
}

export function insertBlock(doc: StorefrontDocument, at: Container, index: number, block: PageBlock): StorefrontDocument {
  if (!canPlace(doc, at, block.type)) return doc;
  const next = clone(doc);
  const list = listFor(findPage(next, at.pageId)!, at.parentId);
  if (!list) return doc;
  list.splice(Math.max(0, Math.min(index, list.length)), 0, block);
  return next;
}

export function addNew(doc: StorefrontDocument, at: Container, index: number, type: BlockType): { doc: StorefrontDocument; id: string | null } {
  const action = BLOCK_META[type].action === 'required' ? { type: 'start_booking' as const } : undefined;
  const b = newBlock(type, {}, action);
  const next = insertBlock(doc, at, index, b);
  return { doc: next, id: next === doc ? null : b.id };
}

export function moveBlock(doc: StorefrontDocument, pageId: string, id: string, to: Container, toIndex: number): StorefrontDocument {
  const page = findPage(doc, pageId);
  const found = page && findBlock(page.blocks, id);
  if (!found) return doc;
  if (to.parentId === id) return doc;
  if (BLOCK_META[found.block.type].container && to.parentId) return doc; // containers can't nest
  if (!canPlace(doc, to, found.block.type, id)) return doc;
  const next = clone(doc);
  const np = findPage(next, pageId)!;
  const f = findBlock(np.blocks, id)!;
  f.list.splice(f.index, 1);
  const target = listFor(findPage(next, to.pageId)!, to.parentId);
  if (!target) return doc;
  let idx = toIndex;
  if (f.list === target && f.index < toIndex) idx -= 1;
  target.splice(Math.max(0, Math.min(idx, target.length)), 0, f.block);
  return next;
}

/** Keyboard/touch alternative to dragging: move one step up/down within its list. */
export function nudge(doc: StorefrontDocument, pageId: string, id: string, delta: -1 | 1): StorefrontDocument {
  const page = findPage(doc, pageId);
  const f = page && findBlock(page.blocks, id);
  if (!f) return doc;
  const j = f.index + delta;
  if (j < 0 || j >= f.list.length) return doc;
  const next = clone(doc);
  const nf = findBlock(findPage(next, pageId)!.blocks, id)!;
  [nf.list[f.index], nf.list[j]] = [nf.list[j], nf.list[f.index]];
  return next;
}

export function duplicateBlock(doc: StorefrontDocument, pageId: string, id: string): { doc: StorefrontDocument; id: string | null } {
  const page = findPage(doc, pageId);
  const f = page && findBlock(page.blocks, id);
  if (!f) return { doc, id: null };
  const copy = clone(f.block);
  copy.id = newBlockId();
  for (const c of copy.children ?? []) c.id = newBlockId();
  const next = insertBlock(doc, { pageId, parentId: f.parent?.id ?? null }, f.index + 1, copy);
  return { doc: next, id: next === doc ? null : copy.id };
}

export function removeBlock(doc: StorefrontDocument, pageId: string, id: string): StorefrontDocument {
  const page = findPage(doc, pageId);
  if (!page || !findBlock(page.blocks, id)) return doc;
  const next = clone(doc);
  const f = findBlock(findPage(next, pageId)!.blocks, id)!;
  f.list.splice(f.index, 1);
  return next;
}

export function updateBlock(doc: StorefrontDocument, pageId: string, id: string, fn: (b: PageBlock) => void): StorefrontDocument {
  const next = clone(doc);
  const page = findPage(next, pageId);
  const f = page && findBlock(page.blocks, id);
  if (!f) return doc;
  fn(f.block);
  return next;
}

export function updatePage(doc: StorefrontDocument, pageId: string, fn: (p: StorePage) => void): StorefrontDocument {
  const next = clone(doc);
  const p = findPage(next, pageId);
  if (!p) return doc;
  fn(p);
  return next;
}

export function movePage(doc: StorefrontDocument, pageId: string, delta: -1 | 1): StorefrontDocument {
  const i = doc.layout.pages.findIndex((p) => p.id === pageId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= doc.layout.pages.length) return doc;
  const next = clone(doc);
  const ps = next.layout.pages;
  [ps[i], ps[j]] = [ps[j], ps[i]];
  return next;
}

export function addCustomPage(doc: StorefrontDocument, title: { ar: string; en?: string }, slug: string): { doc: StorefrontDocument; id: string | null; error?: string } {
  const clean = slug.trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/.test(clean)) return { doc, id: null, error: 'errors.slug_invalid' };
  if (doc.layout.pages.some((p) => p.slug === clean)) return { doc, id: null, error: 'errors.slug_taken' };
  if (doc.layout.pages.length >= LIMITS.pages) return { doc, id: null, error: 'builder.too_many_pages' };
  const next = clone(doc);
  const id = `p-${newBlockId().slice(2, 30)}`;
  next.layout.pages.push({ id, kind: 'custom', slug: clean, title: { ar: title.ar, ...(title.en ? { en: title.en } : {}) }, showInNav: false, showInFooter: true, blocks: [newBlock('text', {})] });
  return { doc: next, id };
}

export function removePage(doc: StorefrontDocument, pageId: string): StorefrontDocument {
  const p = findPage(doc, pageId);
  if (!p || p.kind === 'home') return doc;
  const next = clone(doc);
  next.layout.pages = next.layout.pages.filter((x) => x.id !== pageId);
  return next;
}

/** Blocks on a page (flattened) — used for "section" link targets. */
export function sectionTargets(page: StorePage): PageBlock[] {
  return page.blocks.flatMap((b) => [b, ...(b.children ?? [])]);
}
