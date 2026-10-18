import { pageT, requireUser } from '@/server/http/page';
import { NotificationCenter } from '@/components/account/NotificationCenter';

export default async function NotificationsPage() {
  const user = await requireUser();
  const { t } = await pageT(user);
  return (
    <>
      <div className="page-head"><h1>{t('account.notifications')}</h1></div>
      <NotificationCenter />
    </>
  );
}
