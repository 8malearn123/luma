'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useLocale, useT } from '../I18n';
import { Icon } from '../Icon';
import { EmptyState, ErrorAlert, Field, useSubmit } from '../ui/forms';
import { useToast } from '../ui/Toast';
import { apiFetch, newIdempotencyKey, type ApiError } from '@/lib/client/api';
import { formatDateTime, tzLabel } from '@/lib/format';
import { utcToWall } from '@/lib/tz';
import { tapi, uploadImage, WEEKDAYS } from '../catalog/client';
import { isoToLocalInput, localInputToIso } from './time';

export interface PortalData {
  slug: string;
  timezone: string;
  businessName: string;
  staffId: string;
  caps: { bookings: boolean; hr: boolean; profile: boolean; schedule: boolean };
  profile: { displayName: string; displayNameEn: string | null; bio: string | null; photoAssetId: string | null; specialty: string | null };
  bookings: { itemId: string; bookingId: string; number: string; status: string; startsAt: string; endsAt: string; serviceName: string; customerName: string; customerNote: string | null }[];
  last: { kind: string; at: string } | null;
  schedule: null | {
    hours: { weekday: number; start: string; end: string; branchName: string }[];
    breaks: { weekday: number | null; onDate: string | null; start: string; end: string; label: string | null }[];
    overrides: { onDate: string; kind: string; start: string | null; end: string | null; note: string | null }[];
    leave: { id: string; startsAt: string; endsAt: string; type: string; status: string }[];
  };
  leave: { id: string; startsAt: string; endsAt: string; type: string; status: string; reviewNote: string | null }[];
  requests: { id: string; kind: string; details: string; status: string; reviewNote: string | null; createdAt: string }[];
}

const NEXT: Record<string, { to: string; key: string }[]> = {
  confirmed: [{ to: 'checked_in', key: 'team.check_in' }, { to: 'in_service', key: 'team.start_service' }],
  checked_in: [{ to: 'in_service', key: 'team.start_service' }, { to: 'completed', key: 'team.complete' }],
  in_service: [{ to: 'completed', key: 'team.complete' }],
};

