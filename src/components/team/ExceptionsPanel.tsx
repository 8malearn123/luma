'use client';

import { useMemo, useState } from 'react';
import { useLocale, useT } from '../I18n';
import { Icon } from '../Icon';
import { EmptyState, ErrorAlert, useSubmit } from '../ui/forms';
import { apiFetch, type ApiError } from '@/lib/client/api';
import { formatDateTime, tzLabel } from '@/lib/format';
import { addDays } from '@/lib/tz';
import { tapi, useLoad } from '../catalog/client';
import type { TeamRefs } from './TeamManager';
import { isoToLocalInput, localInputToIso, todayIn } from './time';

/** Date-specific exceptions (closures, custom hours) and blocked time for one specialist. */
export function ExceptionsPanel({ slug, refs, timezone }: { slug: string; refs: TeamRefs; timezone: string }) {
  const t = useT();
  const locale = useLocale();
  const staff = useLoad<{ items: { id: string; displayName: string; status: string }[] }>(tapi(slug, '/staff'));
  const [branchId, setBranchId] = useState(refs.branches[0]?.id ?? '');
  const from = todayIn(timezone);
  const to = addDays(from, 90);
  const ovUrl = useMemo(() => (branchId ? tapi(slug, `/schedules/overrides?branchId=${branchId}&from=${from}&to=${to}`) : null), [slug, branchId, from, to]);
  const overrides = useLoad<{ items: { id: string; staffId: string | null; onDate: string; kind: string; startTime: string | null; endTime: string | null; note: string | null }[] }>(ovUrl);
  const blUrl = tapi(slug, `/schedules/blocked?from=${encodeURIComponent(new Date().toISOString())}&to=${encodeURIComponent(new Date(Date.now() + 90 * 864e5).toISOString())}`);
  const blocked = useLoad<{ items: { id: string; staffName: string | null; startsAt: string; endsAt: string; reason: string | null }[] }>(blUrl);
  const [ov, setOv] = useState({ staffId: '', onDate: from, kind: 'closed', start: '10:00', end: '16:00', note: '' });
  const [bl, setBl] = useState({ staffId: '', start: isoToLocalInput(new Date(Date.now() + 864e5), timezone), end: isoToLocalInput(new Date(Date.now() + 864e5 + 3600e3), timezone), reason: '' });
  const [err, setErr] = useState<ApiError | null>(null);
  const addOv = useSubmit(tapi(slug, '/schedules/overrides'));
  const addBl = useSubmit(tapi(slug, '/schedules/blocked'));
  const del = async (url: string, reload: () => Promise<void>) => {
    try {
      await apiFetch(url, { method: 'DELETE' });
      await reload();
    } catch (e) {
      setErr(e as ApiError);
    }
  };
  const staffName = (id: string | null) => (id ? (staff.data?.items.find((s) => s.id === id)?.displayName ?? '—') : t('team.whole_branch'));
  const active = (staff.data?.items ?? []).filter((s) => s.status === 'active');

  return (
    <section className="grid cols-2" aria-label={t('team.tab.exceptions')}>
      <div className="card">
        <h3>{t('team.overrides')}</h3>
        <select className="input" aria-label={t('ops.branch')} value={branchId} onChange={(e) => setBranchId(e.target.value)} style={{ marginBottom: 10 }}>
          {refs.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <form className="stack" onSubmit={async (e) => {
          e.preventDefault();
          const body = { branchId, staffId: ov.staffId || null, onDate: ov.onDate, kind: ov.kind, ...(ov.kind === 'custom' ? { start: ov.start, end: ov.end } : {}), note: ov.note || undefined };
          if (await addOv.submit(body)) await overrides.reload();
        }}>
          <div className="row">
            <select className="input" aria-label={t('team.schedule_for')} value={ov.staffId} onChange={(e) => setOv({ ...ov, staffId: e.target.value })}>
              <option value="">{t('team.whole_branch')}</option>
              {active.map((s) => <option key={s.id} value={s.id}>{s.displayName}</option>)}
            </select>
            <input type="date" className="input" aria-label={t('common.date')} value={ov.onDate} min={from} onChange={(e) => setOv({ ...ov, onDate: e.target.value })} />
          </div>
          <div className="row">
            <select className="input" aria-label={t('team.override_kind')} value={ov.kind} onChange={(e) => setOv({ ...ov, kind: e.target.value })}>
              <option value="closed">{t('team.closed')}</option>
              <option value="custom">{t('team.custom_hours')}</option>
            </select>
            {ov.kind === 'custom' && (
              <>
                <input type="time" className="input" aria-label={t('common.from')} value={ov.start} onChange={(e) => setOv({ ...ov, start: e.target.value })} />
                <input type="time" className="input" aria-label={t('common.to')} value={ov.end} onChange={(e) => setOv({ ...ov, end: e.target.value })} />
              </>
            )}
          </div>
          <input className="input" aria-label={t('common.notes')} placeholder={t('common.notes')} value={ov.note} maxLength={200} onChange={(e) => setOv({ ...ov, note: e.target.value })} />
          <button type="submit" className="btn btn-gold btn-sm" disabled={addOv.busy}><Icon name="plus" size={14} /> {t('common.add')}</button>
          <ErrorAlert error={addOv.error} />
        </form>
        <ul className="stack" style={{ listStyle: 'none', padding: 0, marginTop: 12 }}>
          {!overrides.data?.items.length && <EmptyState icon="calendar" title={t('team.no_overrides')} />}
          {(overrides.data?.items ?? []).map((o) => (
            <li key={o.id} className="row between">
              <span><span className="mono">{o.onDate}</span> · {staffName(o.staffId)} · {o.kind === 'closed' ? t('team.closed') : `${o.startTime}–${o.endTime}`} {o.note && <span className="muted small">({o.note})</span>}</span>
              <button type="button" className="btn icon-btn" aria-label={t('common.delete')} onClick={() => del(tapi(slug, `/schedules/overrides/${o.id}`), overrides.reload)}><Icon name="trash" size={14} /></button>
            </li>
          ))}
        </ul>
      </div>
      <div className="card">
        <h3>{t('team.blocked_time')}</h3>
        <p className="small muted">{tzLabel(timezone, locale)}</p>
        <form className="stack" onSubmit={async (e) => {
          e.preventDefault();
          if (!bl.staffId) return;
          if (await addBl.submit({ staffId: bl.staffId, startsAt: localInputToIso(bl.start, timezone), endsAt: localInputToIso(bl.end, timezone), reason: bl.reason || undefined })) await blocked.reload();
        }}>
          <select className="input" aria-label={t('ops.specialist')} value={bl.staffId} onChange={(e) => setBl({ ...bl, staffId: e.target.value })}>
            <option value="">{t('common.select')}</option>
            {active.map((s) => <option key={s.id} value={s.id}>{s.displayName}</option>)}
          </select>
          <div className="row">
            <input type="datetime-local" className="input" aria-label={t('common.from')} value={bl.start} onChange={(e) => setBl({ ...bl, start: e.target.value })} />
            <input type="datetime-local" className="input" aria-label={t('common.to')} value={bl.end} onChange={(e) => setBl({ ...bl, end: e.target.value })} />
          </div>
          <input className="input" aria-label={t('common.reason')} placeholder={t('common.reason')} value={bl.reason} maxLength={200} onChange={(e) => setBl({ ...bl, reason: e.target.value })} />
          <button type="submit" className="btn btn-gold btn-sm" disabled={addBl.busy || !bl.staffId}><Icon name="ban" size={14} /> {t('team.block')}</button>
          <ErrorAlert error={addBl.error ?? err} />
        </form>
        <ul className="stack" style={{ listStyle: 'none', padding: 0, marginTop: 12 }}>
          {!blocked.data?.items.length && <EmptyState icon="ban" title={t('team.no_blocked')} />}
          {(blocked.data?.items ?? []).map((b) => (
            <li key={b.id} className="row between">
              <span>{b.staffName} · {formatDateTime(b.startsAt, { tz: timezone, locale })} → {formatDateTime(b.endsAt, { tz: timezone, locale, timeOnly: true })} {b.reason && <span className="muted small">({b.reason})</span>}</span>
              <button type="button" className="btn icon-btn" aria-label={t('common.delete')} onClick={() => del(tapi(slug, `/schedules/blocked/${b.id}`), blocked.reload)}><Icon name="trash" size={14} /></button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
