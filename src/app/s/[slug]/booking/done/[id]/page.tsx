import Link from 'next/link';
import { notFound } from 'next/navigation';
import { myBookingDetail } from '@/server/booking/customer';
import { pageT, requireUser } from '@/server/http/page';
import { AppError } from '@/server/errors';
import { formatDateTime, formatMoney, tzLabel } from '@/lib/format';
import { PaymentStatusPoller } from '@/components/booking/PaymentStatusPoller';

export const dynamic = 'force-dynamic';

/** Confirmation page — reads the booking from the server, never from the URL. */
export default async function BookingDone({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const user = await requireUser();
  const { t, locale } = await pageT(user);
  let d;
  try {
    d = await myBookingDetail(user.userId, id);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  if (d.tenant.slug !== slug) notFound();
  const b = d.booking;
  const tz = d.tenant.timezone;
  const title = b.status === 'confirmed' ? 'booking.confirmed_title' : b.paymentTerms === 'manual_approval' ? 'booking.requested_title' : b.status === 'pending_payment' ? 'booking.pending_title' : `booking.status.${b.status}`;
  return (
    <div className="sf-container sf-section">
      <h1 className="sf-h1">{t(title)}</h1>
      {b.status === 'pending_payment' && <PaymentStatusPoller bookingId={b.id} />}
      <div className="sf-card">
        <p>
          {t('booking.number')}: <strong style={{ direction: 'ltr', unicodeBidi: 'isolate' }}>{b.number}</strong>
        </p>
        <p>
          {formatDateTime(b.startsAt, { tz, locale, dateStyle: 'full' })} <span className="sf-muted">({tzLabel(tz, locale)})</span>
        </p>
        <ul className="sf-list">
          {d.items
            .filter((i) => i.status === 'active')
            .map((i) => (
              <li key={i.id as string}>
                {formatDateTime(i.startsAt as Date, { tz, locale, timeOnly: true })} — {(locale === 'en' && i.serviceNameEn) || i.serviceName} · {i.staffName}
              </li>
            ))}
        </ul>
        <p>
          {t('booking.total')}: <strong>{formatMoney(b.totalMinor, 'SAR', locale)}</strong> · {t(`booking.fin.${b.financialStatus}`)}
        </p>
      </div>
      <div className="sf-actions">
        <Link className="sf-btn-secondary" href={`/s/${slug}/booking`}>
          {t('booking.book_another')}
        </Link>
        <Link className="sf-btn" href={`/account/bookings/${b.id}`}>
          {t('booking.view_in_account')}
        </Link>
      </div>
    </div>
  );
}
