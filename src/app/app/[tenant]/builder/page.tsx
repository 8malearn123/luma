import { BuilderApp } from '@/components/builder/BuilderApp';
import { EmptyState } from '@/components/ui/forms';
import { pageT, requireTenant } from '@/server/http/page';
import { tx } from '@/server/tenancy/context';
import { entitlements, featureEnabled } from '@/server/tenancy/plan';
import { getDraft } from '@/server/storefront/drafts';
import { loadDraftForBuilder } from '@/server/storefront/public';
import { getProfile } from '@/server/storefront/profile';
import type { BuilderOptions } from '@/components/builder/context';

export const dynamic = 'force-dynamic';

export default async function BuilderPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const ctx = await requireTenant(tenant);
  const { t } = await pageT(ctx.user);
  if (!ctx.caps.has('storefront.edit')) {
    return <EmptyState icon="lock" title={t('common.permission_denied')} />;
  }
  const loaded = await tx(ctx, async (db) => {
    const draft = await getDraft(db);
    const data = await loadDraftForBuilder(db, ctx.tenant, draft.document);
    const ent = await entitlements(db, ctx.tenant.id);
    const lim = ent.features.get('custom_pages.max');
    const profile = await getProfile(db);
    // picker options: everything not archived (hidden/inactive are labeled, the server warns on publish)
    const [services, products, categories, staff, packages, branches] = await Promise.all([
      db<{ id: string; name: string; status: string }[]>`select id, name, case when status = 'active' and not is_visible then 'hidden' else status end as status from services where status <> 'archived' and group_capacity is null order by sort, name`,
      db<{ id: string; name: string; status: string }[]>`select id, name, case when status = 'active' and not is_visible then 'hidden' else status end as status from products where status <> 'archived' order by sort, name`,
      db<{ id: string; name: string; status: string; kind: 'service' | 'product' }[]>`select id, name, status, kind from categories where status <> 'archived' order by sort, name`,
      db<{ id: string; name: string; status: string }[]>`select id, display_name as name, case when status = 'active' and not public_visible then 'hidden' else status end as status from staff_profiles where status <> 'archived' order by sort, display_name`,
      db<{ id: string; name: string; status: string }[]>`select id, name, status from packages where status <> 'archived' order by created_at`,
      db<{ id: string; name: string; status: string }[]>`select id, name, status from branches where status = 'active' order by is_primary desc, name`,
    ]);
    const options: BuilderOptions = { services, products, categories, staff, packages, branches };
    return {
      draft,
      data,
      options,
      canRemovePoweredBy: featureEnabled(ent, 'branding.remove_powered_by'),
      customPagesLimit: lim && lim.enabled ? lim.limit : 0,
      profile,
    };
  });
  const pr = (loaded.profile ?? {}) as Record<string, unknown>;
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs">{ctx.tenant.name}</div>
          <h1>{t('nav.builder')}</h1>
        </div>
        <a className="btn btn-quiet btn-sm" href={`/s/${ctx.tenant.slug}`} target="_blank" rel="noreferrer">{t('builder.view_live')}</a>
      </div>
      <BuilderApp
        slug={ctx.tenant.slug}
        initialDoc={loaded.draft.document}
        initialVersion={loaded.draft.version}
        updatedAt={new Date(loaded.draft.updatedAt).toISOString()}
        data={loaded.data}
        options={loaded.options}
        canPublish={ctx.caps.has('storefront.publish')}
        canRemovePoweredBy={loaded.canRemovePoweredBy}
        customPagesLimit={loaded.customPagesLimit}
        profile={{
          tagline: (pr.tagline as string) ?? null,
          taglineEn: (pr.taglineEn as string) ?? null,
          intro: (pr.intro as string) ?? null,
          introEn: (pr.introEn as string) ?? null,
          contactPhone: (pr.contactPhone as string) ?? null,
          contactEmail: (pr.contactEmail as string) ?? null,
          whatsapp: (pr.whatsapp as string) ?? null,
          address: (pr.address as string) ?? null,
          socials: (pr.socials as Record<string, string>) ?? {},
        }}
      />
    </>
  );
}
