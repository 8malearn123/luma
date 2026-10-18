import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Brand } from '@/components/shell/Brand';
import { Icon } from '@/components/Icon';
import { pageT, requireUser } from '@/server/http/page';
import { isPlatformStaff, listMyTenants } from '@/server/tenancy/context';

/** Business selector. Selecting a business does not grant anything; access is re-checked per request. */
export default async function AppIndex() {
  const user = await requireUser();
  const { t } = await pageT(user);
  const tenants = await listMyTenants(user.userId);
  const platform = await isPlatformStaff(user.userId);
  if (tenants.length === 1 && !platform) redirect(`/app/${tenants[0].slug}`);
  return (
    <main id="main" className="auth-wrap">
      <div className="auth-card stack" style={{ width: 'min(560px,100%)' }}>
        <Brand />
        <div className="card">
          <h1>{t('app.choose_business')}</h1>
          <div className="stack">
            {tenants.map((m) => (
              <Link key={m.slug} href={`/app/${m.slug}`} className="btn" style={{ justifyContent: 'space-between' }}>
                <span>{m.name}</span>
                <span className="badge">{t(`role.${m.role}`)}</span>
              </Link>
            ))}
            {platform && (
              <Link href="/platform" className="btn btn-ghost">
                <Icon name="shield" size={18} /> {t('nav.platform')}
              </Link>
            )}
            <Link href="/onboarding" className="btn btn-gold">
              <Icon name="plus" size={18} /> {t('app.create_business')}
            </Link>
            <Link href="/account" className="btn btn-quiet">
              {t('nav.account')}
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
