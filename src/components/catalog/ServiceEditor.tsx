'use client';

import { useEffect, useState } from 'react';
import { useLocale, useT } from '../I18n';
import { Icon } from '../Icon';
import { Drawer, ErrorAlert, Field, useSubmit, useUnsavedGuard } from '../ui/forms';
import { useToast } from '../ui/Toast';
import { apiFetch, type ApiError } from '@/lib/client/api';
import { formatMoney, parseMoneyToMinor } from '@/lib/format';
import { minorToInput, tapi } from './client';
import type { CatalogRefs } from './ServicesManager';

interface Variant { id?: string; name: string; nameEn?: string | null; price: string; durationMin: number }
interface Addon { id?: string; name: string; nameEn?: string | null; price: string; durationMin: number }
interface Rule { variantKey: string; staffId: string; price: string; durationMin: string }

interface Form {
  name: string; nameEn: string; description: string; descriptionEn: string; categoryId: string; branchId: string; price: string; priceIsFrom: boolean;
  durationMin: string; bufferBeforeMin: string; bufferAfterMin: string; isVisible: boolean; internalBookingWhenHidden: boolean; minNoticeMin: string;
  maxAdvanceDays: string; groupCapacity: string; materialCost: string; staffIds: string[]; resourceTypeIds: string[];
  variants: Variant[]; addons: Addon[]; rules: Rule[];
}

const empty = (): Form => ({
  name: '', nameEn: '', description: '', descriptionEn: '', categoryId: '', branchId: '', price: '', priceIsFrom: false, durationMin: '60',
  bufferBeforeMin: '0', bufferAfterMin: '0', isVisible: true, internalBookingWhenHidden: true, minNoticeMin: '', maxAdvanceDays: '', groupCapacity: '',
  materialCost: '', staffIds: [], resourceTypeIds: [], variants: [], addons: [], rules: [],
});

interface Loaded {
  service: {
    id: string; name: string; nameEn: string | null; description: string | null; descriptionEn: string | null; categoryId: string | null; branchId: string | null;
    priceMinor: number; priceIsFrom: boolean; durationMin: number; bufferBeforeMin: number; bufferAfterMin: number; isVisible: boolean; internalBookingWhenHidden: boolean;
    minNoticeMin: number | null; maxAdvanceDays: number | null; groupCapacity: number | null; materialCostMinor?: number | null; status: 'active' | 'inactive' | 'archived'; version: number;
    variants: { id: string; name: string; nameEn: string | null; priceMinor: number; durationMin: number }[];
    addons: { id: string; name: string; nameEn: string | null; priceMinor: number; durationMin: number }[];
    staffIds: string[]; resourceTypeIds: string[];
    priceRules: { variantId: string | null; staffId: string | null; priceMinor: number | null; durationMin: number | null }[];
    pendingPriceChanges: { id: string; currentPriceMinor: number; proposedPriceMinor: number; source: string; createdAt: string }[];
  };
}

const num = (s: string) => (s.trim() === '' ? null : Number(s));

