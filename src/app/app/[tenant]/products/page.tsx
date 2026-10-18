import { ProductsManager } from '@/components/dashboard/ProductsManager';
import { can, pageT, requireTenant } from '@/server/http/page';
import { tx } from '@/server/tenancy/context';

export default async function ProductsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const ctx = await requireTenant((await params).tenant);
  const { t } = await pageT(ctx.user);
  if (!can(ctx, 'catalog.manage')) return <div className="alert warn" role="alert">{t('common.permission_denied')}</div>;
  const categories = await tx(ctx, (db) => db<{ id: string; name: string }[]>`select id, name from categories where kind = 'product' and status <> 'archived' order by sort, name`);
  return <ProductsManager tenant={ctx.tenant.slug} categories={categories} canSeeCost={ctx.caps.has('finance.view')} />;
}
