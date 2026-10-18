import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import './luma.css';
import { I18nProvider } from '@/components/I18n';
import { ToastProvider } from '@/components/ui/Toast';
import { pageLocale, sessionUser } from '@/server/http/page';
import { dirOf, translate } from '@/lib/i18n';
import { env } from '@/server/env';

export const metadata: Metadata = {
  title: { default: 'LUMA', template: '%s · LUMA' },
  description: 'LUMA — منصة الصوالين وخبيرات الجمال',
  icons: { icon: '/favicon.svg' },
  manifest: '/manifest.json',
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0C0B0E' };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await sessionUser();
  const locale = await pageLocale(user);
  const theme = (await cookies()).get('luma_theme')?.value === 'light' ? 'light' : 'dark';
  const demo = env().LUMA_DEMO_MODE && env().NODE_ENV !== 'production';
  return (
    <html lang={locale} dir={dirOf(locale)} data-theme={theme}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=Bodoni+Moda:opsz,wght@6..96,400..700&family=IBM+Plex+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>
        <a className="skip-link" href="#main">
          {translate(locale, 'nav.skip_to_content')}
        </a>
        {demo && (
          <div className="demo-banner" role="note">
            {translate(locale, 'auth.demo_banner')}
          </div>
        )}
        <I18nProvider locale={locale}>
          <ToastProvider>{children}</ToastProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
