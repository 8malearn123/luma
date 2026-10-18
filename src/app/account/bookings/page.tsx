import Link from 'next/link';
import { pageT, requireUser } from '@/server/http/page';
import { myBookings } from '@/server/booking/customer';
import { BookingCards } from '@/components/account/BookingCards';

export default async function MyBookingsPage({ searchParams }: { searchParams: Promise<{ scope?: string }> }) {
  const user = await requireUser();
  const { t } = await pageT(user);
  const sp = await searchParams;
  const scope = sp.scope === 'past' || sp.scope === 'all' ? sp.scope : 'upcoming';
  const items = await myBookings(user.userId, { scope });
  return (
    <>
      <div className="page-head">
        <h1>{t('account.bookings')}</h1>
      </div>
      <div className="tabs" role="tablist">
        {(['upcoming', 'past', 'all'] as const).map((s) => (
          <Link key={s} role="tab" aria-selected={scope === s} className="tab" href={`/account/bookings?scope=${s}`}>
            {t(`account.${s}`)}
          </Link>
        ))}
      </div>
      <BookingCards items={items} grouped />
    </>
  );
}
