'use client';

import { useState } from 'react';
import { useLocale, useT } from '../I18n';
import { Icon } from '../Icon';
import { EmptyState, ErrorAlert, useSubmit } from '../ui/forms';
import { apiFetch, type ApiError } from '@/lib/client/api';
import { formatDateTime, tzLabel } from '@/lib/format';
import { tapi, useLoad } from '../catalog/client';
import { isoToLocalInput, localInputToIso } from './time';

interface Leave { id: string; staffId: string; staffName: string; startsAt: string; endsAt: string; type: string; status: string; reason: string | null; reviewNote: string | null }
interface Conflict { bookingId: string; number: string; startsAt: string; serviceName: string }

/** Leave approvals. Approving never cancels customers silently: conflicts are listed for action. */
export function LeavePanel({ slug, timezone }: { slug: string; timezone: string }) {
  const t = useT();
  const locale = useLocale();
  const [status, setStatus] = useState('pending');
  const list = useLoad<{ items: Leave[] }>(tapi(slug, `/leave${status ? `?status=${status}` : ''}`));
  const staff = useLoad<{ items: { id: string; displayName: string; status: string }[] }>(tapi(slug, '/staff'));
  const [conflicts, setConflicts] = useState<{ leaveId: string; items: Conflict[] } | null>(null);
  const [err, setErr] = useState<ApiError | null>(null);
  const [form, setForm] = useState({ staffId: '', start: isoToLocalInput(new Date(Date.now() + 864e5), timezone).slice(0, 11) + '00:00', end: isoToLocalInput(new Date(Date.now() + 864e5), timezone).slice(0, 11) + '23:59', type: 'annual', reason: '' });
  const create = useSubmit<unknown, { id: string; conflicts: Conflict[] }>(tapi(slug, '/leave'));

  const decide = async (id: string, decision: 'approved' | 'rejected' | 'cancelled') => {
    const note = decision === 'rejected' ? window.prompt(t('team.reject_note')) ?? undefined : undefined;
    try {
      const r = await apiFetch<{ conflicts: Conflict[] }>(tapi(slug, `/leave/${id}`), { method: 'POST', body: { decision, note } });
      setConflicts(r.conflicts?.length ? { leaveId: id, items: r.conflicts } : null);
      setErr(null);
      await list.reload();
    } catch (e) {
      setErr(e as ApiError);
    }
  };

  return (
    <section className="stack" aria-label={t('team.tab.leave')}>
      <div className="toolbar">
        <select className="input" aria-label={t('common.status')} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">{t('common.all')}</option>
          {['pending', 'approved', 'rejected', 'cancelled'].map((s) => <option key={s} value={s}>{t(`team.leave.${s}`)}</option>)}
        </select>
        <span className="small muted">{tzLabel(timezone, locale)}</span>
      </div>
      <ErrorAlert error={err ?? list.error} />
      {conflicts && (
        <div className="alert warn" role="alert">
          <div>
            <strong>{t('team.leave_conflicts', { n: conflicts.items.length })}</strong>
            <ul style={{ margin: '6px 0 0', paddingInlineStart: 18 }}>
              {conflicts.items.map((c) => <li key={c.bookingId}><a href={`/app/${slug}/bookings/${c.bookingId}`}>{c.number}</a> · {c.serviceName} · {formatDateTime(c.startsAt, { tz: timezone, locale })}</li>)}
            </ul>
            <div className="small">{t('team.affected_note')}</div>
          </div>
        </div>
      )}
      {list.loading && !list.data ? <div className="skeleton" style={{ height: 90 }} /> : !list.data?.items.length ? <EmptyState icon="calendar" title={t('team.no_leave')} /> : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t('ops.specialist')}</th><th>{t('common.from')}</th><th>{t('common.to')}</th><th>{t('team.leave_type')}</th><th>{t('common.status')}</th><th>{t('common.actions')}</th></tr></thead>
            <tbody>
              {list.data.items.map((l) => (
                <tr key={l.id}>
                  <td>{l.staffName}{l.reason && <div className="small muted">{l.reason}</div>}</td>
                  <td>{formatDateTime(l.startsAt, { tz: timezone, locale })}</td>
                  <td>{formatDateTime(l.endsAt, { tz: timezone, locale })}</td>
                  <td>{t(`team.leave_type.${l.type}`)}</td>
                  <td><span className={`badge ${l.status === 'approved' ? 'green' : l.status === 'pending' ? 'amber' : ''}`}>{t(`team.leave.${l.status}`)}</span></td>
                  <td>
                    {l.status === 'pending' && (
                      <span className="row" style={{ gap: 4 }}>
                        <button type="button" className="btn btn-sm btn-gold" onClick={() => decide(l.id, 'approved')}>{t('team.approve')}</button>
                        <button type="button" className="btn btn-sm" onClick={() => decide(l.id, 'rejected')}>{t('ops.reject')}</button>
                      </span>
                    )}
                    {l.status === 'approved' && <button type="button" className="btn btn-sm" onClick={() => window.confirm(t('team.cancel_leave_confirm')) && decide(l.id, 'cancelled')}>{t('common.cancel')}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <form className="card stack" onSubmit={async (e) => {
        e.preventDefault();
        const r = await create.submit({ staffId: form.staffId, startsAt: localInputToIso(form.start, timezone), endsAt: localInputToIso(form.end, timezone), type: form.type, reason: form.reason || undefined });
        if (r) {
          setConflicts(r.conflicts.length ? { leaveId: r.id, items: r.conflicts } : null);
          await list.reload();
        }
      }}>
        <h3>{t('team.leave_on_behalf')}</h3>
        <div className="row">
          <select className="input" aria-label={t('ops.specialist')} value={form.staffId} onChange={(e) => setForm({ ...form, staffId: e.target.value })}>
            <option value="">{t('common.select')}</option>
            {(staff.data?.items ?? []).filter((s) => s.status === 'active').map((s) => <option key={s.id} value={s.id}>{s.displayName}</option>)}
          </select>
          <select className="input" aria-label={t('team.leave_type')} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            {['annual', 'sick', 'emergency', 'unpaid', 'other'].map((x) => <option key={x} value={x}>{t(`team.leave_type.${x}`)}</option>)}
          </select>
        </div>
        <div className="row">
          <input type="datetime-local" className="input" aria-label={t('common.from')} value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
          <input type="datetime-local" className="input" aria-label={t('common.to')} value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
        </div>
        <input className="input" aria-label={t('common.reason')} placeholder={t('common.reason')} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        <ErrorAlert error={create.error} />
        <button type="submit" className="btn btn-ghost btn-sm" disabled={!form.staffId || create.busy}><Icon name="plus" size={14} /> {t('common.create')}</button>
        <p className="small muted">{t('team.pending_does_not_block')}</p>
      </form>
    </section>
  );
}
