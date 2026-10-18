'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BlockType, PageBlock, StorefrontDocument, ValidationIssue } from '@/lib/builder/schema';
import { apiFetch, ApiError, newIdempotencyKey } from '@/lib/client/api';
import { formatDateTime } from '@/lib/format';
import type { StorefrontData } from '../storefront/types';
import { useLocale, useT } from '../I18n';
import { Icon } from '../Icon';
import { useToast } from '../ui/Toast';
import { useUnsavedGuard } from '../ui/forms';
import { BuilderCtx, type BuilderOptions } from './context';
import { Canvas, type CanvasHandlers } from './Canvas';
import { BlockProperties } from './Properties';
import { BrandPanel, LibraryPanel, PagesPanel, ProfilePanel, VersionsPanel } from './Panels';
import { addNew, canPlace, duplicateBlock, findBlock, findPage, moveBlock, nudge, removeBlock, updateBlock } from './ops';
import './builder.css';

type SaveState = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict' | 'invalid';
type Side = 'library' | 'pages' | 'brand' | 'profile' | 'versions';

const HISTORY_MAX = 80;
const AUTOSAVE_MS = 1500;

export interface BuilderProps {
  slug: string;
  initialDoc: StorefrontDocument;
  initialVersion: number;
  updatedAt: string;
  data: StorefrontData;
  options: BuilderOptions;
  canPublish: boolean;
  canRemovePoweredBy: boolean;
  customPagesLimit: number | null;
  profile: Parameters<typeof ProfilePanel>[0]['initial'];
}

