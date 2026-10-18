'use client';

import { useId, useRef, useState } from 'react';
import { ACTION_TYPES, BLOCK_META, isSafeUrl, type BlockAction, type I18nText, type PageBlock, type StorefrontDocument } from '@/lib/builder/schema';
import { useT } from '../I18n';
import { Icon } from '../Icon';
import { FIELDS, type FieldDef } from './fieldDefs';
import { uploadImage, useBuilder, type Opt } from './context';
import { htmlToMarkup, markupToHtml } from './richtext';
import { sectionTargets } from './ops';

type Props = Record<string, unknown>;

function I18nInput({ value, onChange, area, label }: { value: I18nText | undefined; onChange: (v: I18nText) => void; area?: boolean; label: string }) {
  const id = useId();
  const v = value ?? { ar: '' };
  const El = area ? 'textarea' : 'input';
  return (
    <fieldset>
      <legend>{label}</legend>
      <div className="field">
        <label htmlFor={`${id}-ar`}>العربية</label>
        <El id={`${id}-ar`} className="input" dir="rtl" value={v.ar ?? ''} onChange={(e) => onChange({ ...v, ar: e.target.value })} />
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label htmlFor={`${id}-en`}>English</label>
        <El id={`${id}-en`} className="input" dir="ltr" value={v.en ?? ''} onChange={(e) => onChange({ ...v, en: e.target.value || undefined })} />
      </div>
    </fieldset>
  );
}

function RichText({ value, onChange, label }: { value: { ar?: string; en?: string } | undefined; onChange: (v: { ar: string; en?: string }) => void; label: string }) {
  const t = useT();
  const id = useId();
  // keep the owner's markup locally so typing isn't re-normalized on every keystroke
  const [ar, setAr] = useState(() => htmlToMarkup(value?.ar ?? ''));
  const [en, setEn] = useState(() => htmlToMarkup(value?.en ?? ''));
  const emit = (a: string, e: string) => onChange({ ar: markupToHtml(a), ...(e.trim() ? { en: markupToHtml(e) } : {}) });
  return (
    <fieldset>
      <legend>{label}</legend>
      <p className="small muted" id={`${id}-h`}>{t('builder.richtext_hint')}</p>
      <div className="field">
        <label htmlFor={`${id}-ar`}>العربية</label>
        <textarea id={`${id}-ar`} aria-describedby={`${id}-h`} className="input" dir="rtl" rows={6} value={ar} onChange={(e) => { setAr(e.target.value); emit(e.target.value, en); }} />
      </div>
      <div className="field" style={{ marginBottom: 0 }}>
        <label htmlFor={`${id}-en`}>English</label>
        <textarea id={`${id}-en`} aria-describedby={`${id}-h`} className="input" dir="ltr" rows={4} value={en} onChange={(e) => { setEn(e.target.value); emit(ar, e.target.value); }} />
      </div>
    </fieldset>
  );
}

