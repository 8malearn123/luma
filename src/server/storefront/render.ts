import { cookies, headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { LOCALE_COOKIE } from '@/lib/i18n';
import type { Locale } from '@/lib/format';
import type { RenderCtx, StorefrontData } from '@/components/storefront/types';
import { loadPublicStorefront } from './public';

/** Visitor locale: explicit cookie choice, else the business's default language. */
export async function storefrontLocale(data: StorefrontData): Promise<Locale> {
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  return c === 'ar' || c === 'en' ? c : data.tenant.defaultLocale;
}

/** Published storefront render context for /s/<slug>/… pages (404 when unpublished/unknown). */
export async function publicCtx(slug: string): Promise<RenderCtx> {
  const data = await loadPublicStorefront(slug);
  if (!data) notFound();
  return { data, locale: await storefrontLocale(data), base: `/s/${data.tenant.slug}` };
}

/** Path inside the storefront (for nav highlighting). */
export async function storefrontPath(slug: string): Promise<string> {
  const p = (await headers()).get('x-luma-path') ?? '';
  const path = p.split('?')[0].replace(new RegExp(`^/s/${slug}`), '');
  return path || '/';
}