export function BuilderApp(p: BuilderProps) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const [doc, setDoc] = useState<StorefrontDocument>(p.initialDoc);
  const [past, setPast] = useState<StorefrontDocument[]>([]);
  const [future, setFuture] = useState<StorefrontDocument[]>([]);
  const coalesceRef = useRef<{ key: string; at: number } | null>(null);
  const [version, setVersion] = useState(p.initialVersion);
  const [savedDoc, setSavedDoc] = useState<StorefrontDocument>(p.initialDoc);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [lastSaved, setLastSaved] = useState<Date>(new Date(p.updatedAt));
  const [issues, setIssues] = useState<ValidationIssue[]>([]);
  const [pageId, setPageId] = useState(p.initialDoc.layout.pages.find((x) => x.kind === 'home')?.id ?? p.initialDoc.layout.pages[0].id);
  const [selected, setSelected] = useState<string | null>(null);
  const [side, setSide] = useState<Side>('library');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [active, setActive] = useState<{ type: BlockType | null; id: string | null } | null>(null);
  const [assets, setAssets] = useState(p.data.assets);
  const [profile, setProfile] = useState(p.profile);
  const [publishing, setPublishing] = useState(false);
  const saving = useRef(false);

  const dirty = doc !== savedDoc;
  useUnsavedGuard(dirty || saveState === 'saving');

  /** Every edit goes through commit(): history + dirty state. Text edits coalesce. */
  const commit = useCallback(
    (next: StorefrontDocument, coalesce?: string) => {
      if (next === doc) return;
      const now = Date.now();
      const c = coalesceRef.current;
      if (!(coalesce && c && c.key === coalesce && now - c.at < 1200)) {
        setPast((h) => [...h.slice(-HISTORY_MAX + 1), doc]);
      }
      coalesceRef.current = coalesce ? { key: coalesce, at: now } : null;
      setFuture([]);
      setDoc(next);
      if (saveState !== 'conflict') setSaveState('dirty');
    },
    [doc, saveState],
  );

  const undo = useCallback(() => {
    setPast((h) => {
      if (!h.length) return h;
      const prev = h[h.length - 1];
      setFuture((f) => [doc, ...f].slice(0, HISTORY_MAX));
      setDoc(prev);
      coalesceRef.current = null;
      return h.slice(0, -1);
    });
  }, [doc]);
  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f;
      const nx = f[0];
      setPast((h) => [...h, doc].slice(-HISTORY_MAX));
      setDoc(nx);
      return f.slice(1);
    });
  }, [doc]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // ── saving ──
  const save = useCallback(async (): Promise<number | null> => {
    if (saving.current) return null;
    saving.current = true;
    const sent = doc;
    setSaveState('saving');
    try {
      const r = await apiFetch<{ version: number; issues: ValidationIssue[] }>(`/api/v1/t/${p.slug}/storefront/draft`, { method: 'PUT', body: { document: sent, expectedVersion: version } });
      setVersion(r.version);
      setSavedDoc(sent);
      setIssues(r.issues ?? []);
      setLastSaved(new Date());
      setSaveState((s) => (s === 'saving' ? 'saved' : s));
      return r.version;
    } catch (e) {
      const err = e as ApiError;
      if (err.code === 'version_conflict') setSaveState('conflict');
      else if (err.status === 422 || err.code === 'plan_limit') {
        setIssues(((err.details as { issues?: ValidationIssue[] })?.issues ?? []).map((i) => ({ ...i, severity: 'error' as const })));
        setSaveState('invalid');
      } else setSaveState('error');
      return null;
    } finally {
      saving.current = false;
    }
  }, [doc, version, p.slug]);

  // the doc that was sent may differ from the current one: keep "dirty" until they match
  useEffect(() => {
    if (saveState === 'saved' && doc !== savedDoc) setSaveState('dirty');
  }, [doc, savedDoc, saveState]);

  useEffect(() => {
    if (saveState !== 'dirty') return;
    const h = setTimeout(() => void save(), AUTOSAVE_MS);
    return () => clearTimeout(h);
  }, [doc, saveState, save]);

  const resolveConflict = async (mode: 'reload' | 'overwrite') => {
    const latest = await apiFetch<{ document: StorefrontDocument; version: number }>(`/api/v1/t/${p.slug}/storefront/draft`);
    if (mode === 'reload') {
      if (dirty && !window.confirm(t('builder.confirm_discard'))) return;
      setDoc(latest.document);
      setSavedDoc(latest.document);
      setPast([]);
      setFuture([]);
      setVersion(latest.version);
      setSaveState('saved');
    } else {
      // explicit choice: my version replaces the other session's changes
      setVersion(latest.version);
      setSavedDoc(latest.document);
      setSaveState('dirty');
    }
  };

  const publish = async () => {
    if (!window.confirm(t('builder.confirm_publish'))) return;
    setPublishing(true);
    try {
      let v: number | null = version;
      if (dirty) v = await save();
      if (v === null) return;
      const r = await apiFetch<{ number: number; warnings: ValidationIssue[] }>(`/api/v1/t/${p.slug}/storefront/publish`, { method: 'POST', body: { expectedVersion: v }, idempotencyKey: newIdempotencyKey() });
      toast(t('builder.published', { n: r.number }), 'ok');
      setIssues(r.warnings ?? []);
    } catch (e) {
      const err = e as ApiError;
      if (err.code === 'version_conflict') setSaveState('conflict');
      if (err.details && (err.details as { issues?: ValidationIssue[] }).issues) setIssues((err.details as { issues: ValidationIssue[] }).issues);
      toast(t(err.message), 'err');
    } finally {
      setPublishing(false);
    }
  };

  const preview = async () => {
    const w = window.open('about:blank', '_blank');
    try {
      if (dirty) await save();
      const r = await apiFetch<{ path: string }>(`/api/v1/t/${p.slug}/storefront/preview-token`, { method: 'POST', body: { hours: 24 } });
      if (w) w.location.href = r.path;
    } catch (e) {
      w?.close();
      toast(t((e as ApiError).message), 'err');
    }
  };

  const reloadAfterRestore = async () => {
    const latest = await apiFetch<{ document: StorefrontDocument; version: number }>(`/api/v1/t/${p.slug}/storefront/draft`);
    setPast((h) => [...h, doc]);
    setDoc(latest.document);
    setSavedDoc(latest.document);
    setVersion(latest.version);
    setSaveState('saved');
    toast(t('builder.restored'), 'ok');
  };

  // ── canvas handlers ──
  const page = findPage(doc, pageId) ?? doc.layout.pages[0];
  const sel = selected ? findBlock(page.blocks, selected) : null;

  const h: CanvasHandlers = {
    select: setSelected,
    canDrop: (type, movingId, parentId) => {
      const tp = type ?? (movingId ? findBlock(page.blocks, movingId)?.block.type ?? null : null);
      return tp ? canPlace(doc, { pageId: page.id, parentId }, tp, movingId ?? undefined) : false;
    },
    dropNew: (type, parentId, index) => {
      const r = addNew(doc, { pageId: page.id, parentId }, index, type);
      if (!r.id) return toast(t('builder.cannot_place'), 'err');
      commit(r.doc);
      setSelected(r.id);
    },
    dropMove: (id, parentId, index) => {
      const next = moveBlock(doc, page.id, id, { pageId: page.id, parentId }, index);
      if (next === doc) toast(t('builder.cannot_place'), 'err');
      commit(next);
    },
    nudge: (id, d) => commit(nudge(doc, page.id, id, d)),
    duplicate: (id) => {
      const r = duplicateBlock(doc, page.id, id);
      if (!r.id) return toast(t('builder.cannot_place'), 'err');
      commit(r.doc);
      setSelected(r.id);
    },
    toggle: (id) => commit(updateBlock(doc, page.id, id, (b) => { b.visibility = { enabled: !b.visibility.enabled }; })),
    remove: (id) => {
      commit(removeBlock(doc, page.id, id));
      if (selected === id) setSelected(null);
      toast(t('builder.deleted_undo'), 'info');
    },
  };

  /** Library "Add": inside a selected container if allowed, else after the selection, else at the end. */
  const addFromLibrary = (type: BlockType) => {
    let parentId: string | null = null;
    let index = page.blocks.length;
    if (sel) {
      if (sel.block.children && canPlace(doc, { pageId: page.id, parentId: sel.block.id }, type)) {
        parentId = sel.block.id;
        index = sel.block.children.length;
      } else {
        parentId = sel.parent?.id ?? null;
        index = sel.index + 1;
      }
    }
    h.dropNew(type, parentId, index);
  };

  const env = useMemo(
    () => ({
      slug: p.slug,
      options: p.options,
      assets,
      addAsset: (id: string, url: string, alt: string) => setAssets((a) => ({ ...a, [id]: { w640: url, w1280: url, alt, altEn: null } })),
    }),
    [p.slug, p.options, assets],
  );

  const ctx = useMemo(() => ({ data: { ...p.data, doc, assets, profile: { ...p.data.profile, ...profileForCanvas(profile) } }, locale, base: `/s/${p.slug}`, editing: true }), [p.data, doc, assets, locale, p.slug, profile]);

  const stateLabel: Record<SaveState, string> = {
    saved: t('builder.saved_at', { time: formatDateTime(lastSaved, { locale, timeOnly: true }) }),
    dirty: t('builder.unsaved'),
    saving: t('common.saving'),
    error: t('builder.save_failed'),
    conflict: t('builder.conflict'),
    invalid: t('builder.invalid'),
  };
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');

  return (
    <BuilderCtx.Provider value={env}>
      <div className="bld">
        <div className="bld-toolbar" role="toolbar" aria-label={t('builder.toolbar')}>
          <label className="sr-only" htmlFor="bld-page">{t('builder.current_page')}</label>
          <select id="bld-page" className="input" style={{ width: 'auto', minHeight: 34 }} value={page.id} onChange={(e) => { setPageId(e.target.value); setSelected(null); }}>
            {doc.layout.pages.map((pg) => <option key={pg.id} value={pg.id}>{pg.title.ar || pg.slug}</option>)}
          </select>
          <button type="button" className="btn icon-btn" onClick={undo} disabled={!past.length} aria-label={t('builder.undo')} title={`${t('builder.undo')} (Ctrl+Z)`}><Icon name="undo" size={17} /></button>
          <button type="button" className="btn icon-btn" onClick={redo} disabled={!future.length} aria-label={t('builder.redo')} title={`${t('builder.redo')} (Ctrl+Shift+Z)`}><Icon name="redo" size={17} /></button>
          <div className="bld-seg" role="group" aria-label={t('builder.device')}>
            <button type="button" aria-pressed={device === 'desktop'} onClick={() => setDevice('desktop')} aria-label={t('builder.desktop')}><Icon name="desktop" size={17} /></button>
            <button type="button" aria-pressed={device === 'mobile'} onClick={() => setDevice('mobile')} aria-label={t('builder.mobile')}><Icon name="mobile" size={17} /></button>
          </div>
          <span className={`bld-state ${saveState}`} role="status" aria-live="polite">{stateLabel[saveState]}</span>
          <div style={{ flex: 1 }} />
          {(saveState === 'error' || saveState === 'dirty') && <button type="button" className="btn btn-sm" onClick={() => void save()}>{t('common.save')}</button>}
          <button type="button" className="btn btn-sm btn-ghost" onClick={preview}><Icon name="eye" size={16} /> {t('builder.preview')}</button>
          {p.canPublish && (
            <button type="button" className="btn btn-sm btn-gold" onClick={publish} disabled={publishing || saveState === 'conflict' || saveState === 'invalid'}>
              {publishing ? t('common.loading') : t('builder.publish')}
            </button>
          )}
        </div>

        {saveState === 'conflict' && (
          <div className="alert warn" role="alert">
            <Icon name="alert" size={18} />
            <div style={{ flex: 1 }}>
              <strong>{t('builder.conflict_title')}</strong>
              <div className="small">{t('builder.conflict_body')}</div>
              <div className="row" style={{ marginTop: 8 }}>
                <button type="button" className="btn btn-sm" onClick={() => resolveConflict('reload')}>{t('builder.conflict_reload')}</button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => resolveConflict('overwrite')}>{t('builder.conflict_keep_mine')}</button>
              </div>
            </div>
          </div>
        )}
        {errors.length > 0 && (
          <div className="alert error" role="alert">
            <Icon name="alert" size={18} />
            <div>
              <strong>{t('builder.fix_before_saving')}</strong>
              <ul className="small" style={{ margin: '4px 0 0', paddingInlineStart: 18 }}>
                {errors.slice(0, 8).map((i, k) => <li key={k}>{issueText(t, i)}</li>)}
              </ul>
            </div>
          </div>
        )}
        {warnings.length > 0 && errors.length === 0 && (
          <details className="alert warn">
            <summary>{t('builder.warnings', { n: warnings.length })}</summary>
            <ul className="small" style={{ margin: '4px 0 0', paddingInlineStart: 18 }}>{warnings.slice(0, 10).map((i, k) => <li key={k}>{issueText(t, i)}</li>)}</ul>
          </details>
        )}

        <div className="bld-body">
          <aside className="bld-side" aria-label={t('builder.panels')}>
            <div className="tabs" role="tablist">
              {(['library', 'pages', 'brand', 'profile', 'versions'] as Side[]).map((s) => (
                <button key={s} type="button" role="tab" className="tab" aria-selected={side === s} onClick={() => setSide(s)}>{t(`builder.tab.${s}`)}</button>
              ))}
            </div>
            <div role="tabpanel">
              {side === 'library' && <LibraryPanel onAdd={addFromLibrary} canAdd={(type) => canPlace(doc, { pageId: page.id, parentId: null }, type) || !!(sel?.block.children && canPlace(doc, { pageId: page.id, parentId: sel.block.id }, type))} setActive={setActive} />}
              {side === 'pages' && <PagesPanel doc={doc} currentPageId={page.id} setPage={(id) => { setPageId(id); setSelected(null); }} change={(next) => commit(next)} customLimit={p.customPagesLimit} />}
              {side === 'brand' && <BrandPanel doc={doc} canRemovePoweredBy={p.canRemovePoweredBy} change={(fn, co) => { const next = structuredClone(doc); fn(next); commit(next, co); }} />}
              {side === 'profile' && <ProfilePanel slug={p.slug} initial={profile} onSaved={setProfile} />}
              {side === 'versions' && <VersionsPanel slug={p.slug} draftVersion={version} canPublish={p.canPublish} onRestored={reloadAfterRestore} tz={p.data.tenant.timezone} />}
            </div>
          </aside>

          <Canvas ctx={ctx} page={page} selected={selected} h={h} device={device} active={active} setActive={setActive} />

          <aside className="bld-props" aria-label={t('builder.properties')}>
            {sel ? (
              <BlockProperties
                key={sel.block.id}
                doc={doc}
                pageId={page.id}
                block={sel.block}
                onChange={(fn: (b: PageBlock) => void, co?: string) => commit(updateBlock(doc, page.id, sel.block.id, fn), co)}
              />
            ) : (
              <div className="empty">
                <Icon name="layers" size={28} />
                <p>{t('builder.select_hint')}</p>
                <p className="small">{t('builder.keyboard_hint')}</p>
              </div>
            )}
          </aside>
        </div>
      </div>
    </BuilderCtx.Provider>
  );
}

function issueText(t: (k: string, v?: Record<string, string | number>) => string, i: ValidationIssue) {
  const [key, arg] = i.message.split(':');
  const msg = t(key, arg ? { what: arg } : undefined);
  const where = i.path.includes(':') ? ` (${i.path.split(':')[0]})` : '';
  return `${msg}${where}`;
}

function profileForCanvas(p: BuilderProps['profile']) {
  return {
    tagline: p.tagline,
    taglineEn: p.taglineEn,
    intro: p.intro,
    introEn: p.introEn,
    contactPhone: p.contactPhone,
    contactEmail: p.contactEmail,
    whatsapp: p.whatsapp,
    address: p.address,
    socials: p.socials ?? {},
  };
}
