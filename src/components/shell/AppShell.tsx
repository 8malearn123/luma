'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Icon, type IconName } from '../Icon';
import { useLocale, useT } from '../I18n';
import { apiFetch } from '@/lib/client/api';

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  group?: string;
  exact?: boolean;
}

export interface ShellProps {
  title: string;
  subtitle?: string;
  nav: NavItem[];
  userName: string;
  switcher?: { href: string; label: string; current: boolean }[];
  badges?: ReactNode;
  children: ReactNode;
  homeHref: string;
}

export function PrefsToggles() {
  const t = useT();
  const locale = useLocale();
  const router = useRouter();
  const set = async (body: Record<string, string>) => {
    await apiFetch('/api/v1/prefs', { method: 'POST', body });
    router.refresh();
  };
  return (
    <div className="row" style={{ gap: 6 }}>
      <button type="button" className="btn btn-quiet btn-sm" onClick={() => set({ locale: locale === 'ar' ? 'en' : 'ar' })} lang={locale === 'ar' ? 'en' : 'ar'}>
        {t('common.language')}
      </button>
      <button
        type="button"
        className="btn icon-btn"
        aria-label="theme"
        onClick={() => set({ theme: document.documentElement.dataset.theme === 'light' ? 'dark' : 'light' })}
      >
        <Icon name="palette" size={16} />
      </button>
    </div>
  );
}

export function SignOut() {
  const t = useT();
  return (
    <button
      type="button"
      className="nav-link"
      style={{ width: '100%', background: 'none', border: 0, cursor: 'pointer', fontFamily: 'inherit' }}
      onClick={async () => {
        await apiFetch('/api/v1/auth/logout', { method: 'POST', body: {} });
        window.location.href = '/auth/login';
      }}
    >
      <Icon name="logout" />
      <span>{t('nav.signout')}</span>
    </button>
  );
}

export function AppShell({ title, subtitle, nav, userName, switcher, badges, children, homeHref }: ShellProps) {
  const t = useT();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  let lastGroup: string | undefined;
  return (
    <div className="shell">
      <aside className="sidebar" data-open={open} aria-label={t('nav.menu')}>
        <Link href={homeHref} className="brand" style={{ textDecoration: 'none' }}>
          <span className="word">LUMA</span>
        </Link>
        <div style={{ padding: '0 10px 12px' }}>
          <div style={{ fontWeight: 600 }}>{title}</div>
          {subtitle && <div className="small muted">{subtitle}</div>}
          {badges && <div style={{ marginTop: 6 }}>{badges}</div>}
        </div>
        <nav>
          {nav.map((n) => {
            const active = n.exact ? pathname === n.href : pathname === n.href || pathname.startsWith(`${n.href}/`);
            const groupHead = n.group && n.group !== lastGroup ? n.group : null;
            lastGroup = n.group ?? lastGroup;
            return (
              <div key={n.href}>
                {groupHead && <div className="nav-group">{groupHead}</div>}
                <Link href={n.href} className="nav-link" aria-current={active ? 'page' : undefined} onClick={() => setOpen(false)}>
                  <Icon name={n.icon} />
                  <span>{n.label}</span>
                </Link>
              </div>
            );
          })}
        </nav>
        {switcher && switcher.length > 1 && (
          <>
            <div className="nav-group">{t('nav.switch_business')}</div>
            {switcher.map((s) => (
              <Link key={s.href} href={s.href} className="nav-link" aria-current={s.current ? 'true' : undefined}>
                <Icon name="globe" size={18} />
                <span>{s.label}</span>
              </Link>
            ))}
          </>
        )}
        <div className="divider" />
        <Link href="/account" className="nav-link">
          <Icon name="user" />
          <span>{userName}</span>
        </Link>
        <SignOut />
      </aside>
      <div className="main">
        <header className="topbar">
          <button type="button" className="btn icon-btn menu-toggle" aria-label={t('nav.menu')} aria-expanded={open} onClick={() => setOpen(!open)}>
            <Icon name="menu" />
          </button>
          <div style={{ flex: 1 }} />
          <PrefsToggles />
        </header>
        <main id="main" className="content" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}
