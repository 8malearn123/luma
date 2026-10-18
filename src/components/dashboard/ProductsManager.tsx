'use client';

import { useState } from 'react';
import { formatMoney } from '@/lib/format';
import { useLocale, useT } from '../I18n';
import { Drawer, EmptyState, ErrorAlert, Field, useSubmit, useUnsavedGuard } from '../ui/forms';
import { useToast } from '../ui/Toast';
import { Icon } from '../Icon';
import { DataState, MoneyInput, PageHead, statusBadge, useApi } from './hooks';

interface Row { id: string; name: string; sku: string | null; priceMinor: number; costMinor?: number | null; status: string; isVisible: boolean; available: number; categoryName: string | null; version: number }
interface Variant { id?: string; name: string; sku?: string | null; priceMinor?: number | null; costMinor?: number | null }
interface Form {
  name: string; nameEn: string; description: string; categoryId: string | null; sku: string; barcode: string; priceMinor: number | null; costMinor: number | null;
  isVisible: boolean; hideWhenOutOfStock: boolean; maxPerOrder: number; returnable: boolean; imageAssetIds: string[]; variants: Variant[]; version?: number;
}

const empty: Form = { name: '', nameEn: '', description: '', categoryId: null, sku: '', barcode: '', priceMinor: null, costMinor: null, isVisible: true, hideWhenOutOfStock: false, maxPerOrder: 10, returnable: false, imageAssetIds: [], variants: [] };

async function uploadImage(tenant: string, file: File, alt: string): Promise<string> {
  const fd = new FormData();
  fd.set('file', file);
  fd.set('purpose', 'product');
  fd.set('altAr', alt);
  const res = await fetch(`/api/v1/t/${tenant}/assets`, { method: 'POST', body: fd, headers: { 'x-luma-request': '1' } });
  const j = await res.json();
  if (!res.ok) throw new Error(j?.error?.message ?? 'errors.internal');
  return j.id as string;
}

