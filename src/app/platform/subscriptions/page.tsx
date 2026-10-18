import Link from 'next/link';
import { formatDateTime } from '@/lib/format';
import { pageT, requirePlatform } from '@/server/http/page';
import { listTenants } from '@/server/platform/service';
import { withSystem } from '@/server/db';

export const dynamic = 'force-dynamic';

export default async function SubscriptionsPage() {
  const p = await requirePlatform();
  const { t, locale } = await pageT(p.user);
  await listTenants(p, { limit: 1, offset: 0 }); // capability check (platform.tenants.view)
  const rows = await withSystem('platform subscriptions list', (tx) => tx`
    select distinct on (s.tenant_id) s.tenant_id, t.name, s.status, s.trial_ends_at, s.grace_until, s.overage_state, s.current_period_end, pl.code
    from subscriptions s join tenants t on t.id = s.tenant_id join plans pl on pl.id = s.plan_id
    order by s.tenant_id, s.created_at desc`);
  return (
    <>
      <div className="page-head"><h1>{t('platform.nav.subscriptions')}</h1></div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>{t('platform.col.business')}</th><th>{t('platform.col.plan')}</th><th>{t('common.status')}</th><th>{t('platform.col.trial_ends')}</th><th>grace</th><th>{t('platform.col.limit')}</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.tenantId as string}>
                <td><Link href={`/platform/tenants/${r.tenantId}`}>{r.name as string}</Link></td>
                <td>{r.code as string}</td>
                <td>{t(`sub.${r.status}`)}</td>
                <td className="small">{r.trialEndsAt ? formatDateTime(r.trialEndsAt as Date, { locale, dateOnly: true }) : '—'}</td>
                <td className="small">{r.graceUntil ? formatDateTime(r.graceUntil as Date, { locale, dateOnly: true }) : '—'}</td>
                <td>{r.overageState === 'over_limit' ? <span className="badge amber">{t('platform.over_limit')}</span> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
