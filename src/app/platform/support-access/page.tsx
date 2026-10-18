import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ActionForm } from '@/components/platform/ActionForm';
import { formatDateTime } from '@/lib/format';
import { canPlatform, pageT, requirePlatform } from '@/server/http/page';
import { listSupportGrants, listTenants } from '@/server/platform/service';

export const dynamic = 'force-dynamic';

export default async function SupportAccessPage() {
  const p = await requirePlatform();
  if (!canPlatform(p, 'platform.support.access')) notFound();
  const { t, locale } = await pageT(p.user);
  const grants = await listSupportGrants(p);
  const tenants = canPlatform(p, 'platform.tenants.view') ? (await listTenants(p, { limit: 100, offset: 0 })).items : [];
  return (
    <>
      <div className="page-head"><h1>{t('platform.nav.support')}</h1></div>
      <div className="alert warn">{t('platform.support_hint')}</div>
      <section className="card">
        <h2>{t('platform.support_create')}</h2>
        <ActionForm path="/api/v1/platform/support-grants" submitLabel={t('platform.support_create')} fields={[
          { name: 'tenantId', label: t('platform.tenant_id'), type: 'select', required: true, options: tenants.map((x) => ({ value: x.id as string, label: `${x.name} (${x.slug})` })), defaultValue: (tenants[0]?.id as string) ?? '' },
          { name: 'accessLevel', label: t('platform.access_level'), type: 'select', options: [{ value: 'read', label: t('platform.access.read') }, { value: 'write', label: t('platform.access.write') }], defaultValue: 'read' },
          { name: 'hours', label: t('platform.hours'), type: 'number', defaultValue: 2, required: true },
          { name: 'reason', label: t('platform.reason_min'), type: 'textarea', required: true },
        ]} />
      </section>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>{t('platform.col.business')}</th><th>{t('platform.access_level')}</th><th>{t('common.reason')}</th><th>{t('common.to')}</th><th>{t('common.status')}</th><th /></tr></thead>
          <tbody>
            {grants.map((g) => (
              <tr key={g.id as string}>
                <td>{g.tenantName as string} <span className="muted small">· {g.platformUser as string}</span></td>
                <td>{t(`platform.access.${g.accessLevel}`)}</td>
                <td className="small">{g.reason as string}</td>
                <td className="small">{formatDateTime(g.expiresAt as Date, { locale })}</td>
                <td>{g.active ? <span className="badge green">{t('common.active')}</span> : <span className="badge">{g.revokedAt ? 'revoked' : 'expired'}</span>}</td>
                <td className="row">
                  {g.active && <Link className="btn btn-sm" href={`/app/${g.slug}`}>{t('platform.support_open')}</Link>}
                  {g.active && <ActionForm path={`/api/v1/platform/support-grants/${g.id}`} method="DELETE" compact danger submitLabel={t('platform.revoke')} fields={[]} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
