import { growthGate, GateMessage } from '@/components/growth/server';
import { LoyaltyManager } from '@/components/growth/LoyaltyManager';
import { tx } from '@/server/tenancy/context';
import { getRules, listRewards, topAccounts } from '@/server/services/loyalty';
import { listCoupons } from '@/server/services/coupons';

export const dynamic = 'force-dynamic';

export default async function LoyaltyPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const g = await growthGate(tenant, ['loyalty.manage'], 'loyalty.enabled');
  const head = (
    <div className="page-head">
      <div>
        <h1>{g.t('growth.loyalty.title')}</h1>
        <p className="muted small" style={{ margin: 0 }}>{g.t('growth.loyalty.lead')}</p>
      </div>
    </div>
  );
  if (g.state !== 'ok') return (<>{head}<GateMessage state={g.state} t={g.t} /></>);
  const data = await tx(g.ctx, async (db) => {
    const [rules, rewards, accounts, coupons, services] = await Promise.all([
      getRules(db),
      listRewards(db),
      topAccounts(db),
      listCoupons(db),
      db<{ id: string; name: string }[]>`select id, name from services where status = 'active' order by name`,
    ]);
    return { rules, rewards, accounts, coupons, services };
  });
  return (
    <>
      {head}
      <LoyaltyManager tenant={tenant} initial={JSON.parse(JSON.stringify(data))} />
    </>
  );
}
