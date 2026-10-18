import Link from 'next/link';
import { notFound } from 'next/navigation';
import { pageT, requireUser } from '@/server/http/page';
import { myOrderDetail } from '@/server/booking/customer';
import { AppError } from '@/server/errors';
import { formatDateTime, formatMoney } from '@/lib/format';
import { PaymentStatusPoller } from '@/components/booking/PaymentStatusPoller';
import { OrderReturns } from '@/components/account/OrderReturns';

const PICKUP_STEPS = ['placed', 'ready', 'collected'];
const DELIVERY_STEPS = ['placed', 'ready', 'out_for_delivery', 'delivered'];
const DONE_AT: Record<string, number> = { pending: 0, ready: 1, out_for_delivery: 2, failed_attempt: 2, collected: 2, delivered: 3 };

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
  const tz = d.tenant.timezone as string;
  const m = (x: number) => formatMoney(x, 'SAR', locale);
  const ownPayment = payment && d.payments.some((p) => p.id === payment) ? payment : null;
  const delivery = o.fulfillmentMethod === 'delivery';
  const addr = o.deliveryAddress as { recipientName: string; phone: string; city: string; district: string | null; street: string; buildingNo: string | null; postalCode: string | null } | null;
  const f = d.fulfillment as { status: string; courierName: string | null; trackingRef: string | null; trackingUrl: string | null } | null;
  const steps = delivery ? DELIVERY_STEPS : PICKUP_STEPS;
  const reached = o.status === 'cancelled' ? -1 : f ? DONE_AT[f.status] ?? 0 : 0;
  const dt = o.deliveryTerms as { etaMinHours?: number; etaMaxHours?: number } | null;
  const w = d.returnWindow;
  const retMoney = Object.fromEntries((d.returns as unknown as { number: string; refundAmountMinor: number | null }[]).map((r) => [r.number, r.refundAmountMinor ? m(r.refundAmountMinor) : '']));
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

      {o.status !== 'cancelled' && (
        <section className="card" aria-label={t('dlv.tracking')}>
          <div className="steps">
            {steps.map((s, i) => <span key={s} data-done={i <= reached}>{t(`tl.${s}`)}</span>)}
          </div>
          {f?.status === 'failed_attempt' && <div className="alert warn small">{t('dlv.failed_attempt_customer')}</div>}
          {delivery && f?.trackingRef && (
            <p className="small">{t('dlv.courier')}: {f.courierName ?? '—'} · <span className="mono">{f.trackingRef}</span>{f.trackingUrl && <> · <a href={f.trackingUrl} target="_blank" rel="noopener noreferrer nofollow">{t('dlv.track_link')}</a></>}</p>
          )}
          {delivery && dt?.etaMinHours && reached < 3 && <p className="small muted">{t('checkout.eta', { a: dt.etaMinHours, b: dt.etaMaxHours ?? dt.etaMinHours })}</p>}
        </section>
      )}

      <div className="grid cols-2" style={{ marginTop: 12 }}>
        <div className="card">
          <ul className="stack" style={{ listStyle: 'none', padding: 0 }}>
            {(d.items as unknown as { name: string; variantName: string | null; quantity: number; lineTotalMinor: number; returnedQty: number }[]).map((i, k) => (
              <li key={k} className="row between">
                <span>{i.name}{i.variantName ? ` — ${i.variantName}` : ''} × {i.quantity}{i.returnedQty > 0 && <span className="small muted"> ({t('ret.returned_qty', { n: i.returnedQty })})</span>}</span>
                <span>{m(i.lineTotalMinor)}</span>
              </li>
            ))}
          </ul>
          <hr className="divider" />
          {(o.discountMinor as number) > 0 && <div className="row between small"><span>{t('inv.discount')}</span><span>−{m(o.discountMinor as number)}</span></div>}
          {delivery && <div className="row between small"><span>{t('dlv.fee')}</span><span>{(o.deliveryFeeMinor as number) ? m(o.deliveryFeeMinor as number) : t('checkout.free')}</span></div>}
          <div className="row between"><span>{t('common.total')}</span><strong>{m(o.totalMinor as number)}</strong></div>
          <div className="row between small"><span>{t('account.payments')}</span><span>{m(o.paidMinor as number)}</span></div>
          {(o.refundedMinor as number) > 0 && <div className="row between small"><span>{t('order.refunded')}</span><span>{m(o.refundedMinor as number)}</span></div>}
          {o.status === 'pending_payment' && o.holdExpiresAt && !(delivery && o.paymentTerms === 'on_site') && (
            <p className="small muted">{t('checkout.reserved_until', { time: formatDateTime(o.holdExpiresAt as Date, { tz, locale }) })}</p>
          )}
          {delivery && o.paymentTerms === 'on_site' && (o.paidMinor as number) < (o.totalMinor as number) && <p className="small muted">{t('checkout.cod')}</p>}
          {(d.invoices as unknown as { id: string; number: string; kind: string }[]).length > 0 && (
            <div className="row" style={{ marginTop: 8 }}>
              {(d.invoices as unknown as { id: string; number: string; kind: string }[]).map((x) => <Link key={x.id} href={`/account/invoices/${x.id}`} className="btn btn-quiet btn-sm">{x.kind === 'credit_note' ? t('inv.credit_short') : t('inv.invoice_short')} {x.number}</Link>)}
            </div>
          )}
        </div>
        <div className="card">
          {delivery && addr ? (
            <>
              <h2 style={{ margin: 0, fontSize: '1.05rem' }}>{t('checkout.delivery_to')}</h2>
              <address style={{ fontStyle: 'normal' }}>
                <div>{addr.recipientName} · <span className="mono" dir="ltr">{addr.phone}</span></div>
                <div className="small muted">{[addr.buildingNo, addr.street, addr.district, addr.city, addr.postalCode].filter(Boolean).join('، ')}</div>
              </address>
            </>
          ) : d.branch ? (
            <p className="small">{t('account.pickup_at', { branch: `${d.branch.name as string}${d.branch.address ? ` — ${d.branch.address as string}` : ''}` })}</p>
          ) : null}
          <h3 style={{ marginTop: 12 }}>{t('dlv.timeline')}</h3>
          <ol className="timeline">
            {(d.timeline as unknown as { status: string; note: string | null; createdAt: Date }[]).map((e, i, arr) => (
              <li key={i} data-current={i === arr.length - 1}>
                <div>{t(`tl.${e.status}`)}</div>
                <div className="small muted">{formatDateTime(e.createdAt, { tz, locale })}</div>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {o.status === 'collected' && (
        <div style={{ marginTop: 12 }}>
          <OrderReturns
            orderId={o.id as string}
            items={d.items as never}
            returns={d.returns as never}
            open={w.open}
            until={w.until ? formatDateTime(w.until, { tz, locale, dateOnly: true }) : null}
            policyText={w.policyText}
            money={retMoney}
          />
        </div>
      )}
    </>
  );
}
