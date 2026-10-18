import { describe, expect, it } from 'vitest';
import { generateDraft } from '@/lib/builder/defaults';
import { validateDocument } from '@/lib/builder/schema';
import { addCustomPage, addNew, canPlace, duplicateBlock, moveBlock, nudge, removeBlock } from '@/components/builder/ops';
import { htmlToMarkup, markupToHtml } from '@/components/builder/richtext';
import { importLegacy } from '@/server/storefront/legacy-import';

const base = () => generateDraft({ businessName: 'Noura', businessType: 'salon' });
const home = (d: ReturnType<typeof base>) => d.layout.pages.find((p) => p.kind === 'home')!;

describe('builder document operations', () => {
  it('generated drafts are valid documents', () => {
    expect(validateDocument(base()).ok).toBe(true);
  });

  it('respects maxPerPage (one hero) and container nesting rules', () => {
    const d = base();
    const pid = home(d).id;
    expect(canPlace(d, { pageId: pid, parentId: null }, 'hero')).toBe(false);
    const c = addNew(d, { pageId: pid, parentId: null }, 0, 'columns');
    expect(c.id).toBeTruthy();
    expect(canPlace(c.doc, { pageId: pid, parentId: c.id }, 'text')).toBe(true);
    expect(canPlace(c.doc, { pageId: pid, parentId: c.id }, 'columns')).toBe(false); // no nested containers
    expect(canPlace(c.doc, { pageId: pid, parentId: c.id }, 'service_list')).toBe(false); // not child-allowed
    const inner = addNew(c.doc, { pageId: pid, parentId: c.id }, 0, 'text');
    expect(validateDocument(inner.doc).ok).toBe(true);
  });

  it('keyboard nudge and drag move reorder blocks; duplicate gets fresh ids; remove works', () => {
    const d = base();
    const pid = home(d).id;
    const [first, second] = home(d).blocks;
    const n = nudge(d, pid, first.id, 1);
    expect(home(n).blocks[1].id).toBe(first.id);
    expect(nudge(d, pid, first.id, -1)).toBe(d); // already first: unchanged
    const m = moveBlock(d, pid, first.id, { pageId: pid, parentId: null }, 3);
    expect(home(m).blocks[2].id).toBe(first.id);
    const dup = duplicateBlock(d, pid, second.id);
    expect(dup.id).not.toBe(second.id);
    expect(validateDocument(dup.doc).ok).toBe(true);
    const r = removeBlock(d, pid, second.id);
    expect(home(r).blocks.some((b) => b.id === second.id)).toBe(false);
  });

  it('custom pages: slug validation and uniqueness', () => {
    const d = base();
    expect(addCustomPage(d, { ar: 'x' }, 'Bad Slug!').error).toBe('errors.slug_invalid');
    const ok = addCustomPage(d, { ar: 'قصتنا' }, 'our-story');
    expect(ok.id).toBeTruthy();
    expect(addCustomPage(ok.doc, { ar: 'x' }, 'our-story').error).toBe('errors.slug_taken');
  });

  it('rich text markup escapes HTML and only produces allowlisted tags', () => {
    const html = markupToHtml('مرحبا <script>x</script> **مهم**\n\n- أ\n- ب\n\n[رابط](https://example.com) [سيء](javascript:alert(1))');
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('<strong>مهم</strong>');
    expect(html).toContain('<ul><li>أ</li><li>ب</li></ul>');
    expect(html).toContain('<a href="https://example.com">رابط</a>');
    expect(html).not.toContain('javascript:alert(1)">');
    expect(htmlToMarkup('<p><strong>a</strong> b</p><ul><li>x</li></ul>')).toBe('**a** b\n\n- x');
  });

  it('legacy import yields a valid document', () => {
    const r = importLegacy({ luma_site: { palette: 'gold', layout: 'minimal' }, luma_page_cfg: { welcome: 'أهلاً', faqText: 'س؟\nج' } }, 'Noura', 'salon');
    expect(validateDocument(r.document).ok).toBe(true);
    expect(r.precedence[0]).toBe('colors: luma_site.palette=gold');
  });
});
