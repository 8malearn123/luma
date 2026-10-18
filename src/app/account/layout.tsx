import { AppShell, type NavItem } from '@/components/shell/AppShell';
import { NotificationsBell } from '@/components/shell/NotificationsBell';
import { pageT, requireUser } from '@/server/http/page';

export const dynamic = 'force-dynamic';

/** Central customer account (LUMA surface). Shows only the signed-in person's own data. */
export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const { t } = await pageT(user);
  const nav: NavItem[] = [
    { href: '/account', label: t('account.overview'), icon: 'home', exact: true },
    { href: '/account/bookings', label: t('account.bookings'), icon: 'calendar' },
    { href: '/account/orders', label: t('account.orders'), icon: 'bag' },
    { href: '/account/addresses', label: t('account.addresses'), icon: 'pin' },
    { href: '/account/waitlist', label: t('account.waitlist'), icon: 'clock' },
    { href: '/account/notifications', label: t('account.notifications'), icon: 'bell' },
    { href: '/account/consents', label: t('account.consents'), icon: 'mega' },
    { href: '/account/appeals', label: t('account.appeals'), icon: 'shield' },
    { href: '/account/security', label: t('account.security'), icon: 'lock' },
  ];
  return (
    <AppShell title={t('account.title')} subtitle={user.displayName} nav={nav} userName={user.displayName} homeHref="/account" topbar={<NotificationsBell allHref="/account/notifications" />}>
      {children}
    </AppShell>
  );
}
