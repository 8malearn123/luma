import { notFound } from 'next/navigation';
import { ActionForm } from '@/components/platform/ActionForm';
import { canPlatform, pageT, requirePlatform } from '@/server/http/page';
import { listPlatformStaff } from '@/server/platform/service';

export const dynamic = 'force-dynamic';
const ROLES = ['platform_owner', 'support_admin', 'policy_reviewer', 'tech_admin'];

export default async function UsersPage() {
  const p = await requirePlatform();
  if (!canPlatform(p, 'platform.users.manage')) notFound();
  const { t } = await pageT(p.user);
  const staff = await listPlatformStaff(p);
  return (
    <>
      <div className="page-head"><h1>{t('platform.nav.users')}</h1></div>
      <div className="alert info">{t('platform.users_hint')} {t('platform.mfa_gap')}</div>
      <section className="card">
        <h2>{t('platform.grant_role')}</h2>
        <ActionForm path="/api/v1/platform/staff" compact submitLabel={t('platform.grant_role')} fields={[
          { name: 'identifier', label: t('auth.identifier'), required: true, ltr: true },
          { name: 'role', label: t('platform.col.role'), type: 'select', options: ROLES.map((r) => ({ value: r, label: t(`platform.role.${r}`) })), defaultValue: 'support_admin', required: true },
        ]} />
      </section>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>{t('common.name')}</th><th>{t('auth.identifier')}</th><th>{t('platform.col.role')}</th><th>{t('common.status')}</th><th /></tr></thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.userId as string}>
                <td>{s.displayName as string}</td>
                <td className="mono small">{(s.email as string) ?? (s.phone as string)}</td>
                <td>{t(`platform.role.${s.role}`)}</td>
                <td>{s.status as string}</td>
                <td>{s.status === 'active' && s.userId !== p.user.userId && (
                  <ActionForm path={`/api/v1/platform/staff/${s.userId}`} method="DELETE" danger compact submitLabel={t('platform.revoke')} fields={[]} confirmText={t('platform.revoke')} />
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
