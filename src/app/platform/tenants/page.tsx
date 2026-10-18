import Link from 'next/link';
import { EmptyState } from '@/components/ui/forms';
import { formatDateTime } from '@/lib/format';
import { pageT, requirePlatform } from '@/server/http/page';
import { listTenants, tenantListQuery } from '@/server/platform/service';

export const dynamic = 'force-dynamic';

export default async function TenantsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const p = await requirePlatform();
  const { t, locale } = await pageT(p.user);
  const sp = await searchParams;
  const q = tenantListQuery.parse({ q: sp.q, status: sp.status || undefined, offset: sp.offset, limit: 25 });
  const r = await listTenants(p, q);
  const qs = (o: number) => `?${new URLSearchParams({ ...(q.q ? { q: q.q } : {}), ...(q.status ? { status: q.status } : {}), offset: String(o) })}`;
  return (
    <>
      <div className="page-head"><h1>{t('platform.nav.tenants')}</h1><span className="muted small ltr-num">{r.total}</span></div>
      <form className="toolbar" method="get">
        <input name="q" className="input" defaultValue={q.q} placeholder={t('common.search')} aria-label={t('common.search')} />
        <select name="status" className="input" defaultValue={q.status ?? ''} aria-label={t('common.status')} style={{ maxWidth: 180 }}>
          <option value="">{t('common.all')}</option>
          {['onboarding', 'active', 'suspended', 'archived'].map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className="btn btn-sm" type="submit">{t('common.filter')}</button>
      </form>
      {r.items.length === 0 ? (
        <EmptyState title={t('common.empty')} />
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>{t('platform.col.business')}</th><th>{t('platform.col.owner')}</th><th>{t('common.status')}</th><th>{t('platform.col.plan')}</th><th>{t('platform.col.subscription')}</th><th>{t('platform.col.trial_ends')}</th><th>{t('platform.col.published')}</th></tr></thead>
            <tbody>
              {r.items.map((x) => (
                <tr key={x.id as string}>
                  <td><Link href={`/platform/tenants/${x.id}`}>{x.name as string}</Link> <span className="muted small mono">{x.slug as string}</span> {x.isDemo ? <span className="badge amber">{t('common.test_data')}</span> : null}</td>
                  <td>{(x.ownerName as string) ?? '—'}</td>
                  <td><span className={`badge ${x.status === 'active' ? 'green' : x.status === 'suspended' ? 'red' : ''}`}>{x.status as string}</span></td>
                  <td>{(x.planCode as string) ?? '—'}</td>
                  <td>{x.subscriptionStatus ? t(`sub.${x.subscriptionStatus}`) : '—'} {x.overageState === 'over_limit' && <span className="badge amber">over limit</span>}</td>
                  <td className="small">{x.trialEndsAt ? formatDateTime(x.trialEndsAt as Date, { locale, dateOnly: true }) : '—'}</td>
                  <td>{x.published ? t('common.yes') : t('common.no')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="pager">
        {q.offset > 0 ? <Link href={qs(Math.max(0, q.offset - q.limit))}>{t('common.prev_page')}</Link> : <span />}
        {r.hasMore && <Link href={qs(q.offset + q.limit)}>{t('common.next_page')}</Link>}
      </div>
    </>
  );
}
