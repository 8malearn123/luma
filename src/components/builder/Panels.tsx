'use client';

import { useEffect, useId, useState } from 'react';
import { BLOCK_META, BLOCK_TYPES, FONTS, type BlockType, type Brand, type FontKey, type StorefrontDocument } from '@/lib/builder/schema';
import { brandContrastIssues, PALETTES } from '@/lib/builder/defaults';
import { apiFetch, ApiError, newIdempotencyKey } from '@/lib/client/api';
import { formatDateTime } from '@/lib/format';
import { useLocale, useT } from '../I18n';
import { Icon, type IconName } from '../Icon';
import { ErrorAlert, useSubmit } from '../ui/forms';
import { DND_NEW } from './Canvas';
import { ImageField } from './Properties';
import { addCustomPage, movePage, removePage, updatePage } from './ops';

const BLOCK_ICON: Record<BlockType, IconName> = {
  hero: 'image', image_ad: 'mega', image: 'image', text: 'text', cta: 'button', service_list: 'list', service: 'scissors', categories: 'grid',
  product_grid: 'boxes', product: 'bag', team: 'users', staff: 'user', gallery: 'image', offers: 'gift', reviews: 'star', intro: 'info',
  map: 'pin', hours: 'clock', contact: 'phone', social: 'link', faq: 'faq', policies: 'shield', welcome: 'bell', columns: 'layers', footer: 'layers',
};
const CATS = ['media', 'content', 'catalog', 'people', 'trust', 'info', 'layout'] as const;

export function LibraryPanel({ onAdd, canAdd, setActive }: { onAdd: (type: BlockType) => void; canAdd: (type: BlockType) => boolean; setActive: (a: { type: BlockType; id: null } | null) => void }) {
  const t = useT();
  return (
    <div>
      <p className="small muted">{t('builder.library_hint')}</p>
      {CATS.map((c) => (
        <div key={c} style={{ marginBottom: 12 }}>
          <div className="nav-group" style={{ padding: 0 }}>{t(`builder.cat.${c}`)}</div>
          <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0, gap: 6 }}>
            {BLOCK_TYPES.filter((b) => BLOCK_META[b].category === c).map((type) => {
              const ok = canAdd(type);
              return (
                <li
                  key={type}
                  className="bld-lib-item"
                  draggable={ok}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DND_NEW, type);
                    e.dataTransfer.effectAllowed = 'copy';
                    setActive({ type, id: null });
                  }}
                  onDragEnd={() => setActive(null)}
                >
                  <Icon name={BLOCK_ICON[type]} size={17} />
                  <span style={{ flex: 1 }}>{t(`builder.block.${type}`)}</span>
                  <button type="button" className="btn btn-sm btn-quiet" disabled={!ok} onClick={() => onAdd(type)} aria-label={`${t('common.add')}: ${t(`builder.block.${type}`)}`}>
                    <Icon name="plus" size={14} />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId();
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div className="row" style={{ marginBottom: 8, gap: 8 }}>
      <input type="color" aria-label={label} value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} style={{ width: 40, height: 32, border: 0, background: 'none', padding: 0 }} />
      <label htmlFor={id} className="small" style={{ flex: 1 }}>{label}</label>
      <input id={id} className="input input-ltr mono" style={{ width: 100, minHeight: 32 }} value={text} onChange={(e) => {
        setText(e.target.value);
        if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) onChange(e.target.value.toUpperCase());
      }} />
    </div>
  );
}

