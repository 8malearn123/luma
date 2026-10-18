'use client';

import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { translate } from '@/lib/i18n';
import type { Locale } from '@/lib/format';

const Ctx = createContext<Locale>('ar');

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <Ctx.Provider value={locale}>{children}</Ctx.Provider>;
}

export function useLocale(): Locale {
  return useContext(Ctx);
}

export function useT() {
  const locale = useContext(Ctx);
  return useCallback((k: string, v?: Record<string, string | number>) => translate(locale, k, v), [locale]);
}