function SelectOpt({ label, value, options, onChange, allowNone = true }: { label: string; value: string | null | undefined; options: Opt[]; onChange: (v: string | null) => void; allowNone?: boolean }) {
  const t = useT();
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
        {allowNone && <option value="">{t('builder.none_selected')}</option>}
        {value && !options.some((o) => o.id === value) && <option value={value}>{t('builder.missing_target')}</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
            {o.status !== 'active' ? ` (${t(`builder.state.${o.status}`)})` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}

function MultiOpt({ label, value, options, onChange }: { label: string; value: string[]; options: Opt[]; onChange: (v: string[]) => void }) {
  const t = useT();
  const sel = new Set(value);
  return (
    <fieldset>
      <legend>{label}</legend>
      <p className="small muted">{t('builder.multi_hint')}</p>
      <div className="stack" style={{ gap: 6, maxHeight: 220, overflowY: 'auto' }}>
        {options.length === 0 && <span className="small muted">{t('common.empty')}</span>}
        {options.map((o) => (
          <label key={o.id} className="check">
            <input type="checkbox" checked={sel.has(o.id)} onChange={(e) => onChange(e.target.checked ? [...value, o.id] : value.filter((x) => x !== o.id))} />
            <span>{o.name}{o.status !== 'active' ? ` (${t(`builder.state.${o.status}`)})` : ''}</span>
          </label>
        ))}
      </div>
      {value.length > 1 && (
        <ol className="small" style={{ paddingInlineStart: 18, marginTop: 8 }}>
          {value.map((id, i) => (
            <li key={id} className="row" style={{ gap: 4 }}>
              <span style={{ flex: 1 }}>{options.find((o) => o.id === id)?.name ?? t('builder.missing_target')}</span>
              <button type="button" className="btn icon-btn" aria-label={t('builder.move_up')} disabled={i === 0} onClick={() => { const n = [...value]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; onChange(n); }}><Icon name="arrowUp" size={14} /></button>
              <button type="button" className="btn icon-btn" aria-label={t('builder.move_down')} disabled={i === value.length - 1} onClick={() => { const n = [...value]; [n[i + 1], n[i]] = [n[i], n[i + 1]]; onChange(n); }}><Icon name="arrowDown" size={14} /></button>
            </li>
          ))}
        </ol>
      )}
    </fieldset>
  );
}

export function ImageField({ label, value, onChange, purpose = 'gallery' }: { label: string; value: string | null | undefined; onChange: (id: string | null) => void; purpose?: string }) {
  const t = useT();
  const env = useBuilder();
  const input = useRef<HTMLInputElement>(null);
  const [alt, setAlt] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const id = useId();
  const cur = value ? env.assets[value] : undefined;
  return (
    <fieldset>
      <legend>{label}</legend>
      {cur ? <img src={cur.w640} alt={cur.alt ?? ''} style={{ width: '100%', borderRadius: 8, marginBottom: 8, aspectRatio: '16/9', objectFit: 'cover' }} /> : value ? <p className="small muted">{t('builder.image_pending')}</p> : null}
      <div className="field">
        <label htmlFor={`${id}-alt`}>{t('builder.f.alt_new')}</label>
        <input id={`${id}-alt`} className="input" value={alt} onChange={(e) => setAlt(e.target.value)} />
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/heic" className="sr-only" id={`${id}-file`} onChange={async (e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        if (f.size > 8 * 1024 * 1024) { setErr(t('errors.upload_too_large')); return; }
        setBusy(true);
        setErr(null);
        try {
          const r = await uploadImage(env.slug, f, purpose, alt);
          env.addAsset(r.id, r.url, alt);
          onChange(r.id);
          setAlt('');
        } catch (ex) {
          setErr(t((ex as Error).message));
        } finally {
          setBusy(false);
        }
      }} />
      <div className="row">
        <button type="button" className="btn btn-sm" disabled={busy} onClick={() => input.current?.click()}>
          <Icon name="upload" size={16} /> {busy ? t('common.loading') : t('builder.upload')}
        </button>
        {value && <button type="button" className="btn btn-quiet btn-sm" onClick={() => onChange(null)}>{t('builder.remove_image')}</button>}
      </div>
      {err && <p className="small" role="alert" style={{ color: 'var(--red)' }}>{err}</p>}
      <p className="small muted">{t('builder.upload_hint')}</p>
    </fieldset>
  );
}