export function ProductsManager({ tenant, categories, canSeeCost }: { tenant: string; categories: { id: string; name: string }[]; canSeeCost: boolean }) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const list = useApi<{ items: Row[]; hasMore: boolean }>(`/api/v1/t/${tenant}/products?${new URLSearchParams({ ...(q ? { q } : {}), ...(status ? { status } : {}) })}`);
  const [editing, setEditing] = useState<{ id: string | null; form: Form } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
  useUnsavedGuard(dirty);
  const create = useSubmit<unknown, { id: string }>(`/api/v1/t/${tenant}/products`);
  const update = useSubmit<unknown, { version: number }>(() => `/api/v1/t/${tenant}/products/${editing?.id}`, 'PUT');
  const setSt = useSubmit<unknown, unknown>(() => `/api/v1/t/${tenant}/products/${editing?.id}`, 'PATCH');
  const set = (p: Partial<Form>) => {
    setDirty(true);
    setEditing((e) => (e ? { ...e, form: { ...e.form, ...p } } : e));
  };

  async function open(id: string | null) {
    if (!id) return setEditing({ id: null, form: { ...empty } });
    const r = await fetch(`/api/v1/t/${tenant}/products/${id}`).then((x) => x.json());
    const p = r.product;
    setEditing({
      id,
      form: {
        name: p.name, nameEn: p.nameEn ?? '', description: p.description ?? '', categoryId: p.categoryId, sku: p.sku ?? '', barcode: p.barcode ?? '', priceMinor: p.priceMinor,
        costMinor: p.costMinor ?? null, isVisible: p.isVisible, hideWhenOutOfStock: p.hideWhenOutOfStock, maxPerOrder: p.maxPerOrder, returnable: p.returnable,
        imageAssetIds: r.images.map((i: { assetId: string }) => i.assetId), variants: r.variants, version: p.version,
      },
    });
  }

  async function save() {
    if (!editing) return;
    const f = editing.form;
    const body = { ...f, nameEn: f.nameEn || null, description: f.description || null, sku: f.sku || null, barcode: f.barcode || null, priceMinor: f.priceMinor ?? 0, costMinor: canSeeCost ? f.costMinor : null, expectedVersion: f.version };
    const r = editing.id ? await update.submit(body) : await create.submit(body);
    if (r) {
      setDirty(false);
      setEditing(null);
      toast(t('common.saved'), 'ok');
      void list.reload();
    }
  }

  const err = create.error ?? update.error ?? setSt.error;
  return (
    <>
      <PageHead title={t('nav.products')} actions={<button type="button" className="btn btn-gold" onClick={() => open(null)}><Icon name="plus" size={16} /> {t('pr.new')}</button>} />
      <div className="toolbar">
        <input className="input" type="search" placeholder={t('common.search')} aria-label={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" style={{ maxWidth: 160 }} aria-label={t('common.status')} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t('common.all')}</option>
          <option value="active">{t('common.active')}</option>
          <option value="inactive">{t('common.inactive')}</option>
          <option value="archived">{t('common.archived')}</option>
        </select>
      </div>
      <DataState loading={list.loading && !list.data} error={list.error} onRetry={list.reload}>
        {!list.data?.items.length ? (
          <div className="card"><EmptyState icon="boxes" title={t('common.empty')} /></div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('common.name')}</th><th>{t('pr.sku')}</th><th>{t('common.price')}</th>{canSeeCost && <th>{t('pr.cost')}</th>}<th>{t('pr.available')}</th><th>{t('common.status')}</th></tr></thead>
              <tbody>
                {list.data.items.map((p) => (
                  <tr key={p.id} className="clickable" tabIndex={0} onClick={() => open(p.id)} onKeyDown={(e) => e.key === 'Enter' && open(p.id)}>
                    <td>{p.name}{!p.isVisible && <span className="badge" style={{ marginInlineStart: 6 }}>{t('common.hidden')}</span>}</td>
                    <td className="mono small">{p.sku ?? '—'}</td>
                    <td>{formatMoney(p.priceMinor, 'SAR', locale)}</td>
                    {canSeeCost && <td>{p.costMinor == null ? <span className="muted">{t('common.unknown')}</span> : formatMoney(p.costMinor, 'SAR', locale)}</td>}
                    <td className={p.available <= 0 ? 'muted' : ''}>{p.available}</td>
                    <td><span className={`badge ${statusBadge(p.status)}`}>{t(`common.${p.status}`)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DataState>
      {editing && (
        <Drawer title={editing.id ? editing.form.name : t('pr.new')} onClose={() => { if (!dirty || window.confirm(t('common.unsaved_changes'))) { setEditing(null); setDirty(false); } }}
          footer={
            <div className="row" style={{ width: '100%', justifyContent: 'space-between' }}>
              {editing.id ? (
                <select className="input" style={{ maxWidth: 160 }} aria-label={t('common.status')} onChange={async (e) => { if (e.target.value && (await setSt.submit({ status: e.target.value }))) { toast(t('common.saved'), 'ok'); void list.reload(); setEditing(null); } }} defaultValue="">
                  <option value="" disabled>{t('common.status')}…</option>
                  <option value="active">{t('common.active')}</option>
                  <option value="inactive">{t('common.inactive')}</option>
                  <option value="archived">{t('common.archive')}</option>
                </select>
              ) : <span />}
              <button type="button" className="btn btn-gold" disabled={create.busy || update.busy || !editing.form.name.trim() || editing.form.priceMinor == null} onClick={save}>{t('common.save')}</button>
            </div>
          }>
          <form onSubmit={(e) => { e.preventDefault(); void save(); }}>
            <ErrorAlert error={err} />
            <Field label={t('common.name')} required error={create.fieldErrors.name}>{(p) => <input {...p} className="input" value={editing.form.name} onChange={(e) => set({ name: e.target.value })} />}</Field>
            <Field label={t('common.name_en')}>{(p) => <input {...p} className="input" lang="en" dir="ltr" value={editing.form.nameEn} onChange={(e) => set({ nameEn: e.target.value })} />}</Field>
            <Field label={t('common.description')}>{(p) => <textarea {...p} className="input" value={editing.form.description} onChange={(e) => set({ description: e.target.value })} />}</Field>
            <div className="grid cols-2">
              <Field label={t('common.price')} required>{(p) => <MoneyInput {...p} value={editing.form.priceMinor} onChange={(v) => set({ priceMinor: v })} />}</Field>
              {canSeeCost && <Field label={t('pr.cost')}>{(p) => <MoneyInput {...p} value={editing.form.costMinor} onChange={(v) => set({ costMinor: v })} />}</Field>}
              <Field label={t('pr.sku')}>{(p) => <input {...p} className="input input-ltr" value={editing.form.sku} onChange={(e) => set({ sku: e.target.value })} />}</Field>
              <Field label={t('pr.barcode')}>{(p) => <input {...p} className="input input-ltr" value={editing.form.barcode} onChange={(e) => set({ barcode: e.target.value })} />}</Field>
              <Field label={t('pr.max_per_order')} required>{(p) => <input {...p} type="number" min={1} max={100} className="input" value={editing.form.maxPerOrder} onChange={(e) => set({ maxPerOrder: Number(e.target.value) || 1 })} />}</Field>
              {categories.length > 0 && (
                <Field label={t('fi.category')}>{(p) => <select {...p} className="input" value={editing.form.categoryId ?? ''} onChange={(e) => set({ categoryId: e.target.value || null })}><option value="">—</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}</Field>
              )}
            </div>
            <div className="stack" style={{ gap: 6, marginBottom: 12 }}>
              <label className="check"><input type="checkbox" checked={editing.form.isVisible} onChange={(e) => set({ isVisible: e.target.checked })} /> {t('common.visible')}</label>
              <label className="check"><input type="checkbox" checked={editing.form.hideWhenOutOfStock} onChange={(e) => set({ hideWhenOutOfStock: e.target.checked })} /> {t('pr.hide_oos')}</label>
              <label className="check"><input type="checkbox" checked={editing.form.returnable} onChange={(e) => set({ returnable: e.target.checked })} /> {t('pr.returnable')}</label>
            </div>
            <fieldset>
              <legend>{t('pr.images')}</legend>
              <div className="row">{editing.form.imageAssetIds.map((a) => (
                <span key={a} className="badge">{a.slice(0, 8)} <button type="button" className="btn btn-quiet btn-sm" aria-label={t('common.delete')} onClick={() => set({ imageAssetIds: editing.form.imageAssetIds.filter((x) => x !== a) })}><Icon name="x" size={12} /></button></span>
              ))}</div>
              <label className="btn btn-sm" style={{ marginTop: 8 }}>
                <Icon name="upload" size={14} /> {t('pr.upload_image')}
                <input type="file" accept="image/*" className="sr-only" onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setUploadErr(null);
                  try { const id = await uploadImage(tenant, f, editing.form.name); set({ imageAssetIds: [...editing.form.imageAssetIds, id] }); } catch (x) { setUploadErr(t((x as Error).message)); }
                }} />
              </label>
              {uploadErr && <div className="err small" role="alert">{uploadErr}</div>}
            </fieldset>
            <fieldset>
              <legend>{t('pr.variants')}</legend>
              {editing.form.variants.map((v, i) => (
                <div key={v.id ?? i} className="grid cols-3" style={{ gap: 6, marginBottom: 6 }}>
                  <input className="input" aria-label={t('common.name')} value={v.name} onChange={(e) => { const n = [...editing.form.variants]; n[i] = { ...v, name: e.target.value }; set({ variants: n }); }} />
                  <MoneyInput value={v.priceMinor ?? null} onChange={(val) => { const n = [...editing.form.variants]; n[i] = { ...v, priceMinor: val }; set({ variants: n }); }} />
                  <button type="button" className="btn btn-quiet btn-sm" onClick={() => set({ variants: editing.form.variants.filter((_, j) => j !== i) })}>{t('common.delete')}</button>
                </div>
              ))}
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => set({ variants: [...editing.form.variants, { name: '' }] })}><Icon name="plus" size={14} /> {t('pr.add_variant')}</button>
            </fieldset>
          </form>
        </Drawer>
      )}
    </>
  );
}
