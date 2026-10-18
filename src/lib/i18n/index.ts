import { ar } from './ar';
import { en } from './en';
import type { Locale } from '../format';

export type { Locale };
export const dictionaries: Record<Locale, Record<string, string>> = { ar, en };

export function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  let s = dictionaries[locale][key] ?? dictionaries.ar[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export const dirOf = (l: Locale) => (l === 'ar' ? 'rtl' : 'ltr');
export const LOCALE_COOKIE = 'luma_locale';