export function BrandPanel({ doc, change, canRemovePoweredBy }: { doc: StorefrontDocument; change: (fn: (d: StorefrontDocument) => void, coalesce?: string) => void; canRemovePoweredBy: boolean }) {
  const t = useT();
  const locale = useLocale();
  const b = doc.brand;
  const issues = brandContrastIssues(b.colors);
  const keys: (keyof Brand['colors'])[] = ['background', 'surface', 'text', 'mutedText', 'primary', 'primaryText', 'accent', 'border'];
  const sel = <K extends 'radius' | 'buttonStyle' | 'cardStyle' | 'density'>(k: K, vals: Brand[K][]) => (
    <div className="field">
      <label htmlFor={`b-${k}`}>{t(`builder.brand.${k}`)}</label>
      <select id={`b-${k}`} className="input" value={b[k]} onChange={(e) => change((d) => { (d.brand[k] as string) = e.target.value; })}>
        {vals.map((v) => <option key={v} value={v}>{t(`builder.opt.${v}`)}</option>)}
      </select>
    </div>
  );
  const app = doc.appearance;
  return (
    <div>
      <h3 style={{ marginTop: 0 }}>{t('builder.brand_title')}</h3>
      <p className="small muted">{t('builder.brand_hint')}</p>
      <fieldset>
        <legend>{t('builder.palettes')}</legend>
        <div className="chips">
          {PALETTES.map((p) => (
            <button key={p.key} type="button" className="chip" onClick={() => change((d) => { d.brand.colors = { ...p.colors }; d.brand.fonts = { ...p.fonts }; })}>
              <span className="swatch" style={{ background: p.colors.primary, width: 14, height: 14, marginInlineEnd: 6 }} />
              {locale === 'ar' ? p.nameAr : p.nameEn}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>{t('builder.colors')}</legend>
        {keys.map((k) => <ColorField key={k} label={t(`builder.color.${k}`)} value={b.colors[k]} onChange={(v) => change((d) => { d.brand.colors[k] = v; }, `color:${k}`)} />)}
        {issues.length > 0 && (
          <div className="alert warn" role="status">
            <Icon name="alert" size={16} />
            <div>{issues.map((i) => <div key={i}>{t(`builder.warn_contrast_${i}`)}</div>)}</div>
          </div>
        )}
      </fieldset>
      <fieldset>
        <legend>{t('builder.fonts')}</legend>
        {(['heading', 'body'] as const).map((k) => (
          <div className="field" key={k}>
            <label htmlFor={`f-${k}`}>{t(`builder.font.${k}`)}</label>
            <select id={`f-${k}`} className="input" value={b.fonts[k]} onChange={(e) => change((d) => { d.brand.fonts[k] = e.target.value as FontKey; })}>
              {Object.entries(FONTS).map(([key, f]) => <option key={key} value={key}>{f.label}</option>)}
            </select>
          </div>
        ))}
      </fieldset>
      {sel('radius', ['none', 'sm', 'md', 'lg', 'pill'])}
      {sel('buttonStyle', ['solid', 'outline', 'soft'])}
      {sel('cardStyle', ['flat', 'bordered', 'elevated'])}
      {sel('density', ['compact', 'comfortable', 'airy'])}
      <ImageField label={t('builder.logo')} value={b.logoAssetId} purpose="logo" onChange={(id) => change((d) => { d.brand.logoAssetId = id; })} />
      <div className="field">
        <label htmlFor="b-wordmark">{t('builder.wordmark')}</label>
        <input id="b-wordmark" className="input" maxLength={60} value={b.wordmark} onChange={(e) => change((d) => { d.brand.wordmark = e.target.value; }, 'wordmark')} />
      </div>
      <h3>{t('builder.appearance')}</h3>
      {([['navStyle', ['simple', 'pill', 'bottom']], ['serviceDisplay', ['list', 'cards']], ['productDisplay', ['grid', 'list']]] as const).map(([k, vals]) => (
        <div className="field" key={k}>
          <label htmlFor={`a-${k}`}>{t(`builder.app.${k}`)}</label>
          <select id={`a-${k}`} className="input" value={app[k]} onChange={(e) => change((d) => { (d.appearance[k] as string) = e.target.value; })}>
            {vals.map((v) => <option key={v} value={v}>{t(`builder.opt.${v}`)}</option>)}
          </select>
        </div>
      ))}
      <label className="check">
        <input type="checkbox" checked={app.showPoweredBy} disabled={!canRemovePoweredBy} onChange={(e) => change((d) => { d.appearance.showPoweredBy = e.target.checked; })} />
        <span>{t('builder.powered_by')}</span>
      </label>
      {!canRemovePoweredBy && <p className="small muted">{t('builder.powered_by_plan')}</p>}
    </div>
  );
}

export function PagesPanel({ doc, currentPageId, setPage, change, customLimit }: { doc: StorefrontDocument; currentPageId: string; setPage: (id: string) => void; change: (next: StorefrontDocument) => void; customLimit: number | null }) {
  const t = useT();
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const customCount = doc.layout.pages.filter((p) => p.kind === 'custom').length;
  const atLimit = customLimit !== null && customCount >= customLimit;
  return (
    <div>
      <h3 style={{ marginTop: 0 }}>{t('builder.pages')}</h3>
      <ul className="stack" style={{ listStyle: 'none', padding: 0, gap: 8 }}>
        {doc.layout.pages.map((p, i) => (
          <li key={p.id} className="card" style={{ padding: 10, borderColor: p.id === currentPageId ? 'var(--gold-deep)' : undefined }}>
            <div className="row between">
              <button type="button" className="btn btn-quiet btn-sm" aria-current={p.id === currentPageId ? 'page' : undefined} onClick={() => setPage(p.id)}>
                {p.title.ar || p.slug} <span className="badge">{t(`builder.kind.${p.kind}`)}</span>
              </button>
              <span className="row" style={{ gap: 2 }}>
                <button type="button" className="btn icon-btn" aria-label={t('builder.move_up')} disabled={i === 0} onClick={() => change(movePage(doc, p.id, -1))}><Icon name="arrowUp" size={14} /></button>
                <button type="button" className="btn icon-btn" aria-label={t('builder.move_down')} disabled={i === doc.layout.pages.length - 1} onClick={() => change(movePage(doc, p.id, 1))}><Icon name="arrowDown" size={14} /></button>
                {p.kind !== 'home' && (
                  <button type="button" className="btn icon-btn" aria-label={`${t('common.delete')}: ${p.title.ar}`} onClick={() => window.confirm(t('builder.confirm_delete_page')) && change(removePage(doc, p.id))}>
                    <Icon name="trash" size={14} />
                  </button>
                )}
              </span>
            </div>
            {p.id === currentPageId && (
              <div style={{ marginTop: 8 }}>
                <div className="field">
                  <label htmlFor={`pt-${p.id}`}>{t('builder.page_title_ar')}</label>
                  <input id={`pt-${p.id}`} className="input" value={p.title.ar} onChange={(e) => change(updatePage(doc, p.id, (x) => { x.title = { ...x.title, ar: e.target.value }; }))} />
                </div>
                <div className="field">
                  <label htmlFor={`pte-${p.id}`}>{t('builder.page_title_en')}</label>
                  <input id={`pte-${p.id}`} className="input" dir="ltr" value={p.title.en ?? ''} onChange={(e) => change(updatePage(doc, p.id, (x) => { x.title = { ...x.title, en: e.target.value || undefined }; }))} />
                </div>
                {p.kind === 'custom' && (
                  <div className="field">
                    <label htmlFor={`ps-${p.id}`}>{t('builder.page_slug')}</label>
                    <input id={`ps-${p.id}`} className="input input-ltr mono" value={p.slug} onChange={(e) => change(updatePage(doc, p.id, (x) => { x.slug = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''); }))} />
                  </div>
                )}
                <label className="check"><input type="checkbox" checked={p.showInNav} onChange={(e) => change(updatePage(doc, p.id, (x) => { x.showInNav = e.target.checked; }))} /> <span>{t('builder.in_nav')}</span></label>
                <label className="check" style={{ marginInlineStart: 12 }}><input type="checkbox" checked={p.showInFooter} onChange={(e) => change(updatePage(doc, p.id, (x) => { x.showInFooter = e.target.checked; }))} /> <span>{t('builder.in_footer')}</span></label>
              </div>
            )}
          </li>
        ))}
      </ul>
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          const r = addCustomPage(doc, { ar: title.trim() }, slug);
          if (r.error) return setErr(t(r.error));
          setErr(null);
          setTitle('');
          setSlug('');
          change(r.doc);
          if (r.id) setPage(r.id);
        }}
      >
        <h4 style={{ marginTop: 0 }}>{t('builder.add_page')}</h4>
        {atLimit && <p className="small muted">{t('builder.custom_pages_limit', { n: customLimit ?? 0 })}</p>}
        <div className="field">
          <label htmlFor="np-title">{t('builder.page_title_ar')}</label>
          <input id="np-title" className="input" required value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="np-slug">{t('builder.page_slug')}</label>
          <input id="np-slug" className="input input-ltr mono" required value={slug} placeholder="our-story" onChange={(e) => setSlug(e.target.value.toLowerCase())} />
        </div>
        {err && <p className="small" role="alert" style={{ color: 'var(--red)' }}>{err}</p>}
        <button type="submit" className="btn btn-sm" disabled={atLimit || !title.trim()}><Icon name="plus" size={14} /> {t('builder.add_page')}</button>
      </form>
    </div>
  );
}