function FieldEditor({ f, props, set }: { f: FieldDef; props: Props; set: (k: string, v: unknown) => void }) {
  const t = useT();
  const env = useBuilder();
  const o = env.options;
  const id = useId();
  const v = props[f.key];
  const L = t(f.label);
  switch (f.kind) {
    case 'i18n':
      return <I18nInput label={L} value={v as I18nText} onChange={(x) => set(f.key, x)} />;
    case 'i18nArea':
      return <I18nInput area label={L} value={v as I18nText} onChange={(x) => set(f.key, x)} />;
    case 'richtext':
      return <RichText label={L} value={v as { ar?: string; en?: string }} onChange={(x) => set(f.key, x)} />;
    case 'bool':
      return (
        <label className="check" style={{ marginBottom: 12 }}>
          <input type="checkbox" checked={v !== false && v !== undefined ? Boolean(v) : false} onChange={(e) => set(f.key, e.target.checked)} />
          <span>{L}</span>
        </label>
      );
    case 'number':
      return (
        <div className="field">
          <label htmlFor={id}>{L}</label>
          <input id={id} type="number" className="input" min={f.min} max={f.max} value={Number(v ?? f.min ?? 1)} onChange={(e) => set(f.key, Math.max(f.min ?? 0, Math.min(f.max ?? 999, Number(e.target.value) || (f.min ?? 1))))} />
        </div>
      );
    case 'range':
      return (
        <div className="field">
          <label htmlFor={id}>{L}: {Number(v ?? 0).toFixed(2)}</label>
          <input id={id} type="range" min={f.min} max={f.max} step={f.step} value={Number(v ?? 0)} onChange={(e) => set(f.key, Number(e.target.value))} />
        </div>
      );
    case 'select':
      return (
        <div className="field">
          <label htmlFor={id}>{L}</label>
          <select id={id} className="input" value={String(v ?? f.options?.[0]?.value ?? '')} onChange={(e) => set(f.key, typeof f.options?.[0]?.value === 'number' ? Number(e.target.value) : e.target.value)}>
            {f.options?.map((op) => <option key={String(op.value)} value={String(op.value)}>{op.label.startsWith('builder.') ? t(op.label) : op.label}</option>)}
          </select>
        </div>
      );
    case 'image':
      return <ImageField label={L} value={v as string | null} onChange={(x) => set(f.key, x)} />;
    case 'service':
      return <SelectOpt label={L} value={v as string} options={o.services} onChange={(x) => set(f.key, x)} allowNone={false} />;
    case 'services':
      return <MultiOpt label={L} value={(v as string[]) ?? []} options={o.services} onChange={(x) => set(f.key, x)} />;
    case 'product':
      return <SelectOpt label={L} value={v as string} options={o.products} onChange={(x) => set(f.key, x)} allowNone={false} />;
    case 'products':
      return <MultiOpt label={L} value={(v as string[]) ?? []} options={o.products} onChange={(x) => set(f.key, x)} />;
    case 'category':
      return <SelectOpt label={L} value={v as string | null} options={o.categories.filter((c) => !f.catKind || c.kind === f.catKind)} onChange={(x) => set(f.key, x)} />;
    case 'categories':
      return <MultiOpt label={L} value={(v as string[]) ?? []} options={o.categories.filter((c) => c.kind === ((props.kind as string) ?? 'service'))} onChange={(x) => set(f.key, x)} />;
    case 'staff':
      return <SelectOpt label={L} value={v as string} options={o.staff} onChange={(x) => set(f.key, x)} allowNone={false} />;
    case 'staffs':
      return <MultiOpt label={L} value={(v as string[]) ?? []} options={o.staff} onChange={(x) => set(f.key, x)} />;
    case 'packages':
      return <MultiOpt label={L} value={(v as string[]) ?? []} options={o.packages} onChange={(x) => set(f.key, x)} />;
    case 'branch':
      return <SelectOpt label={L} value={v as string | null} options={o.branches} onChange={(x) => set(f.key, x)} />;
    case 'galleryItems': {
      const items = (v as { assetId: string; alt: I18nText }[]) ?? [];
      return (
        <fieldset>
          <legend>{L}</legend>
          {items.map((it, i) => (
            <div key={`${it.assetId}-${i}`} className="row" style={{ marginBottom: 8, alignItems: 'flex-start' }}>
              {env.assets[it.assetId] ? <img src={env.assets[it.assetId].w640} alt="" width={56} height={56} style={{ objectFit: 'cover', borderRadius: 6 }} /> : <span className="badge">?</span>}
              <input aria-label={t('builder.f.alt')} className="input" style={{ flex: 1 }} value={it.alt?.ar ?? ''} onChange={(e) => set(f.key, items.map((x, j) => (j === i ? { ...x, alt: { ...x.alt, ar: e.target.value } } : x)))} />
              <button type="button" className="btn icon-btn" aria-label={t('builder.move_up')} disabled={i === 0} onClick={() => { const n = [...items]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; set(f.key, n); }}><Icon name="arrowUp" size={14} /></button>
              <button type="button" className="btn icon-btn" aria-label={t('common.delete')} onClick={() => set(f.key, items.filter((_, j) => j !== i))}><Icon name="trash" size={14} /></button>
            </div>
          ))}
          <ImageField label={t('builder.add_image')} value={null} onChange={(nid) => nid && set(f.key, [...items, { assetId: nid, alt: { ar: env.assets[nid]?.alt ?? '' } }])} />
        </fieldset>
      );
    }
    case 'faqItems': {
      const items = (v as { q: I18nText; a: I18nText }[]) ?? [];
      return (
        <fieldset>
          <legend>{L}</legend>
          {items.map((it, i) => (
            <div key={i} className="card" style={{ padding: 10, marginBottom: 8 }}>
              <I18nInput label={`${t('builder.f.question')} ${i + 1}`} value={it.q} onChange={(q) => set(f.key, items.map((x, j) => (j === i ? { ...x, q } : x)))} />
              <I18nInput area label={t('builder.f.answer')} value={it.a} onChange={(a) => set(f.key, items.map((x, j) => (j === i ? { ...x, a } : x)))} />
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => set(f.key, items.filter((_, j) => j !== i))}><Icon name="trash" size={14} /> {t('common.delete')}</button>
            </div>
          ))}
          <button type="button" className="btn btn-sm" disabled={items.length >= 30} onClick={() => set(f.key, [...items, { q: { ar: '' }, a: { ar: '' } }])}><Icon name="plus" size={14} /> {t('builder.add_question')}</button>
        </fieldset>
      );
    }
    default:
      return null;
  }
}

