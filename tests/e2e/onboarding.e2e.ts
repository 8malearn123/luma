import { expect, test } from '@playwright/test';
import { collectErrors } from './helpers';

/**
 * Fresh business, end to end: real registration with a verification code
 * (delivered to the clearly-labeled dev outbox — nothing is sent), business
 * creation (the caller becomes owner), the 7-step onboarding with skips,
 * deterministic first draft (no invented services), then the dashboard.
 */
test('a new owner registers, verifies, creates a business and completes onboarding', async ({ page }) => {
  const errors = collectErrors(page);
  const id = Date.now().toString(36);
  const email = `owner-${id}@new.demo`;
  await page.goto('/auth/register?next=/onboarding');
  await page.getByLabel(/البريد الإلكتروني أو رقم الجوال/).fill(email);
  await page.getByLabel(/^الاسم/).fill('مالكة جديدة');
  await page.getByLabel(/^كلمة المرور/).fill('correct-horse-battery-staple');
  await page.getByRole('button', { name: 'إنشاء الحساب' }).click();
  await expect(page.getByText(/وضع التطوير: لم يُرسل الرمز فعلياً/)).toBeVisible();

  // read the code from the dev outbox (development/review only)
  const outbox = await page.context().newPage();
  await outbox.goto('/dev/outbox');
  const row = outbox.locator('tr', { hasText: 'رمز التحقق' }).first();
  const code = /(\d{6})/.exec(await row.innerText())![1];
  await outbox.close();
  await page.getByLabel(/رمز التحقق/).fill(code);
  await page.getByRole('button', { name: 'تحقق' }).click();
  await expect(page).toHaveURL(/\/onboarding/);

  // step 1 creates the business
  await page.getByLabel(/اسم النشاط/).fill('صالون التجربة');
  await page.getByLabel(/^المدينة/).fill('الدمام');
  await page.getByLabel(/رابط المتجر/).fill(`trial-${id}`);
  await page.getByRole('button', { name: /^التالي$/ }).click();
  await expect(page).toHaveURL(new RegExp(`/onboarding/trial-${id}`), { timeout: 15000 });

  // remaining steps can be skipped / advanced; the wizard saves and resumes
  for (let i = 0; i < 6; i++) {
    const skip = page.getByRole('button', { name: /^تخطي$/ });
    const next = page.getByRole('button', { name: /^التالي$/ });
    if (await skip.isVisible().catch(() => false)) await skip.click();
    else if (await next.isVisible().catch(() => false)) await next.click();
    await page.waitForTimeout(500);
  }
  const gen = page.getByRole('button', { name: /إنشاء المسودة الأولى للمتجر/ });
  await expect(gen).toBeVisible({ timeout: 10000 });
  page.on('dialog', (d) => d.accept());
  await gen.click();
  // readiness explicitly lists what is missing (no invented services)
  await expect(page.getByText(/خدمة قابلة للحجز|جاهزية النشر/).first()).toBeVisible();

  await page.goto(`/app/trial-${id}`);
  await expect(page.getByText('صالون التجربة').first()).toBeVisible();
  await page.goto(`/app/trial-${id}/builder`);
  await expect(page.getByRole('heading', { name: 'تصميم المتجر' })).toBeVisible();
  expect(errors, errors.join('\n')).toEqual([]);
});
