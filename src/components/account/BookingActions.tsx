'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError, apiFetch, newIdempotencyKey } from '@/lib/client/api';
import { formatDateTime, formatMoney, localDate } from '@/lib/format';
import { useLocale, useT } from '../I18n';
import { Drawer, ErrorAlert, Field, useSubmit } from '../ui/forms';
import { useToast } from '../ui/Toast';

interface B {
  id: string;
  status: string;
  version: number;
  totalMinor: number;
  paidMinor: number;
  refundedMinor: number;
  paymentTerms: string;
  holdExpiresAt: string | null;
  startsAt: string;
}
interface Slot {
  startsAt: string;
  totalPriceMinor: number;
  items: { key: number; serviceId: string; staffId: string; staffName: string; startsAt: string }[];
}
interface Avail {
  timezone: string;
  days: { date: string; slots: Slot[] }[];
  reason: string | null;
  items: { serviceId: string; variantId: string | null; addonIds: string[] }[];
}

export function BookingActions({ booking, tenantSlug, timezone, allowed, refundPreviewMinor }: { booking: B; tenantSlug: string; timezone: string; allowed: string[]; refundPreviewMinor: number }) {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const m = (x: number) => formatMoney(x, 'SAR', locale);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const cancel = useSubmit<{ reason?: string }, { refundDueMinor: number }>(`/api/v1/me/bookings/${booking.id}/cancel`);
  const [resOpen, setResOpen] = useState(false);
  const [payErr, setPayErr] = useState<ApiError | null>(null);
  const [payBusy, setPayBusy] = useState(false);

  const canCancel = allowed.includes('cancelled');
  const canReschedule = booking.status === 'confirmed' || booking.status === 'held';
  const needsPay = (booking.status === 'held' || booking.status === 'pending_payment') && (booking.paymentTerms === 'full' || booking.paymentTerms === 'deposit');

  async function pay() {
    setPayBusy(true);
    setPayErr(null);
    try {
      const r = await apiFetch<{ checkoutUrl: string | null }>(`/api/v1/s/${tenantSlug}/holds/${booking.id}/pay`, { method: 'POST', body: {}, idempotencyKey: newIdempotencyKey() });
      if (r.checkoutUrl) window.location.href = r.checkoutUrl;
    } catch (e) {
      setPayErr(e as ApiError);
    } finally {
      setPayBusy(false);
    }
  }

  return (
    <div className="stack">
      {payErr && <ErrorAlert error={payErr} />}
      <div className="row">
        {needsPay && (
          <button className="btn btn-gold" disabled={payBusy} onClick={pay}>
            {t('account.pay_outstanding')}
          </button>
        )}
        {canReschedule && (
          <button className="btn btn-ghost" onClick={() => setResOpen(true)}>
            {t('account.reschedule')}
          </button>
        )}
        {canCancel && (
          <button className="btn btn-danger" onClick={() => setCancelOpen(true)}>
            {t('account.cancel_booking')}
          </button>
        )}
      </div>
      {cancelOpen && (
        <Drawer
          title={t('account.cancel_confirm_title')}
          onClose={() => setCancelOpen(false)}
          footer={
            <div className="row" style={{ width: '100%', justifyContent: 'flex-end' }}>
              <button className="btn btn-quiet" onClick={() => setCancelOpen(false)}>{t('common.back')}</button>
              <button
                className="btn btn-danger"
                disabled={cancel.busy}
                onClick={async () => {
                  const r = await cancel.submit({ reason: reason || undefined });
                  if (r) {
                    setCancelOpen(false);
                    toast(r.refundDueMinor > 0 ? t('account.refund_started', { amount: m(r.refundDueMinor) }) : t('account.cancelled_ok'), 'ok');
                    router.refresh();
                  }
                }}
              >
                {t('common.confirm')}
              </button>
            </div>
          }
        >
          <ErrorAlert error={cancel.error} />
          <p>{booking.paidMinor - booking.refundedMinor > 0 ? t('account.cancel_refund_preview', { amount: m(refundPreviewMinor) }) : t('account.cancel_no_payment')}</p>
          <Field label={t('account.cancel_reason')}>
            {(p) => <textarea {...p} className="input" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />}
          </Field>
        </Drawer>
      )}
      {resOpen && <RescheduleDrawer booking={booking} timezone={timezone} onClose={() => setResOpen(false)} onDone={() => { setResOpen(false); toast(t('account.rescheduled_ok'), 'ok'); router.refresh(); }} />}
    </div>
  );
}

