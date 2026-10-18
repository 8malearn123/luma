import { withTenant, withUser } from '@/server/db';
import { pageT, requireUser } from '@/server/http/page';
import { myEntries } from '@/server/services/waitlist';
import { MyWaitlist, type MyEntry } from '@/components/growth/MyWaitlist';

export const dynamic = 'force-dynamic';

/**
 * Customer's waitlists across businesses. Discovery uses the customer's own-row
 * RLS policy; details are then read inside each business's scope, filtered to
 * her own entries — no other customer's data is ever loaded.
 */
export default async function MyWaitlistPage() {
  const user = await requireUser();
  const { t } = await pageT(user);
  const tenants = await withUser(user.userId, (tx) =>
    tx<{ tenantId: string }[]>`select distinct tenant_id from waitlist_entries where customer_user_id = ${user.userId} and status in ('active','offered')`,
  );
  const items: MyEntry[] = [];
  for (const { tenantId } of tenants) {
    const rows = await withTenant({ tenantId, userId: user.userId }, (tx) => myEntries(tx, user.userId));
    items.push(...(JSON.parse(JSON.stringify(rows)) as MyEntry[]));
  }
  return (
    <div>
      <h1>{t('growth.wl.mine_title')}</h1>
      <MyWaitlist items={items} />
    </div>
  );
}
