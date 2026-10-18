import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageT, requireUser } from '@/server/http/page';
import { myBookingDetail } from '@/server/booking/customer';
import { AppError } from '@/server/errors';
import { formatDateTime, formatMoney, tzLabel } from '@/lib/format';
import { BookingActions } from '@/components/account/BookingActions';
import { PaymentStatusPoller } from '@/components/booking/PaymentStatusPoller';

export default async function MyBookingDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ payment?: string }> }) {
  const { id } = await params;
  const { payment } = await searchParams;
  const user = await requireUser();
  const { t, locale } = await pageT(user);
  let d;
  try {
    d = await myBookingDetail(user.userId, id);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const b = d.booking;
  const tz = d.tenant.timezone;
  const m = (x: number) => formatMoney(x, 'SAR', locale);
  const ownPayment = payment && d.payments.some((p) => p.id === payment) ? payment : null;
  const pending = d.payments.some((p) => p.status === 'processing' || p.status === 'pending');
  return (
    <>
      <div className="crumbs">
        <Link href="/account/bookings">{t('account.bookings')}</Link>
      </div>
      <div className="page-head">
        <div>
          <h1>{t('account.booking_detail')}</h1>
          <div className="muted small">
            <Link href={`/s/${d.tenant.slug}`}>{d.tenant.name}</Link> · <span className="mono">{b.number}</span>
          </div>
        </div>
        <div className="row">
          <span className="badge gold">{t(`booking.status.${b.status}`)}</span>
          <span className="badge">{t(`booking.fin.${b.financialStatus}`)}</span>
        </div>
      </div>
      {(ownPayment || (pending && b.status === 'pending_payment')) && <PaymentStatusPoller paymentId={ownPayment ?? undefined} bookingId={ownPayment ? undefined : b.id} />}
      <div className="grid cols-2">
        <section className="card">
          <h2>{formatDateTime(b.startsAt, { tz, locale, dateStyle: 'full' })}</h2>
          <p className="small muted">{tzLabel(tz, locale)}</p>
          <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
            {d.items
              .filter((i) => i.status === 'active')
              .map((i) => (
                <li key={i.id as string} className="row between">
                  <span>
                    {formatDateTime(i.startsAt as Date, { tz, locale, timeOnly: true })} — {(locale === 'en' && (i.serviceNameEn as string)) || (i.serviceName as string)}
                    {i.variantName ? ` (${i.variantName as string})` : ''} · {i.staffName as string}
                  </span>
                  <span>{m((i.priceMinor as number) + (i.addonsMinor as number))}</span>
                </li>
              ))}
          </ul>
          <hr className="divider" />
          <div className="row between"><span>{t('booking.total')}</span><strong>{m(b.totalMinor)}</strong></div>
          <div className="row between small"><span>{t('account.payments')}</span><span>{m(b.paidMinor)}</span></div>
          {b.refundedMinor > 0 && <div className="row between small"><span>{t('account.refunds')}</span><span>{m(b.refundedMinor)}</span></div>}
          {b.explanationKey && <p className="small muted">{t(b.explanationKey)}</p>}
          {b.policyText && (
            <details>
              <summary className="small">{t('booking.policy')}</summary>
              <p className="small" style={{ whiteSpace: 'pre-line' }}>{b.policyText}</p>
            </details>
          )}
        </section>
        <section className="card">
          <BookingActions
            booking={{ id: b.id, status: b.status, version: b.version, totalMinor: b.totalMinor, paidMinor: b.paidMinor, refundedMinor: b.refundedMinor, paymentTerms: b.paymentTerms, holdExpiresAt: b.holdExpiresAt ? new Date(b.holdExpiresAt).toISOString() : null, startsAt: new Date(b.startsAt).toISOString() }}
            tenantSlug={d.tenant.slug}
            timezone={tz}
            allowed={d.allowed}
            refundPreviewMinor={d.cancelRefundPreviewMinor}
          />
          <h3 style={{ marginTop: 18 }}>{t('account.timeline')}</h3>
          <ol className="small stack" style={{ paddingInlineStart: 18 }}>
            {d.events.map((e, i) => (
              <li key={i}>
                {formatDateTime(e.at as Date, { tz, locale })} — {e.kind === 'reschedule' ? t('account.reschedule') : e.toStatus ? t(`booking.status.${e.toStatus}`) : e.kind}
              </li>
            ))}
          </ol>
          {d.payments.length > 0 && (
            <>
              <h3>{t('account.payments')}</h3>
              <ul className="small stack" style={{ listStyle: 'none', padding: 0 }}>
                {d.payments.map((p) => (
                  <li key={p.id as string} className="row between">
                    <span>{t(`booking.term.${p.kind === 'balance' ? 'full' : (p.kind as string)}`)}</span>
                    <span>{m(p.amountMinor as number)} · {p.status as string}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {d.refunds.length > 0 && (
            <>
              <h3>{t('account.refunds')}</h3>
              <ul className="small stack" style={{ listStyle: 'none', padding: 0 }}>
                {d.refunds.map((r) => (
                  <li key={r.id as string} className="row between">
                    <span>{formatDateTime(r.createdAt as Date, { tz, locale, dateOnly: true })}</span>
                    <span>{m(r.amountMinor as number)} · {r.status === 'succeeded' ? t('booking.fin.refunded') : t('booking.fin.refund_pending')}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </>
  );
}
