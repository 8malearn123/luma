import Link from 'next/link';
import { Brand } from '@/components/shell/Brand';
import { Icon } from '@/components/Icon';
import { formatMoney } from '@/lib/format';
import { pageT, sessionUser } from '@/server/http/page';
import { listPlans } from '@/server/platform/service';
import { FEATURE_KEYS } from '@/server/tenancy/plan';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Plans' };

/** Public plans page. Prices come only from configuration; unset = "not yet published", test prices labeled. */
export default async function PricingPage() {
  const user = await sessionUser();
  const { t, locale } = await pageT(user);
  const plans = await listPlans(false);
  return (
    <main id="main" className="content" style={{ margin: '0 auto' }}>
      <Brand />
      <div className="page-head"><div><h1 className="display">{t('pricing.title')}</h1><p className="muted">{t('pricing.subtitle')}</p></div></div>
      {plans.length === 0 ? <p className="muted">{t('pricing.none')}</p> : (
        <div className="grid cols-3">
          {plans.map((pl) => (
            <section key={pl.id} className="card stack" aria-labelledby={`pl-${pl.code}`}>
              <h2 id={`pl-${pl.code}`} className="display" style={{ margin: 0 }}>{locale === 'ar' ? pl.nameAr : pl.nameEn}</h2>
              <div>
                {pl.priceMonthlyMinor == null ? (
                  <span className="muted">{t('pricing.not_published')}</span>
                ) : (
                  <>
                    <span style={{ fontSize: 26, fontWeight: 600 }}>{formatMoney(pl.priceMonthlyMinor, pl.currency, locale)}</span> <span className="muted">{t('pricing.per_month')}</span>
                    {pl.priceIsTest && <div><span className="badge amber">{t('pricing.test_price')}</span></div>}
                  </>
                )}
              </div>
              {pl.trialDays > 0 && <span className="badge gold">{t('pricing.trial', { n: pl.trialDays })}</span>}
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }} className="stack">
                {FEATURE_KEYS.map((k) => {
                  const f = pl.features.find((x) => x.featureKey === k);
                  const on = !!f?.enabled;
                  return (
                    <li key={k} className="row" style={{ gap: 8, color: on ? 'var(--text)' : 'var(--muted-deep)' }}>
                      <Icon name={on ? 'check' : 'x'} size={16} label={on ? t('common.yes') : t('common.no')} />
                      <span>{t(`feature.${k}`)}{on && k.endsWith('.max') ? `: ${f?.limitValue ?? t('platform.unlimited')}` : ''}{on && k === 'ai.monthly_runs' ? `: ${f?.limitValue ?? t('platform.unlimited')}` : ''}</span>
                    </li>
                  );
                })}
              </ul>
              <Link className="btn btn-gold" href={user ? '/onboarding' : '/auth/register?next=/onboarding'}>{t('pricing.start')}</Link>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
