'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { addDays, utcToWall, wallToUtc } from '@/lib/tz';
import { formatDateTime, formatMoney, tzLabel } from '@/lib/format';
import { useLocale, useT } from '../I18n';
import { EmptyState } from '../ui/forms';
import { Icon } from '../Icon';
import { DataState, PageHead, statusBadge, useApi } from './hooks';
import { BookingDrawer } from './BookingDrawer';
import { NewBookingDrawer, type Opt } from './NewBooking';

interface Row {
  id: string; number: string; status: string; financialStatus: string; startsAt: string; endsAt: string; totalMinor: number; paidMinor: number;
  customerName: string | null; items: { id: string; staffId: string; staffName: string; serviceName: string; startsAt: string; endsAt: string }[];
}

const STATUSES = ['held', 'pending_payment', 'confirmed', 'checked_in', 'in_service', 'completed', 'cancelled', 'no_show', 'expired'];

export function BookingsBoard({ tenant, tz, caps, branches, services, staff, myStaffId }: { tenant: string; tz: string; caps: string[]; branches: Opt[]; services: Opt[]; staff: Opt[]; myStaffId: string | null }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const sp = useSearchParams();
  const today = utcToWall(new Date(), tz).date;
  const date = sp.get('date') && /^\d{4}-\d{2}-\d{2}$/.test(sp.get('date')!) ? sp.get('date')! : today;
  const view = sp.get('view') === 'list' ? 'list' : 'board';
  const staffFilter = sp.get('staff') ?? '';
  const statusFilter = sp.get('status') ?? '';
  const openId = sp.get('booking');
  const [creating, setCreating] = useState(sp.get('new') === '1');
  const setParam = (k: string, v: string | null) => {
    const u = new URLSearchParams(sp.toString());
    if (v) u.set(k, v);
    else u.delete(k);
    router.replace(`?${u.toString()}`, { scroll: false });
  };
  const from = wallToUtc(date, '00:00', tz).toISOString();
  const to = wallToUtc(addDays(date, 1), '00:00', tz).toISOString();
  const qs = new URLSearchParams({ from, to, limit: '200' });
  if (staffFilter) qs.set('staffId', staffFilter);
  if (statusFilter) qs.set('status', statusFilter);
  const list = useApi<{ items: Row[]; hasMore: boolean; scope: string }>(`/api/v1/t/${tenant}/bookings?${qs.toString()}`);
  const items = list.data?.items ?? [];
  const columns = useMemo(() => {
    const cols = (staffFilter ? staff.filter((s) => s.id === staffFilter) : myStaffId && !caps.includes('bookings.manage') ? staff.filter((s) => s.id === myStaffId) : staff).map((s) => ({ ...s, cards: [] as { b: Row; it: Row['items'][number] }[] }));
    for (const b of items) for (const it of b.items) cols.find((c) => c.id === it.staffId)?.cards.push({ b, it });
    for (const c of cols) c.cards.sort((x, y) => x.it.startsAt.localeCompare(y.it.startsAt));
    return cols;
  }, [items, staff, staffFilter, myStaffId, caps]);

  return (
    <>
      <PageHead
        title={t('nav.bookings')}
        crumbs={`${formatDateTime(wallToUtc(date, '12:00', tz), { tz, locale, dateStyle: 'full', dateOnly: true })} · ${tzLabel(tz, locale)}`}
        actions={caps.includes('bookings.manage') && <button type="button" className="btn btn-gold" onClick={() => setCreating(true)}><Icon name="plus" size={16} /> {t('bk.new')}</button>}
      />
      <div className="toolbar">
        <button type="button" className="btn icon-btn" aria-label={t('bk.prev_day')} onClick={() => setParam('date', addDays(date, -1))}><Icon name={locale === 'ar' ? 'chevronEnd' : 'chevronStart'} size={16} /></button>
        <input type="date" className="input" style={{ maxWidth: 170 }} aria-label={t('common.date')} value={date} onChange={(e) => setParam('date', e.target.value || null)} />
        <button type="button" className="btn icon-btn" aria-label={t('bk.next_day')} onClick={() => setParam('date', addDays(date, 1))}><Icon name={locale === 'ar' ? 'chevronStart' : 'chevronEnd'} size={16} /></button>
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => setParam('date', null)}>{t('bk.today')}</button>
        {staff.length > 1 && (
          <select className="input" style={{ maxWidth: 190 }} aria-label={t('bk.staff')} value={staffFilter} onChange={(e) => setParam('staff', e.target.value || null)}>
            <option value="">{t('bk.all_staff')}</option>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
        <select className="input" style={{ maxWidth: 190 }} aria-label={t('common.status')} value={statusFilter} onChange={(e) => setParam('status', e.target.value || null)}>
          <option value="">{t('bk.all_status')}</option>
          {STATUSES.map((s) => <option key={s} value={s}>{t(`bk.status.${s}`)}</option>)}
        </select>
        <div className="tabs" role="tablist" style={{ margin: 0, border: 0 }}>
          <button type="button" role="tab" className="tab" aria-selected={view === 'board'} onClick={() => setParam('view', null)}>{t('bk.board')}</button>
          <button type="button" role="tab" className="tab" aria-selected={view === 'list'} onClick={() => setParam('view', 'list')}>{t('bk.list')}</button>
        </div>
      </div>
      <DataState loading={list.loading && !list.data} error={list.error} onRetry={list.reload} rows={6}>
        {items.length === 0 ? (
          <div className="card"><EmptyState icon="calendar" title={t('dash.no_bookings_today')} /></div>
        ) : view === 'board' ? (
          <div className="day-board" style={{ gridTemplateColumns: `repeat(${Math.max(1, columns.length)}, minmax(200px, 1fr))` }}>
            {columns.map((c) => (
              <section key={c.id} aria-label={c.name} style={{ background: 'var(--surface)', padding: 10, minHeight: 200 }}>
                <h2 style={{ fontSize: 14 }}>{c.name} <span className="small muted">({c.cards.length})</span></h2>
                <div className="stack" style={{ gap: 8 }}>
                  {c.cards.map(({ b, it }) => (
                    <button key={it.id} type="button" className="card" style={{ textAlign: 'start', padding: '8px 10px', cursor: 'pointer', color: 'inherit', font: 'inherit' }} onClick={() => setParam('booking', b.id)}>
                      <div className="row between"><span className="mono small">{formatDateTime(it.startsAt, { tz, locale, timeOnly: true })}–{formatDateTime(it.endsAt, { tz, locale, timeOnly: true })}</span><span className={`badge ${statusBadge(b.status)}`}>{t(`bk.status.${b.status}`)}</span></div>
                      <div style={{ fontWeight: 600 }}>{it.serviceName}</div>
                      <div className="small muted">{b.customerName ?? b.number}</div>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>{t('bk.when')}</th><th>{t('bk.number')}</th><th>{t('bk.customer')}</th><th>{t('bk.services')}</th><th>{t('common.status')}</th><th>{t('bk.financial')}</th><th>{t('bk.total')}</th></tr></thead>
              <tbody>
                {items.map((b) => (
                  <tr key={b.id} className="clickable" tabIndex={0} onClick={() => setParam('booking', b.id)} onKeyDown={(e) => e.key === 'Enter' && setParam('booking', b.id)}>
                    <td className="mono small">{formatDateTime(b.startsAt, { tz, locale, timeOnly: true })}</td>
                    <td className="mono small">{b.number}</td>
                    <td>{b.customerName ?? '—'}</td>
                    <td className="small">{b.items.map((i) => `${i.serviceName} · ${i.staffName}`).join('، ')}</td>
                    <td><span className={`badge ${statusBadge(b.status)}`}>{t(`bk.status.${b.status}`)}</span></td>
                    <td><span className={`badge ${statusBadge(b.financialStatus)}`}>{t(`fin.${b.financialStatus}`)}</span></td>
                    <td>{formatMoney(b.totalMinor, 'SAR', locale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DataState>
      {openId && <BookingDrawer tenant={tenant} id={openId} tz={tz} caps={caps} onClose={() => setParam('booking', null)} onChanged={list.reload} />}
      {creating && (
        <NewBookingDrawer tenant={tenant} tz={tz} branches={branches} services={services} staff={staff} defaultDate={date}
          onClose={() => { setCreating(false); setParam('new', null); }}
          onCreated={(id) => { setCreating(false); void list.reload(); setParam('booking', id); }} />
      )}
    </>
  );
}
