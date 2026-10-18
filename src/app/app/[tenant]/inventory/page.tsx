import { InventoryManager } from '@/components/dashboard/InventoryManager';
import { can, pageT, requireTenant } from '@/server/http/page';
import { tx } from '@/server/tenancy/context';

export default async function InventoryPage({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<{ low?: string }> }) {
  const ctx = await requireTenant((await params).tenant);
  const { t } = await pageT(ctx.user);
  if (!can(ctx, 'inventory.manage')) return <div className="alert warn" role="alert">{t('common.permission_denied')}</div>;
  const { branches, products, services } = await tx(ctx, async (db) => ({
    branches: await db<{ id: string; name: string }[]>`select id, name from branches where status = 'active' order by is_primary desc, name`,
    products: await db<{ id: string; name: string }[]>`select id, name from products where status <> 'archived' order by name`,
    services: await db<{ id: string; name: string }[]>`select id, name from services where status <> 'archived' order by sort, name`,
  }));
  return <InventoryManager tenant={ctx.tenant.slug} tz={ctx.tenant.timezone} branches={branches} products={products} services={services} canSeeCost={ctx.caps.has('finance.view')} initialLow={(await searchParams).low === '1'} />;
}
