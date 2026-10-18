import Link from 'next/link';
import { Brand } from '@/components/shell/Brand';
import { PrefsToggles, SignOut } from '@/components/shell/AppShell';
import { EmptyState } from '@/components/ui/forms';
import { StaffPortal, type PortalData } from '@/components/team/StaffPortal';
import { sql } from '@/server/db';
import { pageT, requireTenant, requireUser } from '@/server/http/page';
import { tx } from '@/server/tenancy/context';
import { ownSchedule } from '@/server/services/team';
import { addDays, utcToWall } from '@/lib/tz';

export const metadata = { title: 'Staff portal' };
export const dynamic = 'force-dynamic';

/** Employee portal: only the signed-in specialist's own bookings, schedule, attendance and requests. */
export default async function StaffPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const user = await requireUser();
  const { t } = await pageT(user);
  const sp = await searchParams;
  const memberships = await sql().begin(async (db) => {
    await db`select set_config('app.user_id', ${user.userId}, true)`;
    return db<{ slug: string; name: string }[]>`
      select t.slug, t.name from tenant_memberships m join tenants t on t.id = m.tenant_id
      where m.user_id = ${user.userId} and m.status = 'active' and m.staff_profile_id is not null and t.status <> 'archived' order by t.name`;
  });
  const shell = (body: React.ReactNode) => (
    <main id="main" style={{ maxWidth: 680, margin: '0 auto', padding: '16px' }}>
      <div className="row between" style={{ marginBottom: 12 }}>
        <Brand href="/staff" />
        <PrefsToggles />
      </div>
      {body}
      <div style={{ marginTop: 24 }}><SignOut /></div>
    </main>
  );
  if (!memberships.length) return shell(<EmptyState icon="idcard" title={t('team.portal_no_profile')}><Link href="/app">{t('nav.dashboard')}</Link></EmptyState>);
  const slug = memberships.find((m) => m.slug === sp.t)?.slug ?? memberships[0].slug;
  const ctx = await requireTenant(slug);
  if (!ctx.staffProfileId) return shell(<EmptyState icon="lock" title={t('common.permission_denied')} />);
  const tz = ctx.tenant.timezone;
  const today = utcToWall(new Date(), tz).date;
  const data = await tx(ctx, async (db) => {
    const [profile] = await db<{ displayName: string; displayNameEn: string | null; bio: string | null; photoAssetId: string | null; specialty: string | null }[]>`
      select display_name, display_name_en, bio, photo_asset_id, specialty from staff_profiles where id = ${ctx.staffProfileId}`;
    const bookings = ctx.caps.has('bookings.view_assigned')
      ? await db<{ itemId: string; bookingId: string; number: string; status: string; startsAt: Date; endsAt: Date; serviceName: string; customerName: string; customerNote: string | null }[]>`
          select i.id as item_id, b.id as booking_id, b.number, b.status, i.starts_at, i.ends_at, i.service_name,
                 split_part(c.display_name, ' ', 1) as customer_name, b.customer_note
          from booking_items i join bookings b on b.id = i.booking_id join tenant_customers c on c.id = b.tenant_customer_id
          where i.staff_id = ${ctx.staffProfileId} and i.status = 'active' and i.ends_at >= now() - interval '12 hours'
            and i.starts_at < now() + interval '14 days' and b.status in ('confirmed','checked_in','in_service','completed','held','pending_payment')
          order by i.starts_at limit 100`
      : [];
    const [last] = await db<{ kind: string; at: Date }[]>`select kind, at from attendance_events where staff_id = ${ctx.staffProfileId} order by at desc limit 1`;
    const schedule = ctx.caps.has('schedule.self') ? await ownSchedule(db, ctx.staffProfileId!, today, addDays(today, 14)) : null;
    const leave = await db`select id, starts_at, ends_at, type, status, review_note from leave_requests where staff_id = ${ctx.staffProfileId} order by created_at desc limit 20`;
    const requests = await db`select id, kind, details, status, review_note, created_at from staff_requests where staff_id = ${ctx.staffProfileId} order by created_at desc limit 20`;
    return { profile, bookings, last: last ?? null, schedule, leave, requests };
  });
  const portal: PortalData = JSON.parse(JSON.stringify({
    slug,
    timezone: tz,
    businessName: ctx.tenant.name,
    staffId: ctx.staffProfileId,
    caps: { bookings: ctx.caps.has('bookings.view_assigned'), hr: ctx.caps.has('hr.self'), profile: ctx.caps.has('staff.self_profile'), schedule: ctx.caps.has('schedule.self') },
    ...data,
  }));
  return shell(
    <>
      {memberships.length > 1 && (
        <nav className="chips" aria-label={t('nav.switch_business')} style={{ marginBottom: 12 }}>
          {memberships.map((m) => <Link key={m.slug} href={`/staff?t=${m.slug}`} className="chip" aria-current={m.slug === slug ? 'page' : undefined}>{m.name}</Link>)}
        </nav>
      )}
      <StaffPortal data={portal} />
    </>,
  );
}
