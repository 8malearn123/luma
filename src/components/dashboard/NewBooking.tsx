'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/client/api';
import { formatDateTime, formatDuration, formatMoney } from '@/lib/format';
import { useLocale, useT } from '../I18n';
import { Drawer, ErrorAlert, Field, useSubmit } from '../ui/forms';
import { useToast } from '../ui/Toast';
import { Icon } from '../Icon';

export interface Opt {
  id: string;
  name: string;
}

interface Slot {
  startsAt: string;
  totalGapMin: number;
  totalDurationMin: number;
  totalPriceMinor: number;
  items: { serviceId: string; staffId: string; staffName: string; startsAt: string; endsAt: string }[];
}
interface Avail {
  timezone: string;
  days: { date: string; slots: Slot[] }[];
  reason?: string;
}

function useSlots(tenant: string) {
  const [data, setData] = useState<Avail | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<import('@/lib/client/api').ApiError | null>(null);
  const find = async (body: unknown) => {
    setBusy(true);
    setError(null);
    try {
      setData(await apiFetch<Avail>(`/api/v1/t/${tenant}/bookings/availability`, { method: 'POST', body }));
    } catch (e) {
      setError(e as import('@/lib/client/api').ApiError);
      setData(null);
    } finally {
      setBusy(false);
    }
  };
  return { data, busy, error, find, clear: () => setData(null) };
}

function SlotPicker({ avail, value, onPick, tz }: { avail: Avail; value: Slot | null; onPick: (s: Slot) => void; tz: string }) {
  const t = useT();
  const locale = useLocale();
  const slots = avail.days[0]?.slots ?? [];
  if (avail.reason === 'no_qualified_staff') return <div className="alert warn">{t('bk.no_staff')}</div>;
  if (!slots.length) return <div className="alert info">{t('bk.no_slots')}</div>;
  return (
    <div className="slot-grid" role="listbox" aria-label={t('common.time')}>
      {slots.map((s) => (
        <button key={s.startsAt} type="button" role="option" className="slot" aria-pressed={value?.startsAt === s.startsAt} aria-selected={value?.startsAt === s.startsAt}
          onClick={() => onPick(s)} title={s.items.map((i) => i.staffName).join(' → ')}>
          {formatDateTime(s.startsAt, { tz, locale, timeOnly: true })}
          {s.totalGapMin > 0 && <div className="small muted">{t('bk.gap', { n: s.totalGapMin })}</div>}
        </button>
      ))}
    </div>
  );
}

