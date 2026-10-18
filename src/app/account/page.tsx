import Link from 'next/link';
import { pageT, requireUser } from '@/server/http/page';
import { myBookings } from '@/server/booking/customer';
import { sql } from '@/server/db';
import { listMyTenants } from '@/server/tenancy/context';
import { ProfileForm } from '@/components/account/ProfileForm';
import { BookingCards } from '@/components/account/BookingCards';

export default async function AccountHome() {
  const user = await requireUser();
  const { t } = await pageT(user);
  const [upcoming, [profile], tenants] = await Promise.all([
    myBookings(user.userId, { scope: 'upcoming' }),
    sql()<{ fullName: string | null; preferredLocale: 'ar' | 'en' | null }[]>`select full_name, preferred_locale from customer_profiles where user_id = ${user.userId}`,
    listMyTenants(user.userId),
  ]);
  return (
    <>
      <div className="page-head">
        <h1>{t('account.hello', { name: user.displayName })}</h1>
        {tenants.length > 0 && (
          <Link className="btn btn-ghost btn-sm" href="/app">
            {t('nav.dashboard')}
          </Link>
        )}
      </div>
      <p className="muted small">{t('account.privacy_note')}</p>
      <div className="grid cols-2">
        <section className="card" aria-labelledby="up-h">
          <div className="row between">
            <h2 id="up-h">{t('account.upcoming')}</h2>
            <Link href="/account/bookings" className="small">{t('common.more')}</Link>
          </div>
          <BookingCards items={upcoming.slice(0, 5)} />
        </section>
        <section className="card" aria-labelledby="pf-h">
          <h2 id="pf-h">{t('account.profile')}</h2>
          <ProfileForm initial={{ fullName: profile?.fullName ?? user.displayName, preferredLocale: profile?.preferredLocale ?? user.locale }} contact={user.email ?? user.phone ?? ''} />
        </section>
      </div>
    </>
  );
}
