// ═══ اختبارات المرحلة ب — الجلسة والحارس ═══
// ملاحظة صريحة: التحقق في المتصفح ليس حاجزاً أمنياً — أي أحد يعدّل تخزين
// متصفحه. الحاجز الحقيقي هو Supabase Auth و RLS. ما تقيسه هذه الاختبارات
// أن التطبيق صار يعرف من المستخدمة، ولم يعد يمنح الدور لمن يفتح الصفحة.
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ context }) => {
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
});

const DASH = [['salon.html', 'salon'], ['expert.html', 'expert'],
              ['admin.html', 'admin'], ['client.html', 'client']];

for (const [f, role] of DASH) {
  test(`فتح ${f} بلا جلسة يحوّل لصفحة الدخول ولا يمنح دوراً`, async ({ page }) => {
    await page.goto('/' + f);
    await page.waitForURL(/login\.html/, { timeout: 8000 });
    expect(page.url()).toContain('login.html');
    expect(page.url()).toContain('next=' + f);          // يعود لحيث كانت بعد الدخول
    const granted = await page.evaluate(() => localStorage.getItem('luma_role'));
    expect(granted).toBeNull();                          // لم يُمنح دور بمجرد الفتح
  });

  test(`فتح ${f} بجلسة صحيحة يرسم اللوحة`, async ({ page }) => {
    await page.addInitScript(r => {
      localStorage.setItem('luma_session', JSON.stringify(
        { role: r, name: 'اختبار', at: Date.now(), exp: Date.now() + 3600e3 }));
    }, role);
    await page.goto('/' + f);
    await page.waitForTimeout(900);
    expect(page.url()).toContain(f);
    const navs = await page.locator('.nav-item, .tab').count();
    expect(navs).toBeGreaterThan(0);
  });
}

test('جلسة بدور آخر لا تفتح لوحة غير دورها', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('luma_session', JSON.stringify(
      { role: 'client', name: '', at: Date.now(), exp: Date.now() + 3600e3 }));
  });
  await page.goto('/admin.html');
  await page.waitForURL(/login\.html/, { timeout: 8000 });
  expect(page.url()).toContain('denied=1');
});

test('الجلسة المنتهية لا تفتح اللوحة', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('luma_session', JSON.stringify(
      { role: 'salon', name: '', at: Date.now() - 9e8, exp: Date.now() - 1000 }));
  });
  await page.goto('/salon.html');
  await page.waitForURL(/login\.html/, { timeout: 8000 });
});

test('صلاحية التحرير في المتجر لا تُمنح لزائرة', async ({ page }) => {
  await page.goto('/store.html');
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => LUMA_OWNER)).toBe(false);
  await expect(page.locator('.cvcam')).toHaveCount(0);
});

test('صلاحية التحرير تُمنح بجلسة مالكة فقط', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('luma_session', JSON.stringify(
      { role: 'salon', name: '', at: Date.now(), exp: Date.now() + 3600e3 }));
  });
  await page.goto('/store.html');
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => LUMA_OWNER)).toBe(true);
  await expect(page.locator('.card.salon .cvcam').first()).toBeVisible();
});

test('الدخول ينشئ جلسة ويعيد للوجهة المطلوبة', async ({ page }) => {
  await page.goto('/login.html?next=salon.html');
  await page.waitForTimeout(600);
  await page.fill('#identifier', '8ma.learn@gmail.com');
  await page.fill('#pw', '123654');
  await page.click('button:has-text("دخول")');
  await page.waitForTimeout(700);
  // الحساب الموحّد يعرض مختار اللوحة — نختار الصالون
  await page.locator('#panelPick .pc', { hasText: 'صالون' }).first().click();
  await page.waitForURL(/salon\.html/, { timeout: 8000 });
  const s = await page.evaluate(() => JSON.parse(localStorage.getItem('luma_session') || 'null'));
  expect(s).toBeTruthy();
  expect(s.role).toBe('salon');
  expect(s.exp).toBeGreaterThan(Date.now());
});

test('تسجيل الخروج يُنهي الجلسة فعلاً', async ({ page }) => {
  /* الجلسة تُنشأ مرة واحدة عبر LumaAuth نفسها — لا addInitScript، فذاك
     يُعيد زرعها في كل تنقّل فيبدو الخروج وكأنه فشل */
  await page.goto('/login.html');
  await page.waitForTimeout(500);
  await page.evaluate(() => LumaAuth.signIn('salon'));
  await page.goto('/salon.html');
  await page.waitForTimeout(900);
  await page.locator('a[title="تسجيل الخروج"]').click();
  await page.waitForURL(/login\.html/, { timeout: 8000 });
  const s = await page.evaluate(() => localStorage.getItem('luma_session'));
  expect(s).toBeNull();
  // والعودة للوحة بعدها تُمنع
  await page.goto('/salon.html');
  await page.waitForURL(/login\.html/, { timeout: 8000 });
});