/** Staff booking flow: tenant-local customer lookup (never LUMA account enumeration) → services → time → terms. */
export function NewBookingDrawer({ tenant, tz, branches, services, staff, defaultDate, onClose, onCreated }: {
  tenant: string; tz: string; branches: Opt[]; services: Opt[]; staff: Opt[]; defaultDate: string; onClose: () => void; onCreated: (id: string) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<{ id: string; displayName: string; phone: string | null; hasAccount: boolean }[]>([]);
  const [customer, setCustomer] = useState<{ id: string; name: string } | null>(null);
  const [walkIn, setWalkIn] = useState<{ displayName: string; phone: string } | null>(null);
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [items, setItems] = useState<{ serviceId: string; staffId: string }[]>([{ serviceId: services[0]?.id ?? '', staffId: '' }]);
  const [date, setDate] = useState(defaultDate);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [terms, setTerms] = useState<'on_site' | 'full' | 'deposit' | 'manual_approval'>('on_site');
  const [note, setNote] = useState('');
  const slots = useSlots(tenant);
  const walk = useSubmit<unknown, { id: string }>(`/api/v1/t/${tenant}/customers`);
  const create = useSubmit<unknown, { bookingId: string; status: string }>(`/api/v1/t/${tenant}/bookings`);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const ctl = new AbortController();
    const h = setTimeout(() => {
      apiFetch<{ items: typeof results }>(`/api/v1/t/${tenant}/customers/search?q=${encodeURIComponent(q)}`, { signal: ctl.signal }).then((r) => setResults(r.items)).catch(() => {});
    }, 250);
    return () => {
      clearTimeout(h);
      ctl.abort();
    };
  }, [q, tenant]);

  const request = () => ({ branchId, from: date, days: 1, items: items.map((i) => ({ serviceId: i.serviceId, staffId: i.staffId || null, addonIds: [] })) });

  async function submit() {
    let custId = customer?.id;
    if (!custId && walkIn) {
      const r = await walk.submit({ displayName: walkIn.displayName, phone: walkIn.phone || null });
      if (!r) return;
      custId = r.id;
      setCustomer({ id: r.id, name: walkIn.displayName });
      setWalkIn(null);
    }
    if (!custId || !slot) return;
    const r = await create.submit({
      branchId,
      tenantCustomerId: custId,
      termsKind: terms,
      customerNote: note || undefined,
      items: slot.items.map((i, idx) => ({ serviceId: i.serviceId, staffId: i.staffId, startsAt: i.startsAt, addonIds: [], variantId: null, _k: idx })).map(({ _k, ...x }) => x),
      source: 'staff',
      confirmNow: true,
    });
    if (r) {
      toast(t('bk.created'), 'ok');
      onCreated(r.bookingId);
    }
  }

  const allowedTerms = (create.error?.details as { allowed?: string[] } | undefined)?.allowed;
  return (
    <Drawer title={t('bk.new')} onClose={onClose}>
      <div className="stack">
        <fieldset>
          <legend>{t('bk.customer')}</legend>
          {customer ? (
            <div className="row between"><strong>{customer.name}</strong><button type="button" className="btn btn-quiet btn-sm" onClick={() => setCustomer(null)}>{t('common.edit')}</button></div>
          ) : walkIn ? (
            <>
              <Field label={t('common.name')} required>{(p) => <input {...p} className="input" value={walkIn.displayName} onChange={(e) => setWalkIn({ ...walkIn, displayName: e.target.value })} />}</Field>
              <Field label={t('onb.phone')}>{(p) => <input {...p} className="input input-ltr" inputMode="tel" value={walkIn.phone} onChange={(e) => setWalkIn({ ...walkIn, phone: e.target.value })} />}</Field>
              <button type="button" className="btn btn-quiet btn-sm" onClick={() => setWalkIn(null)}>{t('common.back')}</button>
            </>
          ) : (
            <>
              <Field label={t('common.search')} hint={t('bk.find_customer')}>
                {(p) => <input {...p} className="input" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />}
              </Field>
              <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {results.map((r) => (
                  <li key={r.id}>
                    <button type="button" className="btn btn-sm" style={{ width: '100%', justifyContent: 'space-between' }} onClick={() => setCustomer({ id: r.id, name: r.displayName })}>
                      <span>{r.displayName} <span className="mono small">{r.phone}</span></span>
                      {r.hasAccount && <span className="badge">{t('bk.has_account')}</span>}
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setWalkIn({ displayName: q, phone: '' })}><Icon name="plus" size={14} /> {t('bk.walk_in')}</button>
            </>
          )}
        </fieldset>

        <fieldset>
          <legend>{t('bk.services')}</legend>
          {branches.length > 1 && (
            <Field label={t('st.branches')} required>
              {(p) => <select {...p} className="input" value={branchId} onChange={(e) => { setBranchId(e.target.value); slots.clear(); setSlot(null); }}>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>}
            </Field>
          )}
          {items.map((it, i) => (
            <div key={i} className="grid cols-2" style={{ gap: 8, marginBottom: 8 }}>
              <select className="input" aria-label={t('bk.pick_service')} value={it.serviceId} onChange={(e) => { const n = [...items]; n[i] = { ...it, serviceId: e.target.value }; setItems(n); slots.clear(); setSlot(null); }}>
                {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <select className="input" aria-label={t('bk.staff')} value={it.staffId} onChange={(e) => { const n = [...items]; n[i] = { ...it, staffId: e.target.value }; setItems(n); slots.clear(); setSlot(null); }}>
                  <option value="">{t('bk.any_staff')}</option>
                  {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                {items.length > 1 && <button type="button" className="btn icon-btn" aria-label={t('common.delete')} onClick={() => { setItems(items.filter((_, j) => j !== i)); slots.clear(); setSlot(null); }}><Icon name="x" size={14} /></button>}
              </div>
            </div>
          ))}
          {items.length < 5 && <button type="button" className="btn btn-quiet btn-sm" onClick={() => setItems([...items, { serviceId: services[0]?.id ?? '', staffId: '' }])}><Icon name="plus" size={14} /> {t('bk.add_service')}</button>}
        </fieldset>

        <fieldset>
          <legend>{t('bk.when')}</legend>
          <div className="row">
            <input type="date" className="input" style={{ maxWidth: 200 }} aria-label={t('bk.pick_date')} value={date} onChange={(e) => { setDate(e.target.value); slots.clear(); setSlot(null); }} />
            <button type="button" className="btn btn-ghost btn-sm" disabled={slots.busy || !items.every((i) => i.serviceId)} onClick={() => slots.find(request())}>{t('bk.find_slots')}</button>
          </div>
          <ErrorAlert error={slots.error} />
          {slots.busy && <div className="skeleton" style={{ height: 60, marginTop: 8 }} />}
          {slots.data && <div style={{ marginTop: 8 }}><SlotPicker avail={slots.data} value={slot} onPick={setSlot} tz={tz} /></div>}
          {slot && (
            <div className="alert info" style={{ marginTop: 8 }}>
              <div>{slot.items.map((i) => `${formatDateTime(i.startsAt, { tz, locale, timeOnly: true })} ${i.staffName}`).join(' → ')}</div>
              <div className="small">{formatDuration(slot.totalDurationMin, locale)} · {formatMoney(slot.totalPriceMinor, 'SAR', locale)}{slot.totalGapMin ? ` · ${t('bk.gap', { n: slot.totalGapMin })}` : ''}</div>
            </div>
          )}
        </fieldset>

        <Field label={t('bk.terms')} hint={allowedTerms ? allowedTerms.map((k) => t(`terms.${k}`)).join('، ') : undefined}>
          {(p) => (
            <select {...p} className="input" value={terms} onChange={(e) => setTerms(e.target.value as typeof terms)}>
              {(['on_site', 'full', 'deposit', 'manual_approval'] as const).map((k) => <option key={k} value={k} disabled={!!allowedTerms && !allowedTerms.includes(k)}>{t(`terms.${k}`)}</option>)}
            </select>
          )}
        </Field>
        <Field label={t('bk.customer_note')}>{(p) => <textarea {...p} className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />}</Field>
        <ErrorAlert error={walk.error ?? create.error} />
        <div className="form-actions">
          <button type="button" className="btn btn-quiet" onClick={onClose}>{t('common.cancel')}</button>
          <button type="button" className="btn btn-gold" disabled={create.busy || walk.busy || !slot || (!customer && !walkIn?.displayName.trim())} onClick={submit}>{t('bk.create')}</button>
        </div>
      </div>
    </Drawer>
  );
}

/** Reschedule: same services, choose a new time; the original stays intact unless the replacement is secured. */
export function RescheduleForm({ tenant, tz, booking, items, onDone }: {
  tenant: string; tz: string; booking: { id: string; version: number; branchId: string; startsAt: string }; items: { serviceId: string; variantId: string | null; staffId: string }[]; onDone: () => void;
}) {
  const t = useT();
  const locale = useLocale();
  const [date, setDate] = useState(booking.startsAt.slice(0, 10));
  const [slot, setSlot] = useState<Slot | null>(null);
  const [acceptPrice, setAcceptPrice] = useState(false);
  const slots = useSlots(tenant);
  const r = useSubmit<unknown, { totalMinor: number }>(`/api/v1/t/${tenant}/bookings/${booking.id}/reschedule`);
  const priceChange = r.error?.message === 'errors.reschedule_price_changed' ? (r.error.details as { previousTotalMinor: number; newTotalMinor: number }) : null;
  return (
    <div className="card stack">
      <div className="row">
        <input type="date" className="input" style={{ maxWidth: 200 }} aria-label={t('bk.pick_date')} value={date} onChange={(e) => { setDate(e.target.value); setSlot(null); slots.clear(); }} />
        <button type="button" className="btn btn-ghost btn-sm" disabled={slots.busy} onClick={() => slots.find({ branchId: booking.branchId, from: date, days: 1, items: items.map((i) => ({ serviceId: i.serviceId, variantId: i.variantId, staffId: null, addonIds: [] })) })}>{t('bk.find_slots')}</button>
      </div>
      <ErrorAlert error={slots.error} />
      {slots.data && <SlotPicker avail={slots.data} value={slot} onPick={setSlot} tz={tz} />}
      {priceChange && (
        <label className="check">
          <input type="checkbox" checked={acceptPrice} onChange={(e) => setAcceptPrice(e.target.checked)} />
          {formatMoney(priceChange.previousTotalMinor, 'SAR', locale)} → {formatMoney(priceChange.newTotalMinor, 'SAR', locale)}
        </label>
      )}
      {r.error && !priceChange && <ErrorAlert error={r.error} />}
      <button type="button" className="btn btn-gold btn-sm" disabled={!slot || r.busy || (!!priceChange && !acceptPrice)} onClick={async () => {
        if (!slot) return;
        const res = await r.submit({ expectedVersion: booking.version, acceptPriceChange: acceptPrice, items: slot.items.map((i, k) => ({ serviceId: i.serviceId, variantId: items[k]?.variantId ?? null, staffId: i.staffId, startsAt: i.startsAt, addonIds: [] })) });
        if (res) onDone();
      }}>{t('bk.reschedule')}</button>
    </div>
  );
}
