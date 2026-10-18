import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageT, requireUser } from '@/server/http/page';
import { myOrderDetail } from '@/server/booking/customer';
import { AppError } from '@/server/errors';
import { formatDateTime, formatMoney } from '@/lib/format';
import { PaymentStatusPoller } from '@/components/booking/PaymentStatusPoller';

export default async function MyOrderDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ payment?: string }> }) {
  const { id } = await params;
  const { payment } = await searchParams;
  const user = await requireUser();
  const { t, locale } = await pageT(user);
  let d;
  try {
    d = await myOrderDetail(user.userId, id);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const o = d.order;
  const m = (x: number) => formatMoney(x, 'SAR', locale);
  const ownPayment = payment && d.payments.some((p) => p.id === payment) ? payment : null;
  return (
    <>
      <div className="crumbs"><Link href="/account/orders">{t('account.orders')}</Link></div>
      <div className="page-head">
        <div>
          <h1>{t('account.order_detail')}</h1>
          <div className="small muted">{d.tenant.name as string} · <span className="mono">{o.number as string}</span></div>
        </div>
        <div className="row">
          <span className="badge gold">{t(`order.status.${o.status}`)}</span>
          {o.refundStatus !== 'none' && <span className="badge amber">{t(`order.refund.${o.refundStatus}`)}</span>}
        </div>
      </div>
      {ownPayment && <PaymentStatusPoller paymentId={ownPayment} />}
      <div className="card">
        <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
          {d.items.map((i, k) => (
            <li key={k} className="row between">
              <span>{i.name as string}{i.variantName ? ` — ${i.variantName as string}` : ''} × {i.quantity as number}</span>
              <span>{m(i.lineTotalMinor as number)}</span>
            </li>
          ))}
        </ul>
        <hr className="divider" />
        <div className="row between"><span>{t('common.total')}</span><strong>{m(o.totalMinor as number)}</strong></div>
        <div className="row between small"><span>{t('account.payments')}</span><span>{m(o.paidMinor as number)}</span></div>
        {d.branch && <p className="small">{t('account.pickup_at', { branch: `${d.branch.name as string}${d.branch.address ? ` — ${d.branch.address as string}` : ''}` })}</p>}
        {o.status === 'pending_payment' && o.holdExpiresAt && (
          <p className="small muted">{t('checkout.reserved_until', { time: formatDateTime(o.holdExpiresAt as Date, { tz: d.tenant.timezone as string, locale }) })}</p>
        )}
      </div>
    </>
  );
}
