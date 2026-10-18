import { PlanEditor } from '@/components/platform/PlanEditor';
import { pageT, requirePlatform, canPlatform } from '@/server/http/page';
import { listPlans } from '@/server/platform/service';
import { FEATURE_KEYS } from '@/server/tenancy/plan';
import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function PlansPage() {
  const p = await requirePlatform();
  if (!canPlatform(p, 'platform.plans.manage')) notFound();
  const { t } = await pageT(p.user);
  const plans = await listPlans(true);
  return (
    <>
      <div className="page-head"><h1>{t('platform.nav.plans')}</h1></div>
      <div className="alert info">{t('platform.price_unset_hint')} · {t('platform.price_is_test')}</div>
      <div className="stack">
        {plans.map((pl) => <PlanEditor key={pl.id} featureKeys={FEATURE_KEYS} plan={{ ...pl, features: pl.features }} />)}
        <PlanEditor featureKeys={FEATURE_KEYS} plan={{ code: '', nameAr: '', nameEn: '', priceMonthlyMinor: null, priceYearlyMinor: null, priceIsTest: true, trialDays: 14, graceDays: 7, poweredByRequired: true, status: 'draft', sort: plans.length + 1, features: [] }} />
      </div>
    </>
  );
}