export function StaffPortal({ data }: { data: PortalData }) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const router = useRouter();
  const tz = data.timezone;
  const [err, setErr] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const today = utcToWall(new Date(), tz).date;
  const todays = data.bookings.filter((b) => utcToWall(new Date(b.startsAt), tz).date === today);
  const upcoming = data.bookings.filter((b) => utcToWall(new Date(b.startsAt), tz).date > today);
  const clockedIn = data.last?.kind === 'clock_in';

  const act = async (key: string, fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(key);
    setErr(null);
    try {
      await fn();
      toast(okMsg, 'ok');
      router.refresh();
    } catch (e) {
      setErr(e as ApiError);
    } finally {
      setBusy(null);
    }
  };

  const [leave, setLeave] = useState({ start: isoToLocalInput(new Date(Date.now() + 864e5), tz).slice(0, 11) + '00:00', end: isoToLocalInput(new Date(Date.now() + 864e5), tz).slice(0, 11) + '23:59', type: 'annual', reason: '' });
  const leaveSubmit = useSubmit<unknown, { id: string; conflicts: unknown[] }>(tapi(data.slug, '/leave'));
  const [req, setReq] = useState({ kind: 'schedule_change', details: '' });
  const reqSubmit = useSubmit(tapi(data.slug, '/staff/requests'));
  const [prof, setProf] = useState({ bio: data.profile.bio ?? '', displayNameEn: data.profile.displayNameEn ?? '', photoAssetId: data.profile.photoAssetId });
  const profSubmit = useSubmit(tapi(data.slug, '/staff/me'), 'PATCH');

  const bookingCard = (b: PortalData['bookings'][number]) => (
    <li key={b.itemId} className="card" style={{ padding: '12px 14px' }}>
      <div className="row between">
        <strong>{formatDateTime(b.startsAt, { tz, locale, timeOnly: utcToWall(new Date(b.startsAt), tz).date === today })}</strong>
        <span className="badge">{t(`team.bstatus.${b.status}`)}</span>
      </div>
      <div>{b.serviceName} · {b.customerName}</div>
      {b.customerNote && <div className="small muted">{b.customerNote}</div>}
      <div className="small muted mono">{b.number}</div>
      <div className="row" style={{ marginTop: 8 }}>
        {(NEXT[b.status] ?? []).map((n) => (
          <button key={n.to} type="button" className="btn btn-sm btn-ghost" disabled={!!busy} onClick={() => act(`${b.bookingId}:${n.to}`, () => apiFetch(tapi(data.slug, `/bookings/${b.bookingId}/transition`), { method: 'POST', idempotencyKey: newIdempotencyKey(), body: { to: n.to } }), t('common.saved'))}>
            {t(n.key)}
          </button>
        ))}
      </div>
    </li>
  );

  return (
    <div className="stack">
      <div>
        <div className="small muted">{data.businessName}</div>
        <h1 style={{ margin: 0 }}>{t('team.portal_hello', { name: data.profile.displayName })}</h1>
        <div className="small muted">{tzLabel(tz, locale)}</div>
      </div>
      <ErrorAlert error={err} />

      {data.caps.hr && (
        <section className="card" aria-labelledby="att-h">
          <h2 id="att-h">{t('team.attendance_today')}</h2>
          <p className="muted small">
            {data.last ? `${t(`team.${data.last.kind}`)} · ${formatDateTime(data.last.at, { tz, locale })}` : t('team.no_attendance')}
          </p>
          <button
            type="button"
            className={`btn ${clockedIn ? 'btn-ghost' : 'btn-gold'}`}
            style={{ width: '100%', minHeight: 48 }}
            disabled={!!busy}
            onClick={() => act('clock', () => apiFetch(tapi(data.slug, '/attendance'), { method: 'POST', idempotencyKey: newIdempotencyKey(), body: { kind: clockedIn ? 'clock_out' : 'clock_in' } }), t(clockedIn ? 'team.clock_out' : 'team.clock_in'))}
          >
            <Icon name="clock" size={18} /> {t(clockedIn ? 'team.clock_out' : 'team.clock_in')}
          </button>
        </section>
      )}

      {data.caps.bookings && (
        <section aria-labelledby="today-h">
          <h2 id="today-h">{t('team.my_today')}</h2>
          {todays.length ? <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>{todays.map(bookingCard)}</ul> : <EmptyState icon="calendar" title={t('team.no_bookings_today')} />}
          <h3 style={{ marginTop: 16 }}>{t('team.upcoming')}</h3>
          {upcoming.length ? <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>{upcoming.map(bookingCard)}</ul> : <p className="muted small">{t('team.no_upcoming')}</p>}
        </section>
      )}

      {data.schedule && (
        <section className="card" aria-labelledby="sch-h">
          <h2 id="sch-h">{t('team.my_schedule')}</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            {WEEKDAYS.map((w, wd) => {
              const h = data.schedule!.hours.filter((x) => x.weekday === wd);
              const br = data.schedule!.breaks.filter((x) => x.weekday === wd);
              return (
                <li key={wd} className="row between" style={{ padding: '6px 0', borderBottom: '1px solid var(--line-soft)' }}>
                  <span>{w[locale === 'ar' ? 0 : 1]}</span>
                  <span className="small mono">{h.length ? h.map((x) => `${x.start}–${x.end}`).join(' · ') : t('team.day_off')}{br.length ? ` (${t('team.break')} ${br.map((b) => `${b.start}–${b.end}`).join(', ')})` : ''}</span>
                </li>
              );
            })}
          </ul>
          {data.schedule.overrides.length > 0 && (
            <>
              <h3 style={{ marginTop: 12 }}>{t('team.overrides')}</h3>
              <ul style={{ paddingInlineStart: 18 }}>{data.schedule.overrides.map((o) => <li key={o.onDate} className="small"><span className="mono">{o.onDate}</span> · {o.kind === 'closed' ? t('team.closed') : `${o.start}–${o.end}`}</li>)}</ul>
            </>
          )}
        </section>
      )}

      {data.caps.hr && (
        <section className="card" aria-labelledby="leave-h">
          <h2 id="leave-h">{t('team.my_leave')}</h2>
          <form className="stack" onSubmit={async (e) => {
            e.preventDefault();
            const r = await leaveSubmit.submit({ staffId: data.staffId, startsAt: localInputToIso(leave.start, tz), endsAt: localInputToIso(leave.end, tz), type: leave.type, reason: leave.reason || undefined });
            if (r) {
              toast(r.conflicts.length ? t('team.leave_sent_conflicts', { n: r.conflicts.length }) : t('team.leave_sent'), 'ok');
              router.refresh();
            }
          }}>
            <select className="input" aria-label={t('team.leave_type')} value={leave.type} onChange={(e) => setLeave({ ...leave, type: e.target.value })}>
              {['annual', 'sick', 'emergency', 'unpaid', 'other'].map((x) => <option key={x} value={x}>{t(`team.leave_type.${x}`)}</option>)}
            </select>
            <input type="datetime-local" className="input" aria-label={t('common.from')} value={leave.start} onChange={(e) => setLeave({ ...leave, start: e.target.value })} />
            <input type="datetime-local" className="input" aria-label={t('common.to')} value={leave.end} onChange={(e) => setLeave({ ...leave, end: e.target.value })} />
            <input className="input" aria-label={t('common.reason')} placeholder={t('common.reason')} value={leave.reason} onChange={(e) => setLeave({ ...leave, reason: e.target.value })} />
            <ErrorAlert error={leaveSubmit.error} />
            <button type="submit" className="btn btn-gold" disabled={leaveSubmit.busy}>{t('team.request_leave')}</button>
          </form>
          <ul className="stack" style={{ listStyle: 'none', padding: 0, marginTop: 12 }}>
            {data.leave.map((l) => (
              <li key={l.id} className="row between">
                <span className="small">{t(`team.leave_type.${l.type}`)} · {formatDateTime(l.startsAt, { tz, locale, dateOnly: true })} → {formatDateTime(l.endsAt, { tz, locale, dateOnly: true })}{l.reviewNote && <span className="muted"> · {l.reviewNote}</span>}</span>
                <span className="row" style={{ gap: 4 }}>
                  <span className={`badge ${l.status === 'approved' ? 'green' : l.status === 'pending' ? 'amber' : ''}`}>{t(`team.leave.${l.status}`)}</span>
                  {l.status === 'pending' && <button type="button" className="btn btn-sm" onClick={() => act(`lv:${l.id}`, () => apiFetch(tapi(data.slug, `/leave/${l.id}`), { method: 'POST', body: { decision: 'cancelled' } }), t('common.saved'))}>{t('common.cancel')}</button>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.caps.hr && (
        <section className="card" aria-labelledby="req-h">
          <h2 id="req-h">{t('team.my_requests')}</h2>
          <form className="stack" onSubmit={async (e) => { e.preventDefault(); if (await reqSubmit.submit(req)) { setReq({ ...req, details: '' }); router.refresh(); } }}>
            <select className="input" aria-label={t('team.request_kind')} value={req.kind} onChange={(e) => setReq({ ...req, kind: e.target.value })}>
              {['schedule_change', 'advance', 'equipment', 'other'].map((x) => <option key={x} value={x}>{t(`team.request.${x}`)}</option>)}
            </select>
            <textarea className="input" aria-label={t('common.details')} placeholder={t('common.details')} value={req.details} maxLength={2000} onChange={(e) => setReq({ ...req, details: e.target.value })} />
            <ErrorAlert error={reqSubmit.error} />
            <button type="submit" className="btn btn-ghost" disabled={req.details.trim().length < 3 || reqSubmit.busy}>{t('team.send_request')}</button>
          </form>
          <ul className="stack" style={{ listStyle: 'none', padding: 0, marginTop: 12 }}>
            {data.requests.map((r) => (
              <li key={r.id} className="row between small">
                <span>{t(`team.request.${r.kind}`)} · {r.details.slice(0, 60)}{r.reviewNote && <span className="muted"> · {r.reviewNote}</span>}</span>
                <span className={`badge ${r.status === 'approved' ? 'green' : r.status === 'pending' ? 'amber' : ''}`}>{t(`team.leave.${r.status}`)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.caps.profile && (
        <section className="card" aria-labelledby="prof-h">
          <h2 id="prof-h">{t('team.my_profile')}</h2>
          <p className="small muted">{t('team.profile_fields_note')}</p>
          <form onSubmit={async (e) => { e.preventDefault(); if (await profSubmit.submit({ bio: prof.bio, displayNameEn: prof.displayNameEn || null, photoAssetId: prof.photoAssetId })) toast(t('common.saved'), 'ok'); }}>
            <Field label={t('common.name_en')}>{(p) => <input {...p} className="input" dir="ltr" value={prof.displayNameEn} onChange={(e) => setProf({ ...prof, displayNameEn: e.target.value })} />}</Field>
            <Field label={t('team.bio')}>{(p) => <textarea {...p} className="input" maxLength={2000} value={prof.bio} onChange={(e) => setProf({ ...prof, bio: e.target.value })} />}</Field>
            <div className="field">
              <label htmlFor="me-photo">{t('team.photo')}</label>
              <input id="me-photo" type="file" accept="image/png,image/jpeg,image/webp" onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  const r = await uploadImage(data.slug, f, 'staff', data.profile.displayName);
                  setProf({ ...prof, photoAssetId: r.id });
                } catch (er) {
                  setErr(er as ApiError);
                }
              }} />
            </div>
            <ErrorAlert error={profSubmit.error} />
            <button type="submit" className="btn btn-gold" disabled={profSubmit.busy}>{t('common.save')}</button>
          </form>
        </section>
      )}
    </div>
  );
}
