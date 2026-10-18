'use client';

import { useState } from 'react';
import { useLocale, useT } from '../I18n';
import { Icon } from '../Icon';
import { Drawer, EmptyState, ErrorAlert, Field, useSubmit } from '../ui/forms';
import { apiFetch, type ApiError } from '@/lib/client/api';
import { formatMoney, parseMoneyToMinor } from '@/lib/format';
import { minorToInput, tapi, useLoad } from './client';

interface Pkg { id: string; name: string; nameEn: string | null; description: string | null; priceMinor: number; status: string; items: { serviceId: string; quantity: number; name: string }[] }

/** Packages are defined sets of real services sold at an owner-set price. */
export function PackagesPanel({ slug }: { slug: string }) {
  const t = useT();
  const locale = useLocale();
  const list = useLoad<{ items: Pkg[] }>(tapi(slug, '/packages'));
  const services = useLoad<{ items: { id: string; name: string; priceMinor: number }[] }>(tapi(slug, '/services?status=active&limit=100'));
  const [edit, setEdit] = useState<null | { id?: string; name: string; description: string; price: string; items: { serviceId: string; quantity: number }[] }>(null);
  const [err, setErr] = useState<ApiError | null>(null);
  const save = useSubmit<unknown, { id: string }>(() => (edit?.id ? tapi(slug, `/packages/${edit.id}`) : tapi(slug, '/packages')), edit?.id ? 'PUT' : 'POST');
  const sum = (edit?.items ?? []).reduce((n, i) => n + (services.data?.items.find((s) => s.id === i.serviceId)?.priceMinor ?? 0) * i.quantity, 0);

  const setStatus = async (id: string, status: string) => {
    try {
      await apiFetch(tapi(slug, `/packages/${id}/status`), { method: 'POST', body: { status } });
      await list.reload();
    } catch (e) {
      setErr(e as ApiError);
    }
  };

  return (
    <section className="stack" aria-label={t('ops.packages')}>
      <div className="toolbar">
        <button type="button" className="btn btn-gold" onClick={() => setEdit({ name: '', description: '', price: '', items: [] })}><Icon name="plus" size={16} /> {t('ops.new_package')}</button>
      </div>
      <ErrorAlert error={err ?? list.error} />
      {list.loading && !list.data ? <div className="skeleton" style={{ height: 80 }} /> : !list.data?.items.length ? <EmptyState icon="gift" title={t('ops.no_packages')} /> : (
        <div className="grid cols-3">
          {list.data.items.map((p) => (
            <div key={p.id} className="card">
              <div className="row between"><strong>{p.name}</strong><span className={`badge ${p.status === 'active' ? 'green' : ''}`}>{t(`common.${p.status}`)}</span></div>
              <div className="muted small">{p.items.map((i) => `${i.name} × ${i.quantity}`).join('، ')}</div>
              <div style={{ margin: '8px 0', fontWeight: 600 }}>{formatMoney(p.priceMinor, 'SAR', locale)}</div>
              <div className="row">
                <button type="button" className="btn btn-sm" onClick={() => setEdit({ id: p.id, name: p.name, description: p.description ?? '', price: minorToInput(p.priceMinor), items: p.items.map((i) => ({ serviceId: i.serviceId, quantity: i.quantity })) })}>{t('common.edit')}</button>
                <button type="button" className="btn btn-sm" onClick={() => setStatus(p.id, p.status === 'active' ? 'hidden' : 'active')}>{p.status === 'active' ? t('ops.hide') : t('ops.show')}</button>
                <button type="button" className="btn btn-sm btn-danger" onClick={() => window.confirm(t('ops.archive_confirm')) && setStatus(p.id, 'archived')}>{t('common.archive')}</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {edit && (
        <Drawer
          title={edit.id ? edit.name : t('ops.new_package')}
          onClose={() => setEdit(null)}
          footer={
            <div className="row" style={{ marginInlineStart: 'auto' }}>
              <button type="button" className="btn btn-quiet" onClick={() => setEdit(null)}>{t('common.cancel')}</button>
              <button type="button" className="btn btn-gold" disabled={save.busy} onClick={async () => {
                const r = await save.submit({ name: edit.name, description: edit.description || null, priceMinor: parseMoneyToMinor(edit.price) ?? -1, items: edit.items });
                if (r) { setEdit(null); await list.reload(); }
              }}>{t('common.save')}</button>
            </div>
          }
        >
          <ErrorAlert error={save.error} />
          <Field label={t('common.name')} required>{(p) => <input {...p} className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />}</Field>
          <Field label={t('common.description')}>{(p) => <textarea {...p} className="input" value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />}</Field>
          <fieldset>
            <legend>{t('nav.services')}</legend>
            {edit.items.map((it, i) => (
              <div key={i} className="row" style={{ marginBottom: 6 }}>
                <select className="input" aria-label={t('nav.services')} value={it.serviceId} onChange={(e) => setEdit({ ...edit, items: edit.items.map((x, j) => (j === i ? { ...x, serviceId: e.target.value } : x)) })}>
                  <option value="">{t('common.select')}</option>
                  {(services.data?.items ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <input className="input input-ltr" style={{ maxWidth: 80 }} aria-label={t('ops.quantity')} inputMode="numeric" value={String(it.quantity)} onChange={(e) => setEdit({ ...edit, items: edit.items.map((x, j) => (j === i ? { ...x, quantity: Math.max(1, Number(e.target.value.replace(/\D/g, '') || 1)) } : x)) })} />
                <button type="button" className="btn icon-btn" aria-label={t('common.delete')} onClick={() => setEdit({ ...edit, items: edit.items.filter((_, j) => j !== i) })}><Icon name="trash" size={16} /></button>
              </div>
            ))}
            <button type="button" className="btn btn-sm" onClick={() => setEdit({ ...edit, items: [...edit.items, { serviceId: '', quantity: 1 }] })}><Icon name="plus" size={14} /> {t('common.add')}</button>
          </fieldset>
          <Field label={`${t('common.price')} (${t('common.sar')})`} required hint={t('ops.package_sum', { sum: formatMoney(sum, 'SAR', locale) })}>
            {(p) => <input {...p} className="input input-ltr" inputMode="decimal" value={edit.price} onChange={(e) => setEdit({ ...edit, price: e.target.value })} />}
          </Field>
        </Drawer>
      )}
    </section>
  );
}