interface VersionRow {
  id: string;
  number: number;
  publishedAt: string;
  publisherName: string | null;
  restoredFromId: string | null;
  note: string | null;
  current: boolean;
}

export function VersionsPanel({ slug, draftVersion, canPublish, onRestored, tz }: { slug: string; draftVersion: number; canPublish: boolean; onRestored: () => void; tz: string }) {
  const t = useT();
  const locale = useLocale();
  const [items, setItems] = useState<VersionRow[] | null>(null);
  const [err, setErr] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const [rErr, setRErr] = useState<ApiError | null>(null);
  const load = () =>
    apiFetch<{ items: VersionRow[] }>(`/api/v1/t/${slug}/storefront/versions`)
      .then((r) => setItems(r.items))
      .catch((e) => setErr(e));
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, draftVersion]);
  const doRestore = async (id: string, republish: boolean) => {
    if (!window.confirm(t(republish ? 'builder.confirm_rollback' : 'builder.confirm_restore'))) return;
    setBusy(true);
    setRErr(null);
    try {
      await apiFetch(`/api/v1/t/${slug}/storefront/versions/${id}/restore`, { method: 'POST', body: { expectedVersion: draftVersion, republish }, idempotencyKey: newIdempotencyKey() });
      onRestored();
    } catch (e) {
      setRErr(e instanceof ApiError ? e : new ApiError('internal', 'errors.internal', 500));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      <h3 style={{ marginTop: 0 }}>{t('builder.versions')}</h3>
      <p className="small muted">{t('builder.versions_hint')}</p>
      <ErrorAlert error={err ?? rErr} />
      {items === null && !err && <div className="skeleton" style={{ height: 60 }} />}
      {items?.length === 0 && <p className="muted">{t('builder.no_versions')}</p>}
      <ul className="stack" style={{ listStyle: 'none', padding: 0, gap: 8 }}>
        {items?.map((v) => (
          <li key={v.id} className="card" style={{ padding: 10 }}>
            <div className="row between">
              <strong>v{v.number}</strong>
              {v.current && <span className="badge green">{t('builder.live')}</span>}
            </div>
            <div className="small muted">{formatDateTime(v.publishedAt, { tz, locale })} · {v.publisherName ?? '—'}</div>
            {v.note && <div className="small">{v.note}</div>}
            <div className="row" style={{ marginTop: 6 }}>
              <button type="button" className="btn btn-sm" disabled={busy} onClick={() => doRestore(v.id, false)}>{t('builder.restore_to_draft')}</button>
              {canPublish && !v.current && (
                <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => doRestore(v.id, true)}>{t('builder.rollback')}</button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface Profile {
  tagline: string | null;
  taglineEn: string | null;
  intro: string | null;
  introEn: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  whatsapp: string | null;
  address: string | null;
  socials: Record<string, string>;
}

/** Business facts (shared by blocks): contact, intro, socials. Saved separately from design. */
export function ProfilePanel({ slug, initial, onSaved }: { slug: string; initial: Profile; onSaved: (p: Profile) => void }) {
  const t = useT();
  const [p, setP] = useState<Profile>(initial);
  const s = useSubmit<Profile, { profile: Profile }>(`/api/v1/t/${slug}/storefront/profile`, 'PATCH');
  const [saved, setSaved] = useState(false);
  const f = (k: keyof Profile, label: string, area = false, ltr = false) => (
    <div className="field" key={k}>
      <label htmlFor={`pr-${k}`}>{label}</label>
      {area ? (
        <textarea id={`pr-${k}`} className="input" dir={ltr ? 'ltr' : undefined} value={(p[k] as string) ?? ''} onChange={(e) => { setSaved(false); setP({ ...p, [k]: e.target.value }); }} />
      ) : (
        <input id={`pr-${k}`} className={`input ${ltr ? 'input-ltr' : ''}`} value={(p[k] as string) ?? ''} aria-invalid={s.fieldErrors[k] ? true : undefined} onChange={(e) => { setSaved(false); setP({ ...p, [k]: e.target.value }); }} />
      )}
      {s.fieldErrors[k] && <span className="err">{s.fieldErrors[k]}</span>}
    </div>
  );
  return (
    <form onSubmit={async (e) => {
      e.preventDefault();
      const r = await s.submit(p);
      if (r) {
        setSaved(true);
        onSaved(r.profile);
      }
    }}>
      <h3 style={{ marginTop: 0 }}>{t('builder.profile')}</h3>
      <p className="small muted">{t('builder.profile_hint')}</p>
      <ErrorAlert error={s.error} />
      {f('tagline', t('onb.tagline'))}
      {f('taglineEn', `${t('onb.tagline')} (EN)`, false, true)}
      {f('intro', t('onb.intro'), true)}
      {f('introEn', `${t('onb.intro')} (EN)`, true, true)}
      {f('contactPhone', t('onb.phone'), false, true)}
      {f('whatsapp', t('onb.whatsapp'), false, true)}
      {f('contactEmail', t('onb.email'), false, true)}
      {f('address', t('onb.address'))}
      <fieldset>
        <legend>{t('onb.socials')}</legend>
        {['instagram', 'tiktok', 'snapchat', 'x'].map((k) => (
          <div className="field" key={k}>
            <label htmlFor={`so-${k}`}>{t(`builder.social.${k}`)}</label>
            <input id={`so-${k}`} className="input input-ltr" placeholder="@handle" value={p.socials?.[k] ?? ''} aria-invalid={s.fieldErrors[`socials.${k}`] ? true : undefined}
              onChange={(e) => { setSaved(false); setP({ ...p, socials: { ...p.socials, [k]: e.target.value } }); }} />
            {s.fieldErrors[`socials.${k}`] && <span className="err">{s.fieldErrors[`socials.${k}`]}</span>}
          </div>
        ))}
      </fieldset>
      <div className="form-actions">
        {saved && <span className="small" role="status" style={{ color: 'var(--green)' }}>{t('common.saved')}</span>}
        <button type="submit" className="btn btn-gold btn-sm" disabled={s.busy}>{s.busy ? t('common.saving') : t('common.save')}</button>
      </div>
    </form>
  );
}
