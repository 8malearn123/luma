import { AppShell } from '@/components/shell/AppShell';
import { pageT, requireTenant } from '@/server/http/page';
import { tx, listMyTenants } from '@/server/tenancy/context';
import { entitlements } from '@/server/tenancy/plan';
import { buildNav } from '@/server/tenancy/nav';
import { translate } from '@/lib/i18n';

export default async function TenantLayout({ children, params }: { children: React.ReactNode; params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const ctx = await requireTenant(tenant);
  const { locale, t } = await pageT(ctx.user);
  const ent = await tx(ctx, (db) => entitlements(db, ctx.tenant.id));
  const mine = await listMyTenants(ctx.user.userId);
  const roleLabel = ctx.role ? translate(locale, `role.${ctx.role}`) : translate(locale, 'role.support');
  return (
    <AppShell
      title={ctx.tenant.name}
      subtitle={roleLabel}
      nav={buildNav(ctx, ent, t, locale)}
      userName={ctx.user.displayName}
      homeHref={`/app/${ctx.tenant.slug}`}
      switcher={mine.map((m) => ({ href: `/app/${m.slug}`, label: m.name, current: m.slug === ctx.tenant.slug }))}
      badges={
        <>
          {ctx.supportGrant && <span className="badge amber">{t('support.active_banner')}</span>}
          {ent.subscriptionStatus && <span className="badge">{t(`sub.${ent.subscriptionStatus}`)}</span>}
          {!ent.live && <span className="badge red">{t('errors.subscription_inactive')}</span>}
        </>
      }
    >
      {ctx.supportGrant && (
        <div className="alert warn" role="note">
          {t('support.banner', { reason: ctx.supportGrant.reason })}
        </div>
      )}
      {children}
    </AppShell>
  );
}
