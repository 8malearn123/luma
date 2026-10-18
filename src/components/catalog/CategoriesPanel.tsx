'use client';

import { useState } from 'react';
import { useT } from '../I18n';
import { Icon } from '../Icon';
import { EmptyState, ErrorAlert, useSubmit } from '../ui/forms';
import { apiFetch, type ApiError } from '@/lib/client/api';
import { tapi, useLoad } from './client';

interface Cat { id: string; name: string; nameEn: string | null; status: 'active' | 'hidden' | 'archived'; serviceCount: number; productCount: number }

/** Tenant-specific categories: create, rename, reorder (buttons, keyboard-friendly), hide, archive. */
export function CategoriesPanel({ slug, kind, onChanged }: { slug: string; kind: 'service' | 'product'; onChanged?: () => void }) {
  const t = useT();
  const [showArchived, setShowArchived] = useState(false);
  const list = useLoad<{ items: Cat[] }>(tapi(slug, `/categories?kind=${kind}&archived=${showArchived ? 1 : 0}`));
  const [name, setName] = useState('');
  const [edit, setEdit] = useState<{ id: string; name: string } | null>(null);
  const [err, setErr] = useState<ApiError | null>(null);
  const create = useSubmit<unknown, { id: string }>(tapi(slug, '/categories'));

  const patch = async (id: string, body: Record<string, unknown>) => {
    try {
      await apiFetch(tapi(slug, `/categories/${id}`), { method: 'PATCH', body });
      setErr(null);
      await list.reload();
      onChanged?.();
    } catch (e) {
      setErr(e as ApiError);
    }
  };
  const move = async (i: number, d: -1 | 1) => {
    const ids = (list.data?.items ?? []).filter((c) => c.status !== 'archived').map((c) => c.id);
    if (i + d < 0 || i + d >= ids.length) return;
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    try {
      await apiFetch(tapi(slug, '/categories/reorder'), { method: 'POST', body: { ids } });
      await list.reload();
    } catch (e) {
      setErr(e as ApiError);
    }
  };
  const items = list.data?.items ?? [];
  return (
    <section className="stack" aria-label={t('ops.categories')}>
      <form
        className="toolbar"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          if (await create.submit({ kind, name: name.trim() })) {
            setName('');
            await list.reload();
            onChanged?.();
          }
        }}
      >
        <label className="sr-only" htmlFor={`cat-new-${kind}`}>{t('ops.new_category')}</label>
        <input id={`cat-new-${kind}`} className="input" placeholder={t('ops.new_category')} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="btn btn-gold" disabled={create.busy || !name.trim()}><Icon name="plus" size={16} /> {t('common.add')}</button>
        <label className="check small"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> {t('ops.show_archived')}</label>
      </form>
      <ErrorAlert error={err ?? create.error ?? list.error} />
      <p className="small muted">{t('ops.category_hide_note')}</p>
      {list.loading && !list.data ? <div className="skeleton" style={{ height: 80 }} /> : !items.length ? (
        <EmptyState icon="list" title={t('ops.no_categories')} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t('common.name')}</th><th>{kind === 'service' ? t('nav.services') : t('nav.products')}</th><th>{t('common.status')}</th><th>{t('common.actions')}</th></tr></thead>
            <tbody>
              {items.map((c, i) => (
                <tr key={c.id}>
                  <td>
                    {edit?.id === c.id ? (
                      <form className="row" onSubmit={async (e) => { e.preventDefault(); await patch(c.id, { name: edit.name }); setEdit(null); }}>
                        <input className="input" aria-label={t('common.name')} value={edit.name} maxLength={80} autoFocus onChange={(e) => setEdit({ id: c.id, name: e.target.value })} />
                        <button type="submit" className="btn btn-sm btn-gold">{t('common.save')}</button>
                        <button type="button" className="btn btn-sm" onClick={() => setEdit(null)}>{t('common.cancel')}</button>
                      </form>
                    ) : c.name}
                  </td>
                  <td>{kind === 'service' ? c.serviceCount : c.productCount}</td>
                  <td><span className={`badge ${c.status === 'active' ? 'green' : c.status === 'hidden' ? 'amber' : ''}`}>{t(`common.${c.status}`)}</span></td>
                  <td>
                    <span className="row" style={{ gap: 4 }}>
                      {c.status !== 'archived' && (
                        <>
                          <button type="button" className="btn icon-btn" disabled={i === 0} aria-label={`${t('ops.move_up')} ${c.name}`} onClick={() => move(i, -1)}><Icon name="arrowUp" size={14} /></button>
                          <button type="button" className="btn icon-btn" disabled={i === items.filter((x) => x.status !== 'archived').length - 1} aria-label={`${t('ops.move_down')} ${c.name}`} onClick={() => move(i, 1)}><Icon name="arrowDown" size={14} /></button>
                          <button type="button" className="btn btn-sm" onClick={() => setEdit({ id: c.id, name: c.name })}>{t('common.edit')}</button>
                          <button type="button" className="btn btn-sm" onClick={() => patch(c.id, { status: c.status === 'hidden' ? 'active' : 'hidden' })}>
                            <Icon name={c.status === 'hidden' ? 'eye' : 'eyeOff'} size={14} /> {c.status === 'hidden' ? t('ops.show') : t('ops.hide')}
                          </button>
                          <button type="button" className="btn btn-sm btn-danger" onClick={() => window.confirm(t('ops.archive_category_confirm')) && patch(c.id, { status: 'archived' })}>{t('common.archive')}</button>
                        </>
                      )}
                      {c.status === 'archived' && <button type="button" className="btn btn-sm" onClick={() => patch(c.id, { status: 'active' })}>{t('common.restore')}</button>}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
