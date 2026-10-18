import { notFound } from 'next/navigation';
import { env, isProduction } from '@/server/env';
import { pageT, requireUser } from '@/server/http/page';
import { sandboxPaymentForCustomer } from '@/server/booking/sandbox';
import { formatMoney } from '@/lib/format';
import { Brand } from '@/components/shell/Brand';

export const dynamic = 'force-dynamic';

/** SANDBOX hosted checkout (simulated provider page). 404 in production or when the sandbox is disabled. */
export default async function SandboxCheckout({ params }: { params: Promise<{ paymentId: string }> }) {
  if (isProduction() || !env().PAYMENTS_SANDBOX_ENABLED) notFound();
  const { paymentId } = await params;
  const user = await requireUser();
  const { t, locale } = await pageT(user);
  const p = await sandboxPaymentForCustomer(user.userId, paymentId);
  if (!p) notFound();
  const done = !['pending', 'processing'].includes(p.status);
  return (
    <main id="main" className="auth-wrap">
      <div className="auth-card stack">
        <Brand />
        <div className="alert warn" role="note">
          <strong>{t('sandbox.title')}</strong> — {t('sandbox.banner')}
        </div>
        <div className="card">
          <dl className="stack" style={{ margin: 0 }}>
            <div className="row between"><dt className="muted">{t('sandbox.merchant')}</dt><dd>{p.tenantName}</dd></div>
            <div className="row between"><dt className="muted">{t('sandbox.reference')}</dt><dd className="mono">{p.reference}</dd></div>
            <div className="row between"><dt className="muted">{t('sandbox.amount')}</dt><dd><strong>{formatMoney(p.amountMinor, p.currency, locale)}</strong></dd></div>
          </dl>
          <hr className="divider" />
          {done ? (
            <a className="btn btn-gold" href={p.returnPath}>{t('common.back')}</a>
          ) : (
            <form method="post" action={`/sandbox/checkout/${p.id}/complete`} className="row" style={{ justifyContent: 'space-between' }}>
              <button className="btn btn-danger" name="outcome" value="fail" type="submit">{t('sandbox.fail')}</button>
              <button className="btn btn-gold" name="outcome" value="pay" type="submit">{t('sandbox.pay')}</button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
