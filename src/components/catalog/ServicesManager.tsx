'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useLocale, useT } from '../I18n';
import { Icon } from '../Icon';
import { EmptyState, ErrorAlert } from '../ui/forms';
import { apiFetch, type ApiError } from '@/lib/client/api';
import { formatDuration, formatMoney } from '@/lib/format';
import { tapi, useLoad } from './client';
import { ServiceEditor } from './ServiceEditor';
import { CategoriesPanel } from './CategoriesPanel';
import { PackagesPanel } from './PackagesPanel';
import { ResourcesPanel } from './ResourcesPanel';

export interface CatalogRefs {
  branches: { id: string; name: string }[];
  staff: { id: string; displayName: string }[];
  resourceTypes: { id: string; name: string }[];
}

interface Row {
  id: string;
  name: string;
  nameEn: string | null;
  categoryName: string | null;
  priceMinor: number;
  priceIsFrom: boolean;
  durationMin: number;
  status: 'active' | 'inactive' | 'archived';
  isVisible: boolean;
  staffCount: number;
}

type Tab = 'services' | 'categories' | 'packages' | 'resources';

export function ServicesManager({ slug, refs, canSeeCosts, canApprovePrices, initialTab, initialOpenId }: { slug: string; refs: CatalogRefs; canSeeCosts: boolean; canApprovePrices: boolean; initialTab: Tab; initialOpenId: string | null }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const sp = useSearchParams();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [status, setStatus] = useState(sp.get('status') ?? '');
  const [categoryId, setCategoryId] = useState(sp.get('category') ?? '');
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<string | 'new' | null>(initialOpenId);
  const [debouncedQ, setDebouncedQ] = useState(q);
  const [reorderErr, setReorderErr] = useState<ApiError | null>(null);
  useEffect(() => {
    const h = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(h);
  }, [q]);
  // keep filters in the URL so back navigation restores context
  useEffect(() => {
    const u = new URLSearchParams();
    if (tab !== 'services') u.set('tab', tab);
    if (debouncedQ) u.set('q', debouncedQ);
    if (status) u.set('status', status);
    if (categoryId) u.set('category', categoryId);
    if (open && open !== 'new') u.set('id', open);
    router.replace(`?${u.toString()}`, { scroll: false });
  }, [tab, debouncedQ, status, categoryId, open, router]);

  const limit = 25;
  const url = useMemo(() => {
    const u = new URLSearchParams({ limit: String(limit), offset: String(page * limit) });
    if (debouncedQ) u.set('q', debouncedQ);
    if (status) u.set('status', status);
    if (categoryId) u.set('categoryId', categoryId);
    return tapi(slug, `/services?${u.toString()}`);
  }, [slug, debouncedQ, status, categoryId, page]);
  const list = useLoad<{ items: Row[]; hasMore: boolean }>(tab === 'services' ? url : null);
  const cats = useLoad<{ items: { id: string; name: string; status: string }[] }>(tapi(slug, '/categories?kind=service'));

  const move = async (idx: number, dir: -1 | 1) => {
    const items = list.data?.items ?? [];
    const j = idx + dir;
    if (j < 0 || j >= items.length) return;
    const ids = items.map((x) => x.id);
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    try {
      await apiFetch(tapi(slug, '/services/reorder'), { method: 'POST', body: { ids } });
      setReorderErr(null);
      await list.reload();
    } catch (e) {
      setReorderErr(e as ApiError);
    }
  };

  const tabs: [Tab, string][] = [
    ['services', t('nav.services')],
    ['categories', t('ops.categories')],
    ['packages', t('ops.packages')],
    ['resources', t('ops.resources')],
  ];

  return (
    <>
      <div className="tabs" role="tablist">
        {tabs.map(([k, label]) => (
          <button key={k} type="button" role="tab" className="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'services' && (
        <section aria-labelledby="svc-h">
          <h2 id="svc-h" className="sr-only">{t('nav.services')}</h2>
          <div className="toolbar">
            <label className="sr-only" htmlFor="svc-q">{t('common.search')}</label>
            <input id="svc-q" className="input" placeholder={t('common.search')} value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} />
            <select className="input" style={{ maxWidth: 170 }} value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} aria-label={t('common.status')}>
              <option value="">{t('ops.status_current')}</option>
              <option value="active">{t('common.active')}</option>
              <option value="inactive">{t('common.inactive')}</option>
              <option value="archived">{t('common.archived')}</option>
            </select>
            <select className="input" style={{ maxWidth: 200 }} value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(0); }} aria-label={t('ops.category')}>
              <option value="">{t('ops.all_categories')}</option>
              {(cats.data?.items ?? []).filter((c) => c.status !== 'archived').map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <div style={{ flex: 1 }} />
            <button type="button" className="btn btn-gold" onClick={() => setOpen('new')}>
              <Icon name="plus" size={16} /> {t('ops.new_service')}
            </button>
          </div>
          <ErrorAlert error={list.error ?? reorderErr} />
          {list.loading && !list.data ? (
            <div className="stack" aria-busy="true">
              {[0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 44 }} />)}
            </div>
          ) : !list.data?.items.length ? (
            <EmptyState icon="scissors" title={debouncedQ || status || categoryId ? t('ops.no_results') : t('ops.no_services_yet')}>
              {!debouncedQ && t('onb.services_hint')}
            </EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('common.name')}</th>
                    <th>{t('ops.category')}</th>
                    <th>{t('common.price')}</th>
                    <th>{t('common.duration')}</th>
                    <th>{t('ops.qualified_staff')}</th>
                    <th>{t('common.status')}</th>
                    <th><span className="sr-only">{t('ops.order')}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.items.map((s, i) => (
                    <tr key={s.id} className="clickable" onClick={() => setOpen(s.id)}>
                      <td>
                        <button type="button" className="btn btn-quiet btn-sm" style={{ padding: 0 }} onClick={(e) => { e.stopPropagation(); setOpen(s.id); }}>
                          {locale === 'en' && s.nameEn ? s.nameEn : s.name}
                        </button>
                      </td>
                      <td className="muted">{s.categoryName ?? '—'}</td>
                      <td>{s.priceIsFrom ? `${t('common.from')} ` : ''}{formatMoney(s.priceMinor, 'SAR', locale)}</td>
                      <td>{formatDuration(s.durationMin, locale)}</td>
                      <td>{s.staffCount === 0 ? <span className="badge amber">{t('ops.no_staff')}</span> : s.staffCount}</td>
                      <td>
                        <span className={`badge ${s.status === 'active' ? 'green' : s.status === 'inactive' ? 'amber' : ''}`}>{t(`common.${s.status}`)}</span>{' '}
                        {!s.isVisible && <span className="badge">{t('common.hidden')}</span>}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <span className="row" style={{ gap: 2, flexWrap: 'nowrap' }}>
                          <button type="button" className="btn icon-btn" disabled={i === 0 || !!debouncedQ} aria-label={`${t('ops.move_up')} ${s.name}`} onClick={() => move(i, -1)}><Icon name="arrowUp" size={14} /></button>
                          <button type="button" className="btn icon-btn" disabled={i === list.data!.items.length - 1 || !!debouncedQ} aria-label={`${t('ops.move_down')} ${s.name}`} onClick={() => move(i, 1)}><Icon name="arrowDown" size={14} /></button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="pager">
            <button type="button" className="btn btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>{t('common.prev_page')}</button>
            <span>{page + 1}</span>
            <button type="button" className="btn btn-sm" disabled={!list.data?.hasMore} onClick={() => setPage(page + 1)}>{t('common.next_page')}</button>
          </div>
        </section>
      )}

      {tab === 'categories' && <CategoriesPanel slug={slug} kind="service" onChanged={() => cats.reload()} />}
      {tab === 'packages' && <PackagesPanel slug={slug} />}
      {tab === 'resources' && <ResourcesPanel slug={slug} branches={refs.branches} />}

      {open && (
        <ServiceEditor
          slug={slug}
          id={open === 'new' ? null : open}
          refs={refs}
          categories={(cats.data?.items ?? []).filter((c) => c.status !== 'archived')}
          canSeeCosts={canSeeCosts}
          canApprovePrices={canApprovePrices}
          onClose={() => setOpen(null)}
          onSaved={(id) => {
            void list.reload();
            setOpen(id);
          }}
        />
      )}
    </>
  );
}
