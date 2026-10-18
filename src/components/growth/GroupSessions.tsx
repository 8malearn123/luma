'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiFetch } from '@/lib/client/api';
import { formatDateTime, formatMoney, tzLabel } from '@/lib/format';
import { wallToUtc } from '@/lib/tz';
import { useLocale, useT } from '../I18n';
import { Icon } from '../Icon';
import { Drawer, EmptyState, ErrorAlert, Field, useSubmit } from '../ui/forms';
import { CustomerPicker } from './CustomerPicker';

interface Session {
  id: string;
  startsAt: string;
  capacity: number;
  seatsTaken: number;
  priceMinor: number;
  status: string;
  serviceName: string;
  staffName: string;
}

export function GroupSessions({
  tenant,
  timezone,
  sessions,
  services,
  staff,
  branches,
}: {
  tenant: string;
  timezone: string;
  sessions: Session[];
  services: { id: string; name: string; groupCapacity: number }[];
  staff: { serviceId: string; id: string; displayName: string }[];
  branches: { id: string; name: string }[];
}) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [f, setF] = useState({ serviceId: services[0]?.id ?? '', staffId: '', branchId: branches[0]?.id ?? '', date: '', time: '10:00', capacity: '' });
  const [open, setOpen] = useState<Session | null>(null);
  const [parts, setParts] = useState<{ bookingId: string; number: string; status: string; seats: number; displayName: string }[] | null>(null);
  const [cust, setCust] = useState<{ id: string; displayName: string; phone: string | null } | null>(null);
  const create = useSubmit<unknown, { id: string }>(`/api/v1/t/${tenant}/groups`);
  const join = useSubmit<unknown, { bookingId: string }>(() => `/api/v1/t/${tenant}/groups/${open?.id}/join`);
  const staffFor = staff.filter((s) => s.serviceId === f.serviceId);
  const load = async (s: Session) => {
    setOpen(s);
    setParts(null);
    setParts((await apiFetch<{ participants: NonNullable<typeof parts> }>(`/api/v1/t/${tenant}/groups/${s.id}`)).participants);
  };
  return (
    <section className="card">
      <div className="row between">
        <h2 style={{ margin: 0 }}>{t('growth.groups.title')}</h2>
        <button type="button" className="btn btn-ghost btn-sm" disabled={!services.length} onClick={() => setCreating(true)}><Icon name="plus" size={14} /> {t('growth.groups.add')}</button>
      </div>
      {!services.length && <p className="small muted">{t('growth.groups.no_services')}</p>}
      {sessions.length === 0 ? (
        <EmptyState icon="calendar" title={t('growth.groups.empty')} />
      ) : (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="table">
            <thead>
              <tr><th>{t('growth.groups.starts')} <span className="small muted">({tzLabel(timezone, locale)})</span></th><th>{t('growth.groups.service')}</th><th>{t('growth.groups.instructor')}</th><th>{t('growth.groups.seats')}</th><th>{t('common.price')}</th><th>{t('common.status')}</th></tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id} className="clickable" tabIndex={0} onClick={() => load(s)} onKeyDown={(e) => e.key === 'Enter' && load(s)}>
                  <td>{formatDateTime(s.startsAt, { tz: timezone, locale })}</td>
                  <td>{s.serviceName}</td>
                  <td>{s.staffName}</td>
                  <td className="mono">{s.seatsTaken} / {s.capacity}</td>
                  <td>{formatMoney(s.priceMinor, 'SAR', locale)}</td>
                  <td><span className="badge">{s.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {creating && (
        <Drawer title={t('growth.groups.add')} onClose={() => setCreating(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const startsAt = wallToUtc(f.date, f.time, timezone).toISOString();
              const r = await create.submit({ serviceId: f.serviceId, staffId: f.staffId, branchId: f.branchId, startsAt, capacity: f.capacity ? Number(f.capacity) : undefined });
              if (r) {
                setCreating(false);
                router.refresh();
              }
            }}
          >
            <ErrorAlert error={create.error} />
            <Field label={t('growth.groups.service')} required>
              {(p) => (
                <select {...p} className="input" value={f.serviceId} onChange={(e) => setF({ ...f, serviceId: e.target.value, staffId: '' })}>
                  {services.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.groupCapacity})</option>)}
                </select>
              )}
            </Field>
            <Field label={t('growth.groups.instructor')} required>
              {(p) => (
                <select {...p} className="input" value={f.staffId} onChange={(e) => setF({ ...f, staffId: e.target.value })} required>
                  <option value="">{t('common.select')}</option>
                  {staffFor.map((s) => <option key={s.id} value={s.id}>{s.displayName}</option>)}
                </select>
              )}
            </Field>
            {branches.length > 1 && (
              <Field label={t('growth.groups.branch')} required>
                {(p) => <select {...p} className="input" value={f.branchId} onChange={(e) => setF({ ...f, branchId: e.target.value })}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>}
              </Field>
            )}
            <div className="grid cols-2" style={{ gap: 10 }}>
              <Field label={t('common.date')} required>{(p) => <input {...p} className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required />}</Field>
              <Field label={`${t('common.time')} (${tzLabel(timezone, locale)})`} required>{(p) => <input {...p} className="input" type="time" step={900} value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} required />}</Field>
            </div>
            <Field label={t('growth.groups.capacity')}>{(p) => <input {...p} className="input" type="number" min={1} value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} />}</Field>
            <div className="form-actions"><button className="btn btn-gold" disabled={create.busy || !f.date || !f.staffId}>{t('common.create')}</button></div>
          </form>
        </Drawer>
      )}
      {open && (
        <Drawer title={`${open.serviceName} — ${formatDateTime(open.startsAt, { tz: timezone, locale })}`} onClose={() => setOpen(null)}>
          <h3>{t('growth.groups.participants')} ({open.seatsTaken}/{open.capacity})</h3>
          {!parts ? (
            <div className="skeleton" style={{ height: 60 }} />
          ) : parts.length === 0 ? (
            <EmptyState icon="users" title={t('common.empty')} />
          ) : (
            <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
              {parts.map((p) => (
                <li key={p.bookingId} className="row between"><span>{p.displayName} <span className="small muted mono">{p.number}</span></span><span className="badge">{p.status} · {p.seats}</span></li>
              ))}
            </ul>
          )}
          {open.status === 'scheduled' && (
            <form
              className="card"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!cust) return;
                if (await join.submit({ tenantCustomerId: cust.id, seats: 1, termsKind: 'on_site' })) {
                  setCust(null);
                  await load(open);
                  router.refresh();
                }
              }}
            >
              <h3>{t('growth.groups.add_participant')}</h3>
              <ErrorAlert error={join.error} />
              <CustomerPicker tenant={tenant} value={cust} onChange={setCust} />
              <div className="form-actions">
                <button className="btn btn-gold btn-sm" disabled={join.busy || !cust}>{t('common.add')}</button>
                <button type="button" className="btn btn-danger btn-sm" onClick={async () => { const reason = prompt(t('growth.reason')); if (!reason) return; await apiFetch(`/api/v1/t/${tenant}/groups/${open.id}/cancel`, { method: 'POST', body: { reason } }); setOpen(null); router.refresh(); }}>
                  {t('growth.groups.cancel')}
                </button>
              </div>
            </form>
          )}
        </Drawer>
      )}
    </section>
  );
}
