import { AddressBook } from '@/components/account/AddressBook';
import { pageT, requireUser } from '@/server/http/page';

export default async function AddressesPage() {
  const user = await requireUser();
  const { t } = await pageT(user);
  return (
    <>
      <div className="page-head"><h1>{t('account.addresses')}</h1></div>
      <AddressBook />
    </>
  );
}
