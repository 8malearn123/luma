import { expect, test } from '@playwright/test';
import { collectErrors, signIn } from './helpers';

/**
 * Owner journey: edit the storefront draft in the builder (autosave), confirm
 * the change is NOT public, publish, confirm it IS public. The seeded draft
 * also contains an unpublished welcome banner that must stay private until now.
 */
test('owner edits the draft, it stays private until published', async ({ page, browser }) => {
  const errors = collectErrors(page);
  const marker = `نص منشور للاختبار ${Date.now().toString(36)}`;
  await signIn(page, 'noura@noura-salon.demo', '/app/noura-salon/builder');
  await expect(page.getByRole('heading', { name: 'تصميم المتجر' })).toBeVisible();

  // select the hero block on the canvas and edit its subtitle
  // keyboard-accessible block group labelled with its type (the hero banner)
  await page.locator('.bld-frame').getByRole('group', { name: /البانر الرئيسي/ }).first().click();
  const subtitle = page.locator('fieldset').filter({ has: page.locator('legend', { hasText: 'النص الفرعي' }) }).locator('textarea, input').first();
  await subtitle.fill(marker);
  await expect(page.getByText(/محفوظ/)).toBeVisible({ timeout: 15000 });

  // a visitor (separate browser context, not signed in) does not see the draft
  const visitor = await browser.newPage();
  await visitor.goto('/s/noura-salon');
  await expect(visitor.getByText('صالون نورة').first()).toBeVisible();
  await expect(visitor.getByText(marker)).toHaveCount(0);
  // the seeded unpublished banner: only meaningful before any run has published it (desktop runs first)
  if (test.info().project.name === 'desktop') await expect(visitor.getByText(/عرض الافتتاح/)).toHaveCount(0);

  // publish (atomic) → visitor sees it
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: 'نشر' }).click();
  await expect(page.getByText(/تم نشر الإصدار/)).toBeVisible({ timeout: 15000 });
  await visitor.reload();
  await expect(visitor.getByText(marker)).toBeVisible();
  await expect(visitor.getByText(/عرض الافتتاح/)).toBeVisible();
  // the Book entry is always present
  await expect(visitor.getByRole('link', { name: /احجزي/ }).first()).toBeVisible();
  expect(errors, errors.join('\n')).toEqual([]);
});
