'use client';

import { useState } from 'react';
import { useT } from '../I18n';
import { Icon } from '../Icon';
import { EmptyState, ErrorAlert, useSubmit } from '../ui/forms';
import { apiFetch, type ApiError } from '@/lib/client/api';
import { tapi, useLoad } from './client';

interface Data {
  types: { id: string; name: string; count: number }[];
  resources: { id: string; name: string; status: string; branchId: string; resourceTypeId: string; branchName: string }[];
}

/** Rooms, chairs and devices that services may require (allocated atomically with bookings). */
export function ResourcesPanel({ slug, branches }: { slug: string; branches: { id: string; name: string }[] }) {
  const t = useT();
  const data = useLoad<Data>(tapi(slug, '/resources'));
  const [typeName, setTypeName] = useState('');
  const [res, setRes] = useState({ name: '', branchId: branches[0]?.id ?? '', resourceTypeId: '' });
  const [err, setErr] = useState<ApiError | null>(null);
  const mkType = useSubmit<unknown, { id: string }>(tapi(slug, '/resources/types'));
  const mkRes = useSubmit<unknown, { id: string }>(tapi(slug, '/resources'));
  const archive = async (id: string, status: 'active' | 'archived') => {
    try {
      await apiFetch(tapi(slug, `/resources/${id}`), { method: 'PATCH', body: { status } });
      await data.reload();
    } catch (e) {
      setErr(e as ApiError);
    }
  };
  const types = data.data?.types ?? [];
  return (
    <section className="grid cols-2" aria-label={t('ops.resources')}>
      <div className="card">
        <h3>{t('ops.resource_types')}</h3>
        <form className="row" onSubmit={async (e) => { e.preventDefault(); if (await mkType.submit({ name: typeName })) { setTypeName(''); await data.reload(); } }}>
          <label className="sr-only" htmlFor="rt-name">{t('common.name')}</label>
          <input id="rt-name" className="input" placeholder={t('ops.resource_type_ph')} value={typeName} onChange={(e) => setTypeName(e.target.value)} />
          <button type="submit" className="btn btn-gold btn-sm" disabled={!typeName.trim() || mkType.busy}><Icon name="plus" size={14} /> {t('common.add')}</button>
        </form>
        <ErrorAlert error={mkType.error} />
        <ul style={{ paddingInlineStart: 18 }}>{types.map((ty) => <li key={ty.id}>{ty.name} <span className="muted small">({ty.count})</span></li>)}</ul>
      </div>
      <div className="card">
        <h3>{t('ops.resources')}</h3>
        {types.length === 0 ? <p className="muted small">{t('ops.resource_type_first')}</p> : (
          <form className="stack" onSubmit={async (e) => { e.preventDefault(); if (await mkRes.submit(res)) { setRes({ ...res, name: '' }); await data.reload(); } }}>
            <input className="input" aria-label={t('common.name')} placeholder={t('common.name')} value={res.name} onChange={(e) => setRes({ ...res, name: e.target.value })} />
            <div className="row">
              <select className="input" aria-label={t('ops.resource_types')} value={res.resourceTypeId} onChange={(e) => setRes({ ...res, resourceTypeId: e.target.value })}>
                <option value="">{t('common.select')}</option>
                {types.map((ty) => <option key={ty.id} value={ty.id}>{ty.name}</option>)}
              </select>
              <select className="input" aria-label={t('ops.branch')} value={res.branchId} onChange={(e) => setRes({ ...res, branchId: e.target.value })}>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <button type="submit" className="btn btn-gold btn-sm" disabled={!res.name.trim() || !res.resourceTypeId || mkRes.busy}><Icon name="plus" size={14} /> {t('common.add')}</button>
          </form>
        )}
        <ErrorAlert error={mkRes.error ?? err ?? data.error} />
        {data.data && !data.data.resources.length ? <EmptyState icon="chair" title={t('ops.no_resources')} /> : (
          <ul className="stack" style={{ listStyle: 'none', padding: 0, marginTop: 12 }}>
            {(data.data?.resources ?? []).map((r) => (
              <li key={r.id} className="row between">
                <span>{r.name} <span className="muted small">· {types.find((x) => x.id === r.resourceTypeId)?.name} · {r.branchName}</span></span>
                <button type="button" className="btn btn-sm" onClick={() => archive(r.id, r.status === 'active' ? 'archived' : 'active')}>{r.status === 'active' ? t('common.archive') : t('common.restore')}</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
