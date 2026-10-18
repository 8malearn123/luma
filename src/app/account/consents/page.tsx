import { pageT, requireUser } from '@/server/http/page';
import { myConsents } from '@/server/booking/customer';
import { ConsentsForm } from '@/components/account/ConsentsForm';
import { EmptyState } from '@/components/ui/forms';

export default async function ConsentsPage() {
  const user = await requireUser();
  const { t } = await pageT(user);
  const items = await myConsents(user.userId);
  return (
    <>
      <div className="page-head"><h1>{t('account.consents')}</h1></div>
      <p className="muted">{t('account.consents_intro')}</p>
      {items.length === 0 ? <EmptyState icon="mega" title={t('account.no_relationships')} /> : <ConsentsForm items={items} />}
    </>
  );
}