function RescheduleDrawer({ booking, timezone, onClose, onDone }: { booking: B; timezone: string; onClose: () => void; onDone: () => void }) {
  const t = useT();
  const locale = useLocale();
  const m = (x: number) => formatMoney(x, 'SAR', locale);
  const [from, setFrom] = useState(localDate(new Date(), timezone));
  const [keepStaff, setKeepStaff] = useState(true);
  const [avail, setAvail] = useState<Avail | null>(null);
  const [err, setErr] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [acceptPrice, setAcceptPrice] = useState(false);
  const submit = useSubmit<unknown, { version: number }>(`/api/v1/me/bookings/${booking.id}/reschedule`);
  const search = async () => {
    setLoading(true);
    setErr(null);
    setSlot(null);
    try {
      setAvail(await apiFetch<Avail>(`/api/v1/me/bookings/${booking.id}/availability`, { method: 'POST', body: { from, days: 7, keepStaff } }));
    } catch (e) {
      setErr(e as ApiError);
    } finally {
      setLoading(false);
    }
  };
  const priceDiffers = slot && slot.totalPriceMinor !== booking.totalMinor;
  return (
    <Drawer
      title={t('account.reschedule')}
      onClose={onClose}
      footer={
        <div className="row" style={{ width: '100%', justifyContent: 'flex-end' }}>
          <button className="btn btn-quiet" onClick={onClose}>{t('common.cancel')}</button>
          <button
            className="btn btn-gold"
            disabled={!slot || submit.busy || (!!priceDiffers && !acceptPrice)}
            onClick={async () => {
              if (!slot || !avail) return;
              const items = slot.items.map((it) => ({ ...avail.items[it.key], staffId: it.staffId, startsAt: it.startsAt }));
              const r = await submit.submit({ items, acceptPriceChange: acceptPrice, expectedVersion: booking.version });
              if (r) onDone();
            }}
          >
            {t('account.reschedule_confirm')}
          </button>
        </div>
      }
    >
      <ErrorAlert error={err ?? submit.error} />
      <div className="row">
        <input type="date" className="input" style={{ maxWidth: 180 }} aria-label={t('common.date')} value={from} min={localDate(new Date(), timezone)} onChange={(e) => setFrom(e.target.value)} />
        <label className="check">
          <input type="checkbox" checked={keepStaff} onChange={(e) => setKeepStaff(e.target.checked)} /> {t('account.reschedule_keep_staff')}
        </label>
        <button className="btn btn-ghost btn-sm" onClick={search} disabled={loading}>{t('common.search')}</button>
      </div>
      {loading && <p className="muted">{t('booking.loading_slots')}</p>}
      {avail?.reason && <div className="alert warn">{t('booking.no_slots_range')} {t('booking.no_slots_hint')}</div>}
      {avail?.days
        .filter((d) => d.slots.length)
        .map((d) => (
          <div key={d.date} style={{ marginTop: 12 }}>
            <div className="small muted">{formatDateTime(`${d.date}T12:00:00Z`, { tz: 'UTC', locale, dateOnly: true, dateStyle: 'full' })}</div>
            <div className="slot-grid" style={{ marginTop: 6 }}>
              {d.slots.map((s) => (
                <button key={s.startsAt} type="button" className="slot" aria-pressed={slot?.startsAt === s.startsAt} onClick={() => { setSlot(s); setAcceptPrice(false); }}>
                  {formatDateTime(s.startsAt, { tz: timezone, locale, timeOnly: true })}
                </button>
              ))}
            </div>
          </div>
        ))}
      {slot && (
        <div className="card" style={{ marginTop: 12 }}>
          {slot.items.map((it) => (
            <div key={it.key} className="small">
              {formatDateTime(it.startsAt, { tz: timezone, locale, timeOnly: true })} · {it.staffName}
            </div>
          ))}
          <div className="row between"><span>{t('booking.total')}</span><strong>{m(slot.totalPriceMinor)}</strong></div>
          {priceDiffers && (
            <label className="check">
              <input type="checkbox" checked={acceptPrice} onChange={(e) => setAcceptPrice(e.target.checked)} /> {t('account.reschedule_price_confirm', { amount: m(slot.totalPriceMinor) })}
            </label>
          )}
        </div>
      )}
    </Drawer>
  );
}
