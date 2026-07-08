// ═══ سويت لوما — يعمل قبل كل دمج في main عبر GitHub Actions ═══
// يغطي: خلو كل الصفحات من أخطاء JS في الوضعين، وأهم التدفقات الوظيفية.
const { test, expect } = require('@playwright/test');

const PAGES = [
  'index.html', 'login.html', 'booking.html', 'review.html', '404.html',
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

test('معرض الأعمال: صور وفيديو من المحرر إلى صفحة الحجز', async ({ page }) => {
  const PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  await page.goto('/salon.html#page');
  await page.waitForTimeout(800);
  await expect(page.getByText('معرض الأعمال')).toBeVisible();
  // 1) رفع صورة من الجهاز (تُضغط عبر canvas)
  await page.setInputFiles('#galFile', { name: 'work.png', mimeType: 'image/png', buffer: Buffer.from(PX.split(',')[1], 'base64') });
  await page.waitForTimeout(800);
  await expect(page.locator('.gal-thumb')).toHaveCount(1);
  // 2) إضافة صورة برابط
  await page.fill('#galUrl', PX);
  await page.click('#galAdd');
  await page.waitForTimeout(500);
  await expect(page.locator('.gal-thumb')).toHaveCount(2);
  // 3) فيديو يوتيوب — يظهر بشارة تشغيل
  await page.fill('#galUrl', 'https://youtu.be/dQw4w9WgXcQ');
  await page.click('#galAdd');
  await page.waitForTimeout(500);
  await expect(page.locator('.gal-thumb', { hasText: '▶' })).toHaveCount(1);
  // 4) المعرض يظهر في صفحة الحجز العامة مع عارض مكبّر
  await page.goto('/booking.html');
  await page.waitForTimeout(600);
  await expect(page.getByText(/من أعمال/)).toBeVisible();
  await expect(page.locator('.gal-it')).toHaveCount(3);
  await page.locator('.gal-it').first().click();
  await expect(page.locator('.gal-lb img')).toBeVisible();
  await page.locator('.gal-lb .gx').click();
  await expect(page.locator('.gal-lb')).toHaveCount(0);
});

test('محرر الثيم المخصص: الألوان والزوايا تنعكس على صفحة الحجز والفاتورة', async ({ page }) => {
  await page.goto('/salon.html#page');
  await page.waitForTimeout(800);
  // تخصيص اللون المميز عبر حقل hex
  await page.fill('#thx-ac', '#ff2277');
  await page.locator('#thx-ac').evaluate(el => el.dispatchEvent(new Event('change')));
  await page.waitForTimeout(400);
  await expect(page.locator('#thBadge')).toBeVisible();                 // شارة «ثيم مخصص»
  // صفحة الحجز العامة تعتمد اللون المخصص
  await page.goto('/booking.html');
  await page.waitForTimeout(600);
  const ac = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ac').trim());
  expect(ac).toBe('#ff2277');
  // القالب الجاهز يعيد الاختيار كنقطة بداية
  await page.goto('/salon.html#page');
  await page.waitForTimeout(800);
  await page.click('button:has-text("زمرد هادئ")');
  await page.waitForTimeout(600);
  await expect(page.locator('#thx-ac')).toHaveValue('#8fd0c0');
});

test('إدارة الخدمات: إضافة خدمة تنعكس في الكتالوج', async ({ page }) => {
  await page.goto('/salon.html#services');
  await page.waitForTimeout(800);
  await page.click('button:has-text("+ خدمة جديدة")');
  await page.fill('#svN', 'باديكير سبا');
  await page.fill('#svP', '300');
  await page.click('.lux-modal [data-ok]');
  await page.waitForTimeout(500);
  await expect(page.locator('.card', { hasText: 'باديكير سبا' })).toBeVisible();
  await expect(page.locator('.card', { hasText: 'باديكير سبا' })).toContainText('300');
  // تحرير سعر خدمة قائمة
  await page.locator('.card', { hasText: 'منيكير جل' }).locator('button:has-text("تحرير")').click();
  await page.fill('#svP', '180');
  await page.click('.lux-modal [data-ok]');
  await page.waitForTimeout(500);
  await expect(page.locator('.card', { hasText: 'منيكير جل' })).toContainText('180');
});

test('التقارير: تصدير للطباعة وملخص أسبوعي', async ({ page }) => {
  await page.goto('/salon.html#reports');
  await page.waitForTimeout(800);
  const [pop] = await Promise.all([
    page.waitForEvent('popup'),
    page.click('button:has-text("تصدير التقرير")'),
  ]);
  await pop.waitForLoadState('domcontentloaded');
  await expect(pop.getByText('تقرير الأداء الشهري')).toBeVisible();
  await page.click('button:has-text("الملخص الأسبوعي")');
  await expect(page.getByText('هذا ملخص أسبوعك في صالون لمسة')).toBeVisible();
  await expect(page.getByText(/نجمة الأسبوع/)).toBeVisible();
});

test('برنامج الولاء: نقاط العميلات والإعدادات والاستبدال', async ({ page }) => {
  await page.goto('/salon.html#clients');
  await page.waitForTimeout(800);
  await expect(page.locator('.loypts').first()).toBeVisible();          // شارة النقاط لكل عميلة
  await page.click('button:has-text("برنامج الولاء")');
  await expect(page.getByText('نقطة لكل ريال مدفوع')).toBeVisible();
  await expect(page.getByText('LUMA10')).toBeVisible();                  // كوبون الافتتاح
  await page.locator('.x').click();                                      // إغلاق النافذة
  await page.waitForTimeout(400);
  // استبدال نقاط نوف (920) بمكافأة 30 ر.س
  await page.locator('.ctr', { hasText: 'نوف العتيبي' }).locator('.loypts').click();
  await page.click('.lux-modal button:has-text("خصم 30 ر.س")');
  await expect(page.getByText('كوبون العميلة الشخصي')).toBeVisible();
});

test('المخزون مربوط بالخدمات: خصم تلقائي بعد الدفع', async ({ page }) => {
  // قبل الدفع: محلول هيدرافيشل = 22
  await page.goto('/salon.html#inventory');
  await page.waitForTimeout(800);
  await expect(page.getByText('وصفات الخدمات')).toBeVisible();
  const row = page.locator('.ivr', { hasText: 'محلول هيدرافيشل' });
  await expect(row.locator('.num').first()).toHaveText('22');
  await expect(row.getByText(/يُستهلك في/)).toBeVisible();
  // دفع حجز «سارة الأحمدي · هيدرافيشل» (تنقّل عبر القائمة — الهاش وحده لا يعيد التصيير)
  await page.click('.nav-item[data-id="board"]');
  await page.waitForTimeout(600);
  await page.locator('.appt', { hasText: 'سارة الأحمدي' }).first().click();
  await page.click('[data-pay]');
  await page.click('.lux-modal [data-ok]');
  await page.waitForTimeout(1900);
  await expect(page.locator('#lumaInv')).toBeVisible();
  // بعد الدفع: خُصمت وحدة واحدة تلقائياً
  await page.locator('.x').last().click();          // إغلاق نافذة الفاتورة
  await page.waitForTimeout(400);
  await page.click('.nav-item[data-id="inventory"]');
  await page.waitForTimeout(600);
  await expect(page.locator('.ivr', { hasText: 'محلول هيدرافيشل' }).locator('.num').first()).toHaveText('21');
});

test('كوبون الخصم يعمل في صفحة الحجز العامة', async ({ page }) => {
  await page.goto('/booking.html');
  await page.waitForTimeout(600);
  await page.locator('.svc').first().click();
  await page.locator('.stf:not(.leave)').first().click();
  await page.locator('.day:not([disabled])').first().click();
  await page.locator('.slot:not([disabled])').first().click();
  await page.click('button:has-text("متابعة")');
  await page.fill('#cpn', 'LUMA10');
  await page.click('button:has-text("تطبيق")');
  await expect(page.getByText('تم تطبيق الخصم ✓')).toBeVisible();
  await expect(page.locator('.trow2', { hasText: 'كوبون' })).toBeVisible();
  await page.click('button:has-text("تأكيد الحجز")');
  await expect(page.getByText('تم تأكيد حجزك')).toBeVisible();
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

test('الفروع المتعددة: التبديل يعزل الطاقم والحجوزات', async ({ page }) => {
  await page.goto('/salon.html#board');
  await page.waitForTimeout(800);
  await expect(page.locator('.appt', { hasText: 'نوف العتيبي' }).first()).toBeVisible();
  // التبديل لفرع الروضة من الشريط الجانبي (يعيد التحميل)
  await page.click('.br-switch button:has-text("الروضة")');
  await page.waitForTimeout(1200);
  await expect(page.locator('.appt', { hasText: 'أفنان الحربي' }).first()).toBeVisible();
  await expect(page.locator('.appt', { hasText: 'نوف العتيبي' })).toHaveCount(0);
  await expect(page.getByText('شهد').first()).toBeVisible();
  // العودة للفرع الرئيسي
  await page.click('.br-switch button:has-text("الشاطئ")');
  await page.waitForTimeout(1200);
  await expect(page.locator('.appt', { hasText: 'نوف العتيبي' }).first()).toBeVisible();
});

test('تقييم ما بعد الزيارة: من الدفع إلى تعليق موثق في المتجر', async ({ page }) => {
  // 1) دفع حجز «لطيفة المطيري»
  await page.goto('/salon.html#board');
  await page.waitForTimeout(800);
  await page.locator('.appt', { hasText: 'لطيفة المطيري' }).first().click();
  await page.click('[data-pay]');
  await page.click('.lux-modal [data-ok]');
  await page.waitForTimeout(1900);
  await expect(page.locator('#lumaInv')).toBeVisible();
  // 2) صفحة التقييم تلتقط الطلب المعلق
  await page.goto('/review.html');
  await page.waitForTimeout(500);
  await expect(page.getByText(/كيف كانت تجربتك يا لطيفة/)).toBeVisible();
  await page.fill('#txt', 'منيكير وبديكير مثاليان — تجربة راقية فعلاً.');
  await page.click('#send');
  await expect(page.getByText(/شكراً لكِ يا لطيفة/)).toBeVisible();
  // 3) التعليق يظهر موثقاً في صفحة الصالون بالمتجر
  await page.goto('/store.html');
  await page.waitForTimeout(700);
  await page.locator('.card.salon').first().click();
  await expect(page.getByText('منيكير وبديكير مثاليان — تجربة راقية فعلاً.')).toBeVisible();
  await expect(page.getByText('زيارة موثقة ✓').first()).toBeVisible();
});

test('المتجر: نافذة الصالون بالتعليقات والاستفسارات', async ({ page }) => {
  await page.goto('/store.html');
  await page.waitForTimeout(700);
  await page.locator('.card.salon').first().click();
  await expect(page.locator('.sv-review').first()).toBeVisible();
  await expect(page.getByText('استفسارات')).toBeVisible();
});
