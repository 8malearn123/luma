import { expect, test, type Page } from '@playwright/test';
import { collectErrors, signIn } from './helpers';

/**
 * Delivery → tracking → tax invoice → return, through the real UI:
 *  customer: product → cart → checkout with DELIVERY to a new address, cash on delivery
 *  owner:    deliveries board → ready → courier + tracking → record cash → delivered → invoice (Arabic + QR)
 *  customer: tracking shows delivered → requests a return
 *  owner:    returns queue shows it; messages page is honest (simulated); integrations page states
 */
test.describe.configure({ mode: 'serial' });

let orderNumber = '';

async function signOut(page: Page) {
  await page.request.post('/api/v1/auth/logout', { headers: { 'x-luma-request': '1' }, data: {} });
}

test('customer orders with delivery and cash on delivery', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop', 'one order per run');
  const errors = collectErrors(page);
  await signIn(page, 'joud@customer.demo', '/s/noura-salon/products');
  await page.getByRole('button', { name: 'أضيفي إلى السلة' }).first().click();
  await expect(page.getByRole('button', { name: /أُضيف/ }).first()).toBeVisible();
  await page.goto('/s/noura-salon/checkout');
  await page.getByLabel('توصيل').check();
  // no saved address yet: the form is shown inline
  await page.getByLabel(/اسم المستلم/).fill('جود');
  await page.getByLabel(/جوال المستلم/).fill('+966500000777');
  await page.getByLabel(/^المدينة/).fill('الرياض');
  await page.getByLabel(/^الحي/).fill('الملقا');
  await page.getByLabel(/^الشارع/).fill('شارع تجريبي 12');
  await page.getByRole('button', { name: 'حفظ' }).click();
  // fee from the "north Riyadh" district zone (server-computed)
  await expect(page.getByText(/رسوم التوصيل/)).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/المدة المتوقعة 6–24 ساعة/)).toBeVisible();
  await page.getByLabel(/الدفع عند الاستلام/).check();
  await page.getByText(/أوافق على المجموع/).click();
  await page.getByRole('button', { name: 'تأكيد الطلب' }).click();
  await expect(page.getByText('تم إنشاء طلبكِ')).toBeVisible({ timeout: 15000 });
  orderNumber = (await page.locator('.ltr-num').first().textContent())?.trim() ?? '';
  expect(orderNumber).toMatch(/^ORD-/);
  await page.getByRole('link', { name: /حسابي|عرض في حسابي/ }).first().click();
  await expect(page.getByText('التوصيل إلى')).toBeVisible();
  await expect(page.getByText(/شارع تجريبي 12/)).toBeVisible();
  expect(errors, errors.join('\n')).toEqual([]);
});

test('owner dispatches, records cash, delivers and issues an Arabic tax invoice', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop' || !orderNumber, 'needs the order from the previous test');
  const errors = collectErrors(page);
  await signIn(page, 'noura@noura-salon.demo', '/app/noura-salon/orders/deliveries');
  await expect(page.getByRole('heading', { name: 'التوصيل' })).toBeVisible();
  await page.getByText(orderNumber).click();
  await expect(page.getByText('دفع عند الاستلام').first()).toBeVisible();
  await page.getByRole('button', { name: 'جاهز للإرسال' }).click();
  await page.getByRole('button', { name: 'تسليم للمندوب' }).first().click();
  await page.getByLabel(/المندوب/).fill('مندوب تجريبي');
  await page.getByLabel(/رقم التتبّع/).fill('TRK-E2E-1');
  await page.getByRole('button', { name: 'تسليم للمندوب' }).last().click();
  await expect(page.locator('.badge.gold', { hasText: 'مع المندوب' })).toBeVisible({ timeout: 10000 });
  // delivered is blocked until the courier's cash is recorded
  await expect(page.getByRole('button', { name: 'تم التوصيل' })).toBeDisabled();
  await page.getByRole('button', { name: /تسجيل استلام المبلغ من المندوب/ }).click();
  await page.getByLabel(/المرجع|Reference/).fill('COD-E2E');
  await page.getByRole('button', { name: 'تأكيد' }).click();
  await expect(page.getByRole('button', { name: 'تم التوصيل' })).toBeEnabled({ timeout: 10000 });
  await page.getByRole('button', { name: 'تم التوصيل' }).click();
  await expect(page.locator('.badge.gold', { hasText: 'تم التوصيل' })).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: /فاتورة/ }).first().click();
  await page.getByRole('link', { name: /^فاتورة INV-/ }).click();
  await expect(page.getByRole('heading', { name: /فاتورة ضريبية مبسطة/ })).toBeVisible();
  await expect(page.locator('.invoice-doc .qr svg')).toBeVisible();
  await expect(page.getByText('300000000000003').first()).toBeVisible();
  await expect(page.getByText(/لم يُربط بعد مع منصة "فاتورة"/)).toBeVisible();
  await expect(page.getByText(/التوصيل \/ Delivery/)).toBeVisible();
  expect(errors, errors.join('\n')).toEqual([]);
  await signOut(page);
});

