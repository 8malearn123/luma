import { growthGate, GateMessage } from '@/components/growth/server';
import { WaitlistBoard } from '@/components/growth/WaitlistBoard';
import { tx } from '@/server/tenancy/context';
import { listEntries } from '@/server/services/waitlist';

export const dynamic = 'force-dynamic';

export default async function WaitlistPage({ params, searchParams }: { params: Promise<{ tenant: string }>; searchParams: Promise<{ status?: string }> }) {
  const { tenant } = await params;
  const { status } = await searchParams;
  const g = await growthGate(tenant, ['waitlist.manage'], 'waitlist.enabled');
  const head = (
    <div className="page-head">
      <div>
        <h1>{g.t('growth.wl.title')}</h1>
        <p className="muted small" style={{ margin: 0, maxWidth: 720 }}>{g.t('growth.wl.policy')}</p>
      </div>
    </div>
  );
  if (g.state !== 'ok') return (<>{head}<GateMessage state={g.state} t={g.t} /></>);
  const allowed = ['active', 'offered', 'fulfilled', 'expired', 'cancelled'];
  const filter = status && allowed.includes(status) ? status : undefined;
  const entries = await tx(g.ctx, (db) => listEntries(db, { status: filter }));
  return (
    <>
      {head}
      <WaitlistBoard tenant={tenant} timezone={g.ctx.tenant.timezone} status={filter ?? ''} entries={JSON.parse(JSON.stringify(entries))} />
    </>
  );
}
