import { expect, test } from '@playwright/test';
import { collectErrors, signIn } from './helpers';

/**
 * Customer journey: storefront → choose a service → any specialist → slot →
 * review with server-computed payment options → hold → sandbox provider →
 * signed webhook confirms (the redirect alone never does) → booking visible in
 * the central account.
 */
test('customer books with a deposit through the sandbox provider', async ({ page }) => {
  const errors = collectErrors(page);
  await signIn(page, 'amal@customer.demo', '/s/noura-salon/booking');
  await expect(page).toHaveURL(/\/s\/noura-salon\/booking/);

  // step 1 — services
  await page.getByRole('button', { name: /^إضافة$/ }).first().click();
  await page.getByRole('button', { name: /^متابعة$/ }).click();
  // step 2 — specialist ("any" by default)
  await page.getByRole('button', { name: /^متابعة$/ }).click();
  // step 3 — date & time: walk days until one has slots
  const options = page.getByRole('option');
  for (let i = 0; i < 14 && (await options.count()) === 0; i++) {
    const days = page.locator('[aria-label="التاريخ"] .sf-slot:not([disabled])');
    await days.nth(Math.min(i + 1, (await days.count()) - 1)).click();
    await page.waitForTimeout(400);
  }
  await expect(options.first()).toBeVisible({ timeout: 15000 });
  await options.first().click();
  await page.getByRole('button', { name: /^متابعة$/ }).click();

  // step 4 — review: only server-computed options are offered (policy requires a 30% deposit)
  await expect(page.getByText('دفع عربون الآن')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('الدفع في الصالون')).toHaveCount(0);
  await page.getByText('دفع عربون الآن').click();
  await page.getByText('قرأتُ سياسة الحجز وأوافق عليها').click();
  await page.getByRole('button', { name: 'تثبيت الموعد' }).click();

  // hold → provider
  await page.getByRole('button', { name: /الانتقال للدفع/ }).click();
  await expect(page).toHaveURL(/\/sandbox\/checkout\//);
  await expect(page.getByText(/SANDBOX|محاكاة|تجريبي/).first()).toBeVisible();
  await page.getByRole('button', { name: 'محاكاة دفع ناجح' }).click();

  // the return page confirms only after the verified event
  await expect(page.getByText(/مؤكد|تم تأكيد/).first()).toBeVisible({ timeout: 20000 });

  await page.goto('/account/bookings');
  await expect(page.getByText('صالون نورة').first()).toBeVisible();
  await expect(page.getByText('مؤكد').first()).toBeVisible();
  expect(errors, errors.join("\n")).toEqual([]);
});

test('a customer with an experimental require-full decision is never offered a deposit', async ({ page }) => {
  await signIn(page, 'fatimah@customer.demo', '/s/noura-salon/booking');
  await page.getByRole('button', { name: /^إضافة$/ }).first().click();
  await page.getByRole('button', { name: /^متابعة$/ }).click();
  await page.getByRole('button', { name: /^متابعة$/ }).click();
  const options = page.getByRole('option');
  for (let i = 0; i < 14 && (await options.count()) === 0; i++) {
    const days = page.locator('[aria-label="التاريخ"] .sf-slot:not([disabled])');
    await days.nth(Math.min(i + 1, (await days.count()) - 1)).click();
    await page.waitForTimeout(400);
  }
  await options.first().click();
  await page.getByRole('button', { name: /^متابعة$/ }).click();
  await expect(page.getByText(/الدفع الكامل|دفع كامل/).first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('دفع عربون الآن')).toHaveCount(0);
  await expect(page.getByText('الدفع في الصالون')).toHaveCount(0);
});
