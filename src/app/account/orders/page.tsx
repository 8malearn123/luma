import Link from 'next/link';
import { pageT, requireUser } from '@/server/http/page';
import { myOrders } from '@/server/booking/customer';
import { formatDateTime, formatMoney } from '@/lib/format';
import { EmptyState } from '@/components/ui/forms';

export default async function MyOrdersPage() {
  const user = await requireUser();
  const { t, locale } = await pageT(user);
  const items = await myOrders(user.userId);
  return (
    <>
      <div className="page-head"><h1>{t('account.orders')}</h1></div>
      {items.length === 0 ? (
        <EmptyState icon="bag" title={t('account.no_orders')} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>{t('booking.number')}</th><th>{t('account.business')}</th><th>{t('common.date')}</th><th>{t('common.total')}</th><th>{t('common.status')}</th></tr>
            </thead>
            <tbody>
              {items.map((o) => (
                <tr key={o.id as string}>
                  <td className="mono"><Link href={`/account/orders/${o.id}`}>{o.number as string}</Link></td>
                  <td>{o.tenantName as string}</td>
                  <td>{formatDateTime(o.createdAt as Date, { locale, dateOnly: true })}</td>
                  <td>{formatMoney(o.totalMinor as number, o.currency as string, locale)}</td>
                  <td>
                    <span className="badge">{t(`order.status.${o.status}`)}</span> {o.refundStatus !== 'none' && <span className="badge amber">{t(`order.refund.${o.refundStatus}`)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
