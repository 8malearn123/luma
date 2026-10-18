import Link from 'next/link';
import { Brand } from '@/components/shell/Brand';
import { pageT, requireTenant } from '@/server/http/page';
import { tx } from '@/server/tenancy/context';
import { getSession, readiness } from '@/server/services/onboarding';
import { signedMediaUrl } from '@/server/services/assets';
import { OnboardingWizard, type WizardInitial } from '../_components/OnboardingWizard';

export const metadata = { title: 'Onboarding' };

export default async function OnboardingTenant({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;
  const ctx = await requireTenant(tenant);
  const { t } = await pageT(ctx.user);
  if (!ctx.caps.has('tenant.settings.manage')) {
    return (
      <main id="main" className="auth-wrap">
        <div className="card" role="alert">
          {t('common.permission_denied')} <Link href={`/app/${tenant}`}>{t('nav.dashboard')}</Link>
        </div>
      </main>
    );
  }
  const data = await tx(ctx, async (db) => {
    const [session, ready, [profile], [branch], hours, services] = await Promise.all([
      getSession(db),
      readiness(db),
      db<{ logoAssetId: string | null; coverAssetId: string | null; wordmarkText: string | null; tagline: string | null; intro: string | null; contactPhone: string | null; whatsapp: string | null; contactEmail: string | null; address: string | null; socials: Record<string, string>; brandCharacter: string[]; brandDescription: string | null; excludedColors: string[]; targetAudience: string | null; storePriorities: string[] }[]>`
        select logo_asset_id, cover_asset_id, wordmark_text, tagline, intro, contact_phone, whatsapp, contact_email, address, socials,
               brand_character, brand_description, excluded_colors, target_audience, store_priorities from tenant_profiles limit 1`,
      db<{ id: string; name: string; city: string | null }[]>`select id, name, city from branches where is_primary and status = 'active' limit 1`,
      db<{ weekday: number; start: string; end: string }[]>`select weekday, to_char(start_time,'HH24:MI') as start, to_char(end_time,'HH24:MI') as end from working_hours w
         join branches b on b.id = w.branch_id and b.is_primary where w.staff_id is null order by weekday, start_time`,
      db<{ id: string; name: string; priceMinor: number; durationMin: number }[]>`select id, name, price_minor, duration_min from services where status <> 'archived' order by sort, name`,
    ]);
    const [policy] = await db<{ allowOnSite: boolean; depositMode: 'none' | 'percent' | 'fixed'; depositValue: number; cancellationWindowHours: number }[]>`
      select allow_on_site, deposit_mode, deposit_value, cancellation_window_hours from booking_policies limit 1`;
    return { session, ready, profile, branch, hours, services, policy };
  });
  const initial: WizardInitial = {
    slug: ctx.tenant.slug,
    tenant: { name: ctx.tenant.name, businessType: ctx.tenant.businessType, city: data.branch?.city ?? '', branchName: data.branch?.name ?? ctx.tenant.name },
    expertStaffId: ctx.tenant.businessType === 'expert' ? ctx.staffProfileId : null,
    session: JSON.parse(JSON.stringify(data.session)),
    readiness: data.ready,
    profile: data.profile ? { ...data.profile, logoUrl: data.profile.logoAssetId ? signedMediaUrl(data.profile.logoAssetId, 'w320') : null, coverUrl: data.profile.coverAssetId ? signedMediaUrl(data.profile.coverAssetId, 'w640') : null } : null,
    hours: data.hours,
    services: data.services,
    policy: data.policy ?? { allowOnSite: true, depositMode: 'none', depositValue: 0, cancellationWindowHours: 24 },
  };
  return (
    <main id="main" style={{ minHeight: '100vh', padding: '24px 16px', background: 'radial-gradient(120% 80% at 50% -10%, rgba(156,128,71,.14), var(--bg) 60%)' }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }} className="stack">
        <div className="row between">
          <Brand href={`/app/${tenant}`} />
          <Link href={`/app/${tenant}`} className="btn btn-quiet btn-sm">
            {t('ops.onb_later')}
          </Link>
        </div>
        <OnboardingWizard initial={initial} />
      </div>
    </main>
  );
}
