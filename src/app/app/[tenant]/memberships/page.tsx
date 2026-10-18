import { growthGate, GateMessage } from '@/components/growth/server';
import { MembershipsManager } from '@/components/growth/MembershipsManager';
import { GroupSessions } from '@/components/growth/GroupSessions';
import { tx } from '@/server/tenancy/context';
import { featureEnabled } from '@/server/tenancy/plan';
import { listMemberships, listPlans } from '@/server/services/memberships';
import { listSessions } from '@/server/services/groups';

export const dynamic = 'force-dynamic';

export default async function MembershipsPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const g = await growthGate(tenant, ['loyalty.manage'], 'memberships.enabled');
  const head = (
    <div className="page-head">
      <div>
        <h1>{g.t('growth.mem.title')}</h1>
        <p className="muted small" style={{ margin: 0 }}>{g.t('growth.mem.snapshot_note')}</p>
      </div>
    </div>
  );
  if (g.state !== 'ok') return (<>{head}<GateMessage state={g.state} t={g.t} /></>);
  const groupsOn = featureEnabled(g.ent, 'group_sessions.enabled') && (g.ctx.caps.has('schedule.manage') || g.ctx.caps.has('catalog.manage'));
  const data = await tx(g.ctx, async (db) => {
    const [plans, memberships, services] = await Promise.all([
      listPlans(db),
      listMemberships(db),
      db<{ id: string; name: string }[]>`select id, name from services where status = 'active' order by name`,
    ]);
    const groups = groupsOn
      ? {
          sessions: await listSessions(db),
          services: await db`select id, name, group_capacity, price_minor, duration_min from services where group_capacity is not null and status = 'active' order by name`,
          staff: await db`select ss.service_id, sp.id, sp.display_name from service_staff ss join staff_profiles sp on sp.id = ss.staff_id where sp.status = 'active'`,
          branches: await db`select id, name from branches where status = 'active' order by is_primary desc, name`,
        }
      : null;
    return { plans, memberships, services, groups };
  });
  const plain = JSON.parse(JSON.stringify(data));
  return (
    <>
      {head}
      <MembershipsManager tenant={tenant} plans={plain.plans} memberships={plain.memberships} services={plain.services} />
      {plain.groups && (
        <div style={{ marginTop: 18 }}>
          <GroupSessions tenant={tenant} timezone={g.ctx.tenant.timezone} {...plain.groups} />
        </div>
      )}
    </>
  );
}