export function ServiceEditor({ slug, id, refs, categories, canSeeCosts, canApprovePrices, onClose, onSaved }: {
  slug: string; id: string | null; refs: CatalogRefs; categories: { id: string; name: string }[]; canSeeCosts: boolean; canApprovePrices: boolean;
  onClose: () => void; onSaved: (id: string) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const [form, setForm] = useState<Form>(empty());
  const [orig, setOrig] = useState<string>(JSON.stringify(empty()));
  const [loaded, setLoaded] = useState<Loaded['service'] | null>(null);
  const [loadErr, setLoadErr] = useState<ApiError | null>(null);
  const [actErr, setActErr] = useState<ApiError | null>(null);
  const dirty = JSON.stringify(form) !== orig;
  useUnsavedGuard(dirty);

  const load = async () => {
    if (!id) return;
    try {
      const r = await apiFetch<Loaded>(tapi(slug, `/services/${id}`));
      const s = r.service;
      const vKey = (vid: string | null) => (vid ? `v:${vid}` : '');
      const f: Form = {
        name: s.name, nameEn: s.nameEn ?? '', description: s.description ?? '', descriptionEn: s.descriptionEn ?? '', categoryId: s.categoryId ?? '', branchId: s.branchId ?? '',
        price: minorToInput(s.priceMinor), priceIsFrom: s.priceIsFrom, durationMin: String(s.durationMin), bufferBeforeMin: String(s.bufferBeforeMin), bufferAfterMin: String(s.bufferAfterMin),
        isVisible: s.isVisible, internalBookingWhenHidden: s.internalBookingWhenHidden, minNoticeMin: s.minNoticeMin == null ? '' : String(s.minNoticeMin),
        maxAdvanceDays: s.maxAdvanceDays == null ? '' : String(s.maxAdvanceDays), groupCapacity: s.groupCapacity == null ? '' : String(s.groupCapacity),
        materialCost: minorToInput(s.materialCostMinor), staffIds: s.staffIds, resourceTypeIds: s.resourceTypeIds,
        variants: s.variants.map((v) => ({ id: v.id, name: v.name, nameEn: v.nameEn, price: minorToInput(v.priceMinor), durationMin: v.durationMin })),
        addons: s.addons.map((a) => ({ id: a.id, name: a.name, nameEn: a.nameEn, price: minorToInput(a.priceMinor), durationMin: a.durationMin })),
        rules: s.priceRules.map((r) => ({ variantKey: vKey(r.variantId), staffId: r.staffId ?? '', price: minorToInput(r.priceMinor), durationMin: r.durationMin == null ? '' : String(r.durationMin) })),
      };
      setForm(f);
      setOrig(JSON.stringify(f));
      setLoaded(s);
      setLoadErr(null);
    } catch (e) {
      setLoadErr(e as ApiError);
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const save = useSubmit<unknown, { id: string; version?: number; pricePendingApproval?: boolean }>(id ? tapi(slug, `/services/${id}`) : tapi(slug, '/services'), id ? 'PUT' : 'POST');

  const toBody = () => {
    const price = parseMoneyToMinor(form.price);
    const variants = form.variants.map((v) => ({ id: v.id, name: v.name, nameEn: v.nameEn || null, priceMinor: parseMoneyToMinor(v.price) ?? -1, durationMin: Number(v.durationMin) }));
    return {
      name: form.name, nameEn: form.nameEn || null, description: form.description || null, descriptionEn: form.descriptionEn || null,
      categoryId: form.categoryId || null, branchId: form.branchId || null, priceMinor: price ?? -1, priceIsFrom: form.priceIsFrom, durationMin: Number(form.durationMin),
      bufferBeforeMin: Number(form.bufferBeforeMin || 0), bufferAfterMin: Number(form.bufferAfterMin || 0), isVisible: form.isVisible, internalBookingWhenHidden: form.internalBookingWhenHidden,
      minNoticeMin: num(form.minNoticeMin), maxAdvanceDays: num(form.maxAdvanceDays), groupCapacity: num(form.groupCapacity),
      materialCostMinor: canSeeCosts ? (form.materialCost ? parseMoneyToMinor(form.materialCost) : null) : undefined,
      staffIds: form.staffIds, resourceTypeIds: form.resourceTypeIds, variants,
      addons: form.addons.map((a) => ({ id: a.id, name: a.name, nameEn: a.nameEn || null, priceMinor: parseMoneyToMinor(a.price) ?? -1, durationMin: Number(a.durationMin) })),
      priceRules: form.rules
        .filter((r) => r.staffId || r.variantKey)
        .map((r) => ({ staffId: r.staffId || null, variantId: r.variantKey.startsWith('v:') ? r.variantKey.slice(2) : null, priceMinor: r.price ? parseMoneyToMinor(r.price) : null, durationMin: num(r.durationMin) })),
      ...(id ? { expectedVersion: loaded?.version } : {}),
    };
  };

  const status = async (s: 'active' | 'inactive' | 'archived') => {
    if (!id) return;
    if (s === 'archived' && !window.confirm(t('ops.archive_service_confirm'))) return;
    try {
      await apiFetch(tapi(slug, `/services/${id}/status`), { method: 'POST', body: { status: s } });
      setActErr(null);
      await load();
      onSaved(id);
    } catch (e) {
      setActErr(e as ApiError);
    }
  };

  const decide = async (changeId: string, approve: boolean) => {
    try {
      await apiFetch(tapi(slug, `/services/price-changes/${changeId}`), { method: 'POST', body: { approve } });
      await load();
      toast(t(approve ? 'ops.price_approved' : 'ops.price_rejected'), 'ok');
    } catch (e) {
      setActErr(e as ApiError);
    }
  };

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const toggle = (k: 'staffIds' | 'resourceTypeIds', v: string) => set(k, form[k].includes(v) ? form[k].filter((x) => x !== v) : [...form[k], v]);
  const fe = save.fieldErrors;

  return (
    <Drawer
      title={id ? form.name || t('nav.services') : t('ops.new_service')}
      onClose={() => {
        if (!dirty || window.confirm(t('common.unsaved_changes'))) onClose();
      }}
      footer={
        <div className="row between" style={{ width: '100%' }}>
          <span className="small muted">{dirty ? t('ops.unsaved') : id ? t('common.saved') : ''}</span>
          <div className="row">
            <button type="button" className="btn btn-quiet" onClick={onClose}>{t('common.cancel')}</button>
            <button
              type="button"
              className="btn btn-gold"
              disabled={save.busy || !dirty}
              onClick={async () => {
                const r = await save.submit(toBody());
                if (r) {
                  toast(r.pricePendingApproval ? t('ops.price_pending') : t('common.saved'), 'ok');
                  if (id) await load();
                  onSaved(r.id ?? id!);
                }
              }}
            >
              {save.busy ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </div>
      }
    >
      {loadErr ? (
        <ErrorAlert error={loadErr} />
      ) : id && !loaded ? (
        <div className="stack" aria-busy="true">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 38 }} />)}</div>
      ) : (
        <div className="stack" style={{ gap: 4 }}>
          <ErrorAlert error={save.error ?? actErr} />
          {save.error?.code === 'version_conflict' && (
            <div className="alert warn">
              {t('errors.version_conflict')}{' '}
              <button type="button" className="btn btn-sm" onClick={() => load()}>{t('common.retry')}</button>
            </div>
          )}
          {loaded && (
            <div className="row" style={{ marginBottom: 8 }}>
              <span className={`badge ${loaded.status === 'active' ? 'green' : loaded.status === 'inactive' ? 'amber' : ''}`}>{t(`common.${loaded.status}`)}</span>
              {loaded.status !== 'active' && <button type="button" className="btn btn-sm" onClick={() => status('active')}>{t('ops.activate')}</button>}
              {loaded.status === 'active' && <button type="button" className="btn btn-sm" onClick={() => status('inactive')}>{t('ops.deactivate')}</button>}
              {loaded.status !== 'archived' && <button type="button" className="btn btn-sm btn-danger" onClick={() => status('archived')}>{t('common.archive')}</button>}
            </div>
          )}
          {loaded?.pendingPriceChanges?.map((pc) => (
            <div key={pc.id} className="alert warn">
              <div style={{ flex: 1 }}>
                {t('ops.price_proposal', { from: formatMoney(pc.currentPriceMinor, 'SAR', locale), to: formatMoney(pc.proposedPriceMinor, 'SAR', locale) })}
                <div className="small muted">{t('ops.price_snapshot_note')}</div>
              </div>
              {canApprovePrices && (
                <span className="row">
                  <button type="button" className="btn btn-sm btn-gold" onClick={() => decide(pc.id, true)}>{t('common.confirm')}</button>
                  <button type="button" className="btn btn-sm" onClick={() => decide(pc.id, false)}>{t('ops.reject')}</button>
                </span>
              )}
            </div>
          ))}

          <div className="grid cols-2" style={{ gap: 10 }}>
            <Field label={t('common.name')} required error={fe.name}>{(p) => <input {...p} className="input" value={form.name} maxLength={120} onChange={(e) => set('name', e.target.value)} />}</Field>
            <Field label={t('common.name_en')}>{(p) => <input {...p} className="input" dir="ltr" value={form.nameEn} maxLength={120} onChange={(e) => set('nameEn', e.target.value)} />}</Field>
          </div>
          <Field label={t('common.description')}>{(p) => <textarea {...p} className="input" maxLength={4000} value={form.description} onChange={(e) => set('description', e.target.value)} />}</Field>
          <Field label={`${t('common.description')} (EN)`}>{(p) => <textarea {...p} className="input" dir="ltr" maxLength={4000} value={form.descriptionEn} onChange={(e) => set('descriptionEn', e.target.value)} />}</Field>
          <div className="grid cols-2" style={{ gap: 10 }}>
            <Field label={t('ops.category')}>
              {(p) => (
                <select {...p} className="input" value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
                  <option value="">{t('common.none')}</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
            </Field>
            <Field label={t('ops.branch')} hint={t('ops.branch_all_hint')}>
              {(p) => (
                <select {...p} className="input" value={form.branchId} onChange={(e) => set('branchId', e.target.value)}>
                  <option value="">{t('ops.all_branches')}</option>
                  {refs.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              )}
            </Field>
          </div>

          <fieldset>
            <legend>{t('ops.price_duration')}</legend>
            <div className="grid cols-3" style={{ gap: 10 }}>
              <Field label={`${t('common.price')} (${t('common.sar')})`} required error={fe.priceMinor}>{(p) => <input {...p} className="input input-ltr" inputMode="decimal" value={form.price} onChange={(e) => set('price', e.target.value)} />}</Field>
              <Field label={`${t('common.duration')} (${t('common.minutes')})`} required error={fe.durationMin}>{(p) => <input {...p} className="input input-ltr" inputMode="numeric" value={form.durationMin} onChange={(e) => set('durationMin', e.target.value.replace(/\D/g, ''))} />}</Field>
              <div className="field" style={{ justifyContent: 'flex-end' }}>
                <label className="check"><input type="checkbox" checked={form.priceIsFrom} onChange={(e) => set('priceIsFrom', e.target.checked)} /> {t('ops.price_is_from')}</label>
              </div>
              <Field label={t('ops.buffer_before')} hint={t('common.minutes')}>{(p) => <input {...p} className="input input-ltr" inputMode="numeric" value={form.bufferBeforeMin} onChange={(e) => set('bufferBeforeMin', e.target.value.replace(/\D/g, ''))} />}</Field>
              <Field label={t('ops.buffer_after')} hint={t('common.minutes')}>{(p) => <input {...p} className="input input-ltr" inputMode="numeric" value={form.bufferAfterMin} onChange={(e) => set('bufferAfterMin', e.target.value.replace(/\D/g, ''))} />}</Field>
              {canSeeCosts && (
                <Field label={t('ops.material_cost')} hint={t('ops.material_cost_hint')}>{(p) => <input {...p} className="input input-ltr" inputMode="decimal" value={form.materialCost} onChange={(e) => set('materialCost', e.target.value)} />}</Field>
              )}
            </div>
            {id && <p className="small muted">{t('ops.price_snapshot_note')}</p>}
          </fieldset>

          <fieldset>
            <legend>{t('ops.variants')}</legend>
            {form.variants.map((v, i) => (
              <div key={v.id ?? `n${i}`} className="row" style={{ marginBottom: 6, flexWrap: 'nowrap' }}>
                <input className="input" aria-label={t('common.name')} placeholder={t('common.name')} value={v.name} onChange={(e) => set('variants', form.variants.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <input className="input input-ltr" style={{ maxWidth: 110 }} aria-label={t('common.price')} placeholder={t('common.price')} inputMode="decimal" value={v.price} onChange={(e) => set('variants', form.variants.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} />
                <input className="input input-ltr" style={{ maxWidth: 90 }} aria-label={t('common.duration')} inputMode="numeric" value={String(v.durationMin)} onChange={(e) => set('variants', form.variants.map((x, j) => (j === i ? { ...x, durationMin: Number(e.target.value.replace(/\D/g, '') || 0) } : x)))} />
                <button type="button" className="btn icon-btn" aria-label={t('common.delete')} onClick={() => set('variants', form.variants.filter((_, j) => j !== i))}><Icon name="trash" size={16} /></button>
              </div>
            ))}
            <button type="button" className="btn btn-sm" onClick={() => set('variants', [...form.variants, { name: '', price: form.price, durationMin: Number(form.durationMin) || 60 }])}><Icon name="plus" size={14} /> {t('ops.add_variant')}</button>
          </fieldset>

          <fieldset>
            <legend>{t('ops.addons')}</legend>
            {form.addons.map((a, i) => (
              <div key={a.id ?? `n${i}`} className="row" style={{ marginBottom: 6, flexWrap: 'nowrap' }}>
                <input className="input" aria-label={t('common.name')} placeholder={t('common.name')} value={a.name} onChange={(e) => set('addons', form.addons.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                <input className="input input-ltr" style={{ maxWidth: 110 }} aria-label={t('common.price')} inputMode="decimal" value={a.price} onChange={(e) => set('addons', form.addons.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} />
                <input className="input input-ltr" style={{ maxWidth: 90 }} aria-label={t('common.duration')} inputMode="numeric" value={String(a.durationMin)} onChange={(e) => set('addons', form.addons.map((x, j) => (j === i ? { ...x, durationMin: Number(e.target.value.replace(/\D/g, '') || 0) } : x)))} />
                <button type="button" className="btn icon-btn" aria-label={t('common.delete')} onClick={() => set('addons', form.addons.filter((_, j) => j !== i))}><Icon name="trash" size={16} /></button>
              </div>
            ))}
            <button type="button" className="btn btn-sm" onClick={() => set('addons', [...form.addons, { name: '', price: '0', durationMin: 0 }])}><Icon name="plus" size={14} /> {t('ops.add_addon')}</button>
          </fieldset>

          <fieldset>
            <legend>{t('ops.qualified_staff')}</legend>
            {refs.staff.length === 0 ? <p className="small muted">{t('ops.no_staff_yet')}</p> : (
              <div className="chips">
                {refs.staff.map((s) => (
                  <button key={s.id} type="button" className="chip" aria-pressed={form.staffIds.includes(s.id)} onClick={() => toggle('staffIds', s.id)}>{s.displayName}</button>
                ))}
              </div>
            )}
            {form.staffIds.length === 0 && <p className="small" style={{ color: 'var(--amber)' }}>{t('ops.no_staff_not_bookable')}</p>}
          </fieldset>

          <fieldset>
            <legend>{t('ops.price_rules')}</legend>
            <p className="small muted">{t('ops.price_rules_help')}</p>
            {form.rules.map((r, i) => (
              <div key={i} className="row" style={{ marginBottom: 6 }}>
                <select className="input" style={{ maxWidth: 160 }} aria-label={t('ops.specialist')} value={r.staffId} onChange={(e) => set('rules', form.rules.map((x, j) => (j === i ? { ...x, staffId: e.target.value } : x)))}>
                  <option value="">{t('ops.any_specialist')}</option>
                  {refs.staff.filter((s) => form.staffIds.includes(s.id)).map((s) => <option key={s.id} value={s.id}>{s.displayName}</option>)}
                </select>
                <select className="input" style={{ maxWidth: 160 }} aria-label={t('ops.variants')} value={r.variantKey} onChange={(e) => set('rules', form.rules.map((x, j) => (j === i ? { ...x, variantKey: e.target.value } : x)))}>
                  <option value="">{t('ops.base_service')}</option>
                  {form.variants.filter((v) => v.id).map((v) => <option key={v.id} value={`v:${v.id}`}>{v.name}</option>)}
                </select>
                <input className="input input-ltr" style={{ maxWidth: 100 }} aria-label={t('common.price')} placeholder={t('common.price')} inputMode="decimal" value={r.price} onChange={(e) => set('rules', form.rules.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))} />
                <input className="input input-ltr" style={{ maxWidth: 90 }} aria-label={t('common.duration')} placeholder={t('common.minutes')} inputMode="numeric" value={r.durationMin} onChange={(e) => set('rules', form.rules.map((x, j) => (j === i ? { ...x, durationMin: e.target.value.replace(/\D/g, '') } : x)))} />
                <button type="button" className="btn icon-btn" aria-label={t('common.delete')} onClick={() => set('rules', form.rules.filter((_, j) => j !== i))}><Icon name="trash" size={16} /></button>
              </div>
            ))}
            <button type="button" className="btn btn-sm" onClick={() => set('rules', [...form.rules, { variantKey: '', staffId: '', price: '', durationMin: '' }])}><Icon name="plus" size={14} /> {t('ops.add_rule')}</button>
            {form.variants.some((v) => !v.id) && <p className="small muted">{t('ops.save_variants_first')}</p>}
          </fieldset>

          {refs.resourceTypes.length > 0 && (
            <fieldset>
              <legend>{t('ops.required_resources')}</legend>
              <div className="chips">
                {refs.resourceTypes.map((r) => (
                  <button key={r.id} type="button" className="chip" aria-pressed={form.resourceTypeIds.includes(r.id)} onClick={() => toggle('resourceTypeIds', r.id)}>{r.name}</button>
                ))}
              </div>
            </fieldset>
          )}

          <fieldset>
            <legend>{t('ops.booking_rules')}</legend>
            <div className="grid cols-3" style={{ gap: 10 }}>
              <Field label={t('ops.min_notice')} hint={t('ops.policy_default_hint')}>{(p) => <input {...p} className="input input-ltr" inputMode="numeric" value={form.minNoticeMin} onChange={(e) => set('minNoticeMin', e.target.value.replace(/\D/g, ''))} />}</Field>
              <Field label={t('ops.max_advance')} hint={t('ops.policy_default_hint')}>{(p) => <input {...p} className="input input-ltr" inputMode="numeric" value={form.maxAdvanceDays} onChange={(e) => set('maxAdvanceDays', e.target.value.replace(/\D/g, ''))} />}</Field>
              <Field label={t('ops.group_capacity')} hint={t('ops.group_capacity_hint')}>{(p) => <input {...p} className="input input-ltr" inputMode="numeric" value={form.groupCapacity} onChange={(e) => set('groupCapacity', e.target.value.replace(/\D/g, ''))} />}</Field>
            </div>
            <label className="check"><input type="checkbox" checked={form.isVisible} onChange={(e) => set('isVisible', e.target.checked)} /> {t('ops.visible_public')}</label>
            {!form.isVisible && (
              <label className="check" style={{ marginTop: 6 }}><input type="checkbox" checked={form.internalBookingWhenHidden} onChange={(e) => set('internalBookingWhenHidden', e.target.checked)} /> {t('ops.internal_when_hidden')}</label>
            )}
            <p className="small muted" style={{ marginTop: 6 }}>{t('ops.visible_vs_active')}</p>
          </fieldset>
        </div>
      )}
    </Drawer>
  );
}