export function ActionPicker({ doc, pageId, value, onChange, required }: { doc: StorefrontDocument; pageId: string; value: BlockAction | undefined; onChange: (a: BlockAction | undefined) => void; required: boolean }) {
  const t = useT();
  const env = useBuilder();
  const id = useId();
  const [url, setUrl] = useState(value?.url ?? '');
  const page = doc.layout.pages.find((p) => p.id === pageId);
  const type = value?.type ?? '';
  const targets: Opt[] =
    type === 'service' || type === 'start_booking' ? env.options.services
    : type === 'product' ? env.options.products
    : type === 'category' ? env.options.categories
    : type === 'staff' ? env.options.staff
    : type === 'page' ? doc.layout.pages.map((p) => ({ id: p.id, name: p.title.ar || p.slug, status: 'active' }))
    : type === 'section' && page ? sectionTargets(page).map((b) => ({ id: b.id, name: `${t(`builder.block.${b.type}`)} · ${b.id.slice(-5)}`, status: 'active' }))
    : [];
  const urlOk = !url || isSafeUrl(url);
  return (
    <fieldset>
      <legend>{t('builder.link')}</legend>
      <div className="field">
        <label htmlFor={`${id}-t`}>{t('builder.link_type')}</label>
        <select id={`${id}-t`} className="input" value={type} onChange={(e) => {
          const nt = e.target.value as BlockAction['type'] | '';
          if (!nt) onChange(undefined);
          else onChange({ type: nt });
          setUrl('');
        }}>
          {!required && <option value="">{t('builder.no_link')}</option>}
          {ACTION_TYPES.map((a) => <option key={a} value={a}>{t(`builder.action.${a}`)}</option>)}
        </select>
      </div>
      {type && type !== 'external' && (type !== 'start_booking' || targets.length > 0) && (
        <SelectOpt label={type === 'start_booking' ? t('builder.preselect_service') : t('builder.link_target')} value={value?.targetId} options={targets} onChange={(x) => onChange({ type: type as BlockAction['type'], ...(x ? { targetId: x } : {}) })} allowNone={type === 'start_booking'} />
      )}
      {type === 'external' && (
        <div className="field">
          <label htmlFor={`${id}-u`}>{t('builder.url')}</label>
          <input id={`${id}-u`} className="input input-ltr" inputMode="url" placeholder="https://" value={url} aria-invalid={!urlOk || undefined} aria-describedby={`${id}-uh`}
            onChange={(e) => {
              setUrl(e.target.value);
              if (isSafeUrl(e.target.value)) onChange({ type: 'external', url: e.target.value });
            }} />
          <span id={`${id}-uh`} className={urlOk ? 'hint' : 'err'}>{urlOk ? t('builder.url_hint') : t('errors.url_unsafe')}</span>
        </div>
      )}
    </fieldset>
  );
}

export function BlockProperties({ doc, pageId, block, onChange }: { doc: StorefrontDocument; pageId: string; block: PageBlock; onChange: (fn: (b: PageBlock) => void, coalesce?: string) => void }) {
  const t = useT();
  const meta = BLOCK_META[block.type];
  const props = block.props as Props;
  return (
    <div>
      <h3 style={{ marginTop: 0 }}>{t(`builder.block.${block.type}`)}</h3>
      <label className="check" style={{ marginBottom: 12 }}>
        <input type="checkbox" checked={block.visibility.enabled} onChange={(e) => onChange((b) => { b.visibility = { enabled: e.target.checked }; })} />
        <span>{t('builder.visible')}</span>
      </label>
      {FIELDS[block.type].map((f) => (
        <FieldEditor key={f.key} f={f} props={props} set={(k, v) => onChange((b) => { b.props = { ...b.props, [k]: v }; }, `${block.id}:${k}`)} />
      ))}
      {meta.action !== 'none' && (
        <ActionPicker doc={doc} pageId={pageId} value={block.action} required={meta.action === 'required'} onChange={(a) => onChange((b) => { if (a) b.action = a; else delete b.action; })} />
      )}
      {block.type === 'intro' && <p className="small muted">{t('builder.intro_from_profile')}</p>}
    </div>
  );
}
