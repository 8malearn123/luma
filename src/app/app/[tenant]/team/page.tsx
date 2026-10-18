import { EmptyState } from '@/components/ui/forms';
import { TeamManager, type TeamTab } from '@/components/team/TeamManager';
import { can, pageT, requireTenant } from '@/server/http/page';
import { tx } from '@/server/tenancy/context';

export const metadata = { title: 'Team' };

export default async function TeamPage({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { tenant } = await params;
  const sp = await searchParams;
  const ctx = await requireTenant(tenant);
  const { t } = await pageT(ctx.user);
  if (!can(ctx, 'staff.manage', 'schedule.manage', 'hr.manage')) return <EmptyState icon="lock" title={t('common.permission_denied')} />;
  const refs = await tx(ctx, async (db) => {
    const [branches, services] = await Promise.all([
      db<{ id: string; name: string }[]>`select id, name from branches where status = 'active' order by is_primary desc, name`,
      db<{ id: string; name: string }[]>`select id, name from services where status <> 'archived' order by sort, name`,
    ]);
    return { branches, services };
  });
  const tabs: TeamTab[] = [];
  if (can(ctx, 'staff.manage')) tabs.push('staff');
  if (can(ctx, 'schedule.manage')) tabs.push('schedules', 'exceptions');
  if (can(ctx, 'hr.manage')) tabs.push('leave', 'attendance', 'requests');
  if (can(ctx, 'finance.view', 'staff.manage')) tabs.push('commissions');
  const initial = (tabs as string[]).includes(sp.tab ?? '') ? (sp.tab as TeamTab) : tabs[0];
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumbs">{ctx.tenant.name}</div>
          <h1>{t('nav.team')}</h1>
        </div>
      </div>
      <TeamManager slug={ctx.tenant.slug} timezone={ctx.tenant.timezone} refs={refs} tabs={tabs} initialTab={initial} />
    </>
  );
}