test('customer sees it delivered, opens the invoice and requests a return', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop' || !orderNumber, 'needs the delivered order');
  const errors = collectErrors(page);
  await signIn(page, 'joud@customer.demo', '/account/orders');
  await page.getByText(orderNumber).click();
  await expect(page.locator('.steps span[data-done="true"]', { hasText: 'تم التوصيل' })).toBeVisible();
  await expect(page.getByText('TRK-E2E-1')).toBeVisible();
  await page.getByRole('link', { name: /^فاتورة INV-/ }).click();
  await expect(page.getByRole('heading', { name: /فاتورة ضريبية مبسطة/ })).toBeVisible();
  await page.goBack();
  await page.getByRole('button', { name: 'طلب إرجاع' }).click();
  await page.locator('form input[type=number]').first().fill('1');
  await page.getByLabel(/^التفاصيل/).fill('العبوة وصلت مفتوحة');
  await page.getByRole('button', { name: 'إرسال الطلب' }).click();
  await expect(page.getByText('بانتظار المراجعة')).toBeVisible({ timeout: 10000 });
  expect(errors, errors.join('\n')).toEqual([]);
  await signOut(page);
});

test('owner reviews the return; messages and integrations pages tell the truth', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop' || !orderNumber, 'needs the return');
  const errors = collectErrors(page);
  await signIn(page, 'noura@noura-salon.demo', '/app/noura-salon/orders/returns');
  await expect(page.getByText(orderNumber)).toBeVisible();
  await page.getByRole('button', { name: 'التفاصيل' }).first().click();
  await page.getByRole('button', { name: 'قبول' }).click();
  await expect(page.locator('.drawer .badge', { hasText: 'مقبول' })).toBeVisible({ timeout: 10000 });
  await page.keyboard.press('Escape');

  await page.goto('/app/noura-salon/messages');
  await expect(page.getByText(/لا يوجد مزوّد رسائل مربوط بعد/)).toBeVisible();
  await page.getByRole('button', { name: 'تعديل' }).first().click();
  await page.getByRole('button', { name: /إرسال تجريبي/ }).click();
  await expect(page.getByText(/سُجّلت محاكاة/)).toBeVisible({ timeout: 10000 });
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: 'سجل التسليم' }).click();
  await expect(page.locator('.badge', { hasText: 'محاكاة' }).first()).toBeVisible();

  await page.goto('/app/noura-salon/integrations');
  await expect(page.getByText('غير مُعد')).toBeVisible();
  await expect(page.getByText(/غير مربوطة/).first()).toBeVisible();

  await page.goto('/app/noura-salon/settings?tab=payments');
  await expect(page.getByText('ربط حساب ميسّر')).toBeVisible();
  await expect(page.getByLabel('رابط الويبهوك')).toHaveValue(/\/api\/v1\/webhooks\/payments\/moyasar$/);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('notification bell is in the shell and streams live', async ({ page }) => {
  const errors = collectErrors(page);
  await signIn(page, 'noura@noura-salon.demo', '/app/noura-salon');
  await page.getByTestId('notif-bell').click();
  await expect(page.getByRole('dialog', { name: 'الإشعارات' })).toBeVisible();
  await expect(page.locator('.notif-pop .badge', { hasText: 'مباشر' })).toBeVisible({ timeout: 15000 });
  expect(errors, errors.join('\n')).toEqual([]);
});
