import { EmptyState } from '@/components/ui/forms';
import { ServicesManager } from '@/components/catalog/ServicesManager';
import { can, pageT, requireTenant } from '@/server/http/page';
import { tx } from '@/server/tenancy/context';

export const metadata = { title: 'Services' };

export default async function ServicesPage({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<{ tab?: string; id?: string }> }) {
  const { tenant } = await params;
  const sp = await searchParams;
  const ctx = await requireTenant(tenant);
  const { t } = await pageT(ctx.user);
  if (!can(ctx, 'catalog.manage')) return <EmptyState icon="lock" title={t('common.permission_denied')} />;
  const refs = await tx(ctx, async (db) => {
    const [branches, staff, resourceTypes] = await Promise.all([
      db<{ id: string; name: string }[]>`select id, name from branches where status = 'active' order by is_primary desc, name`,
      db<{ id: string; displayName: string }[]>`select id, display_name from staff_profiles where status = 'active' order by sort, display_name`,
      db<{ id: string; name: string }[]>`select id, name from resource_types order by name`,
    ]);
    return { branches, staff, resourceTypes };
  });
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs">{ctx.tenant.name}</div>
          <h1>{t('nav.services')}</h1>
        </div>
      </div>
      <ServicesManager
        slug={ctx.tenant.slug}
        refs={refs}
        canSeeCosts={can(ctx, 'finance.view')}
        canApprovePrices={can(ctx, 'catalog.price.approve')}
        initialTab={(['services', 'categories', 'packages', 'resources'] as const).find((x) => x === sp.tab) ?? 'services'}
        initialOpenId={sp.id ?? null}
      />
    </>
  );
}
