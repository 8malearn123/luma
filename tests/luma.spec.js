// ═══ سويت لوما — يعمل قبل كل دمج في main عبر GitHub Actions ═══
// يغطي: خلو كل الصفحات من أخطاء JS في الوضعين، وأهم التدفقات الوظيفية.
const { test, expect } = require('@playwright/test');

const PAGES = [
  'index.html', 'login.html', 'booking.html', '404.html',
  'store.html', 'market.html', 'salons.html', 'experience.html',
  'salon.html', 'expert.html', 'client.html', 'admin.html',
  'profile.html', 'pricing.html',
];

// حجب الشبكة الخارجية (خطوط…) حتى تبقى الاختبارات سريعة وحتمية
test.beforeEach(async ({ context }) => {
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
});

for (const theme of ['dark', 'light']) {
  test(`كل الصفحات بلا أخطاء JS — ${theme}`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(`${e.message}`));
    await page.addInitScript(t => localStorage.setItem('luma_theme', t), theme);
    for (const f of PAGES) {
      await page.goto('/' + encodeURIComponent(f));
      await page.waitForTimeout(400);
      expect(errors, `${f} (${theme})`).toEqual([]);
      expect(await page.evaluate(() => document.body.innerText.trim().length),
        `${f} فارغة`).toBeGreaterThan(20);
    }
  });
}

test('التحويلات من الروابط العربية القديمة تعمل', async ({ page }) => {
  await page.goto('/' + encodeURIComponent('LUMA - المتجر.html'));
  await page.waitForURL(/store\.html/);
  await expect(page.locator('#grid .card').first()).toBeVisible();
});

test('لوحة الصالون: حجز جديد بتوفر حي', async ({ page }) => {
  await page.goto('/salon.html#board');
  await page.waitForTimeout(800);
  await page.click('button:has-text("+ موعد / وقت محجوب")');
  await page.fill('.lux-modal [name=client]', 'عميلة الاختبار');
  await page.fill('.lux-modal [name=staffq]', 'ريم');
  await page.waitForTimeout(300);
  await expect(page.locator('#bkAvail')).toContainText('متاح');
  await page.click('.lux-modal [data-ok]');
  await page.waitForTimeout(500);
  await expect(page.locator('.appt', { hasText: 'عميلة الاختبار' })).toBeVisible();
});

test('رحلة الدفع تُصدر فاتورة بهوية الصالون ورمز ZATCA', async ({ page }) => {
  await page.goto('/salon.html#board');
  await page.waitForTimeout(800);
  await page.locator('.appt', { hasText: 'نوف العتيبي' }).first().click();
  await page.click('[data-pay]');
  await page.click('.lux-modal [data-ok]');
  await page.waitForTimeout(1900);
  await expect(page.locator('#lumaInv')).toContainText('فاتورة ضريبية مبسطة');
  await expect(page.locator('#lumaInv')).toContainText(/INV-\d+/);
  await expect(page.locator('#lumaInv img[alt="ZATCA QR"]')).toBeVisible();   // رمز الفوترة الإلكترونية
});

test('شاشة التقارير بأرقام حية', async ({ page }) => {
  await page.goto('/salon.html#reports');
  await page.waitForTimeout(800);
  await expect(page.getByText('الإيراد الشهري المقدّر')).toBeVisible();
  await expect(page.getByText('أفضل الخدمات')).toBeVisible();
  await expect(page.getByText('مصادر العميلات')).toBeVisible();
  await expect(page.getByText('أداء الموظفات اليوم')).toBeVisible();
  await expect(page.getByText(/إشغال الكراسي/)).toBeVisible();
});

test('الموارد البشرية: رصيد الإجازات وسلسلة الموافقات', async ({ page }) => {
  await page.goto('/salon.html#hr');
  await page.waitForTimeout(800);
  await page.click('button:has-text("الطلبات")');
  await expect(page.getByText(/الرصيد المتبقي: \d+ يوماً/).first()).toBeVisible();
  await expect(page.locator('button', { hasText: /^اعتماد «/ }).first()).toBeVisible();
});

test('صفحة الحجز العامة: المعالج حتى النجاح', async ({ page }) => {
  await page.goto('/booking.html');
  await page.waitForTimeout(600);
  await page.locator('.svc').first().click();
  await page.locator('.stf:not(.leave)').first().click();
  await page.locator('.day:not([disabled])').first().click();
  await page.locator('.slot:not([disabled])').first().click();
  await page.click('button:has-text("متابعة")');
  await expect(page.getByText('تذكرة الحجز')).toBeVisible();
  await page.click('button:has-text("تأكيد الحجز")');
  await expect(page.getByText('تم تأكيد حجزك')).toBeVisible();
});

test('المتجر: نافذة الصالون بالتعليقات والاستفسارات', async ({ page }) => {
  await page.goto('/store.html');
  await page.waitForTimeout(700);
  await page.locator('.card.salon').first().click();
  await expect(page.locator('.sv-review').first()).toBeVisible();
  await expect(page.getByText('استفسارات')).toBeVisible();
});
