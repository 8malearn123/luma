import { expect, test } from '@playwright/test';
import { signIn } from './helpers';

test('specialist portal shows only her own work; finance screens are not hers', async ({ page }) => {
  await signIn(page, 'hana@noura-salon.demo', '/staff?t=noura-salon');
  await expect(page).toHaveURL(/\/staff/);
  await expect(page.getByText(/هناء|حضور|انصراف/).first()).toBeVisible();
  // direct API access to costs is refused server-side (not just hidden)
  const r = await page.request.get('/api/v1/t/noura-salon/finance/report', { headers: { 'x-luma-request': '1' } });
  expect([403, 404]).toContain(r.status());
});

test('a member of one business cannot open another business (404, not 403)', async ({ page }) => {
  await signIn(page, 'lamsa@lamsa-studio.demo', '/app/lamsa-studio');
  await expect(page.getByText('استوديو لمسة').first()).toBeVisible();
  const res = await page.goto('/app/noura-salon');
  expect(res?.status()).toBe(404);
  const api = await page.request.get('/api/v1/t/noura-salon/bookings', { headers: { 'x-luma-request': '1' } });
  expect(api.status()).toBe(404);
});

test('LUMA owner sees the platform console but not a business without a support grant', async ({ page }) => {
  await signIn(page, 'platform.owner@luma.demo', '/platform');
  await expect(page).toHaveURL(/\/platform/);
  await page.goto('/platform/tenants');
  await expect(page.getByText('صالون نورة').first()).toBeVisible();
  const res = await page.goto('/app/noura-salon');
  expect(res?.status()).toBe(404);
});

test('legacy role-switching prototype pages are not reachable', async ({ page }) => {
  await page.goto('/login.html');
  await expect(page).toHaveURL(/\/auth\/login/);
  await page.goto('/salon.html');
  await expect(page).toHaveURL(/\/auth\/login|\/app/);
  // the marketing site is preserved
  const home = await page.goto('/');
  expect(home?.status()).toBe(200);
});

test('language switch flips direction (RTL → LTR) without losing the page', async ({ page }) => {
  await page.goto('/s/noura-salon');
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
  await page.request.post('/api/v1/prefs', { data: { locale: 'en' }, headers: { 'x-luma-request': '1' } });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  await expect(page.getByRole('link', { name: /Book/i }).first()).toBeVisible();
  await page.request.post('/api/v1/prefs', { data: { locale: 'ar' }, headers: { 'x-luma-request': '1' } });
});

test('drafts are never served publicly; preview needs a token', async ({ page }) => {
  const r = await page.goto('/preview/not-a-real-token-1234567890');
  expect(r?.status()).toBe(404);
});
