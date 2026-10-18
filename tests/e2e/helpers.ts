import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';

export interface Cred {
  role: string;
  name: string;
  identifier: string;
  password: string;
}

export function creds(): Cred[] {
  return JSON.parse(readFileSync(new URL('../../storage-e2e/', import.meta.url).pathname + 'demo-credentials.json', 'utf8')).accounts;
}
export const cred = (identifier: string) => {
  const c = creds().find((x) => x.identifier === identifier);
  if (!c) throw new Error(`no demo account ${identifier}`);
  return c;
};

/** Sign in through the real form (not the demo shortcut). */
export async function signIn(page: Page, identifier: string, next = '/account') {
  const c = cred(identifier);
  await page.goto(`/auth/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel(/البريد الإلكتروني أو رقم الجوال|Email or phone/).fill(c.identifier);
  await page.getByLabel(/^كلمة المرور|^Password/).fill(c.password);
  await page.getByRole('button', { name: /^دخول$|^Sign in$/ }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/auth/'));
}

export function collectErrors(page: Page): string[] {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)|Failed to load resource/.test(m.text())) errs.push(`console: ${m.text()}`);
  });
  return errs;
}
