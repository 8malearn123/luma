'use client';

import { useMemo, useState } from 'react';
import { useLocale, useT } from '../I18n';
import { EmptyState, ErrorAlert, useSubmit } from '../ui/forms';
import { formatDateTime, tzLabel } from '@/lib/format';
import { tapi, useLoad } from '../catalog/client';
import { isoToLocalInput, localInputToIso } from './time';

interface Ev { id: string; staffId: string; staffName: string; kind: string; at: string; source: string; note: string | null; correctsId: string | null }

/** Attendance log (append-only). Corrections are new manager entries with a mandatory note. */
export function AttendancePanel({ slug, timezone }: { slug: string; timezone: string }) {
  const t = useT();
  const locale = useLocale();
  const staff = useLoad<{ items: { id: string; displayName: string; status: string }[] }>(tapi(slug, '/staff'));
  const [staffId, setStaffId] = useState('');
  const [days, setDays] = useState(7);
  const url = useMemo(() => {
    const u = new URLSearchParams({ from: new Date(Date.now() - days * 864e5).toISOString(), to: new Date(Date.now() + 864e5).toISOString() });
    if (staffId) u.set('staffId', staffId);
    return tapi(slug, `/attendance?${u}`);
  }, [slug, staffId, days]);
  const list = useLoad<{ items: Ev[] }>(url);
  const [fix, setFix] = useState({ staffId: '', kind: 'clock_in', at: isoToLocalInput(new Date(), timezone), note: '' });
  const correct = useSubmit(tapi(slug, '/attendance'));
  return (
    <section className="stack" aria-label={t('team.tab.attendance')}>
      <div className="toolbar">
        <select className="input" aria-label={t('ops.specialist')} value={staffId} onChange={(e) => setStaffId(e.target.value)}>
          <option value="">{t('common.all')}</option>
          {(staff.data?.items ?? []).map((s) => <option key={s.id} value={s.id}>{s.displayName}</option>)}
        </select>
        <select className="input" aria-label={t('team.period')} value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {[1, 7, 30].map((d) => <option key={d} value={d}>{t('team.last_days', { n: d })}</option>)}
        </select>
        <span className="small muted">{tzLabel(timezone, locale)}</span>
      </div>
      <ErrorAlert error={list.error} />
      {list.loading && !list.data ? <div className="skeleton" style={{ height: 90 }} /> : !list.data?.items.length ? <EmptyState icon="clock" title={t('team.no_attendance')} /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t('ops.specialist')}</th><th>{t('team.event')}</th><th>{t('common.time')}</th><th>{t('team.source')}</th><th>{t('common.notes')}</th></tr></thead>
            <tbody>
              {list.data.items.map((e) => (
                <tr key={e.id}>
                  <td>{e.staffName}</td>
                  <td><span className={`badge ${e.kind === 'clock_in' ? 'green' : ''}`}>{t(`team.${e.kind}`)}</span></td>
                  <td>{formatDateTime(e.at, { tz: timezone, locale })}</td>
                  <td>{t(`team.source.${e.source}`)}</td>
                  <td className="small muted">{e.note ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form className="card stack" onSubmit={async (e) => {
        e.preventDefault();
        if (await correct.submit({ staffId: fix.staffId, kind: fix.kind, at: localInputToIso(fix.at, timezone), note: fix.note })) {
          setFix({ ...fix, note: '' });
          await list.reload();
        }
      }}>
        <h3>{t('team.correction')}</h3>
        <div className="row">
          <select className="input" aria-label={t('ops.specialist')} value={fix.staffId} onChange={(e) => setFix({ ...fix, staffId: e.target.value })}>
            <option value="">{t('common.select')}</option>
            {(staff.data?.items ?? []).map((s) => <option key={s.id} value={s.id}>{s.displayName}</option>)}
          </select>
          <select className="input" aria-label={t('team.event')} value={fix.kind} onChange={(e) => setFix({ ...fix, kind: e.target.value })}>
            <option value="clock_in">{t('team.clock_in')}</option>
            <option value="clock_out">{t('team.clock_out')}</option>
          </select>
          <input type="datetime-local" className="input" aria-label={t('common.time')} value={fix.at} onChange={(e) => setFix({ ...fix, at: e.target.value })} />
        </div>
        <input className="input" aria-label={t('common.reason')} placeholder={t('team.correction_note')} value={fix.note} onChange={(e) => setFix({ ...fix, note: e.target.value })} />
        <ErrorAlert error={correct.error} />
        <button type="submit" className="btn btn-ghost btn-sm" disabled={!fix.staffId || fix.note.trim().length < 3 || correct.busy}>{t('common.save')}</button>
      </form>
    </section>
  );
}
