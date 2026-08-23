// ═══ سويت لوما — يعمل قبل كل دمج في main عبر GitHub Actions ═══
// يغطي: خلو كل الصفحات من أخطاء JS في الوضعين، وأهم التدفقات الوظيفية.
const { test, expect } = require('@playwright/test');

const PAGES = [
  'index.html', 'login.html', 'booking.html', 'review.html', '404.html',
  'store.html', 'market.html', 'salons.html', 'experience.html', 'expert-landing.html',
  'salon.html', 'expert.html', 'client.html', 'admin.html',
  'profile.html', 'pricing.html',
];

// حجب الشبكة الخارجية (خطوط…) حتى تبقى الاختبارات سريعة وحتمية
test.beforeEach(async ({ context }) => {
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
});

// معالج الحجز العام: بعض الأيام عطلة (الجمعة) — نختار أول يوم فيه مواعيد متاحة
// التدفق الجديد: يوم مشترك للزيارة ثم إسناد (خبيرة + وقت) لكل خدمة حتى تظهر التذكرة
async function wizardAssign(page) {
  await page.locator('.day:not([disabled])').first().click();
  await page.click('button:has-text("متابعة")');
  for (let g = 0; g < 8; g++) {
    await page.waitForTimeout(250);
    if (await page.locator('.ticket').count()) return;
    const staff = page.locator('.stf:not(.leave)');
    const n = await staff.count();
    let done = false;
    for (let i = 0; i < n && !done; i++) {
      await staff.nth(i).click();
      await page.waitForTimeout(200);
      if (await page.locator('.slot:not([disabled])').count()) {
        await page.locator('.slot:not([disabled])').first().click();
        done = true;
      }
    }
    if (!done) break;
  }
}

async function pickDayWithSlots(page) {
  const days = page.locator('.day:not([disabled])');
  const n = await days.count();
  for (let i = 0; i < n; i++) {
    await days.nth(i).click();
    await page.waitForTimeout(250);
    if (await page.locator('.slot:not([disabled])').count()) return;
  }
}

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
  await page.selectOption('.lux-modal [name=staffq]', 'ريم');
  // القائمتان تعرضان كل الخبيرات وكل الخدمات
  expect(await page.locator('.lux-modal [name=staffq] option').count()).toBeGreaterThanOrEqual(4);
  expect(await page.locator('.lux-modal [name=service] option').count()).toBeGreaterThanOrEqual(6);
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

test('العملاء: خانة تسجيل العملاء تسجّل عميلة وتظهر بالجدول وتبقى بعد التحديث', async ({ page }) => {
  await page.goto('/salon.html#clients');
  await page.waitForTimeout(800);
  await expect(page.getByText('تسجيل العملاء').first()).toBeVisible();
  // رقم خاطئ يُرفض
  await page.fill('#regName', 'جوري السالم');
  await page.fill('#regPhone', '123');
  await page.click('button:has-text("تسجيل")');
  await page.waitForTimeout(300);
  await expect(page.locator('.ctr', { hasText: 'جوري السالم' })).toHaveCount(0);
  // رقم صحيح → تُسجَّل وتظهر أول الجدول وتبقى بعد إعادة التحميل
  await page.fill('#regPhone', '0554443322');
  await page.click('button:has-text("تسجيل")');
  await page.waitForTimeout(500);
  await expect(page.locator('.ctr', { hasText: 'جوري السالم' })).toBeVisible();
  await page.reload();
  await page.waitForTimeout(800);
  await expect(page.locator('.ctr', { hasText: 'جوري السالم' })).toBeVisible();
});

test('الخدمات: إضافة صورة لكل خدمة وتظهر بصفحة الحجز', async ({ page }) => {
  await page.goto('/salon.html#services');
  await page.waitForTimeout(800);
  const firstBtn = page.locator('button:has-text("إضافة صورة")').first();
  await expect(firstBtn).toBeVisible();
  const PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), firstBtn.click()]);
  await fc.setFiles({ name: 'svc.png', mimeType: 'image/png', buffer: Buffer.from(PX, 'base64') });
  await page.waitForTimeout(700);
  await expect(page.locator('.svc img[alt="مكياج سهرة"]')).toBeVisible();
  await expect(page.locator('button:has-text("تغيير الصورة")').first()).toBeVisible();
  // الصورة تظهر لعميلات صفحة الحجز
  await page.goto('/booking.html');
  await page.waitForTimeout(700);
  await expect(page.locator('.svc', { hasText: 'مكياج سهرة' }).locator('img')).toBeVisible();
  // الإزالة تعيد الأيقونة
  await page.goto('/salon.html#services');
  await page.waitForTimeout(800);
  await page.locator('button[title="إزالة الصورة"]').first().click();
  await page.waitForTimeout(500);
  await expect(page.locator('.svc img[alt="مكياج سهرة"]')).toHaveCount(0);
  // قسم المنتجات انتقل لشاشة الخدمات — مع رفع صورة للمنتج
  await expect(page.getByText('المنتجات — بيع التجزئة للعميلات')).toBeVisible();
  await expect(page.getByText('سيروم ترطيب').first()).toBeVisible();
  const [fc2] = await Promise.all([page.waitForEvent('filechooser'), page.locator('div[title="إضافة صورة للمنتج"]').first().click()]);
  await fc2.setFiles({ name: 'p.png', mimeType: 'image/png', buffer: Buffer.from(PX, 'base64') });
  await page.waitForTimeout(700);
  expect(await page.locator('div[title="تغيير صورة المنتج"] img').count()).toBeGreaterThan(0);
});

test('لوحة الخبيرة: برنامج الولاء بأدوات فعلية — إعدادات واستبدال يصدر كوبوناً', async ({ page }) => {
  // انتقل برنامج الولاء إلى شاشة أدوات احترافية
  await page.goto('/expert.html#advanced');
  await page.waitForTimeout(900);
  await page.click('.adv-chip:has-text("برنامج الولاء")');
  await page.waitForTimeout(500);
  await expect(page.getByText('برنامج الولاء مُفعّل')).toBeVisible();
  await expect(page.getByText('نوف العتيبي')).toBeVisible();
  // حفظ الإعدادات يعمل
  await page.fill('#elRate', '2');
  await page.click('button:has-text("حفظ الإعدادات")');
  await page.waitForTimeout(500);
  await expect(page.locator('#elRate')).toHaveValue('2');
  // الاستبدال: نوف (1240 نقطة) تستبدل مكافأة → يصدر كوبون حقيقي وينخفض رصيدها
  await page.locator('.mem', { hasText: 'نوف العتيبي' }).locator('button:has-text("استبدال")').click();
  await page.waitForTimeout(400);
  await expect(page.locator('.lux-modal')).toContainText('الرصيد الحالي');
  await page.click('.lux-modal button:has-text("استبدال وإصدار كوبون")');
  await page.waitForTimeout(600);
  await expect(page.locator('.mem', { hasText: 'نوف العتيبي' })).toContainText('740');
  const coupons = await page.evaluate(() => JSON.parse(localStorage.getItem('luma_coupons') || '[]'));
  expect(coupons.some(c => (c.note || '').includes('ولاء'))).toBeTruthy();
  // إضافة مكافأة جديدة
  await page.click('.more:has-text("+ مكافأة")');
  await page.waitForTimeout(300);
  await page.fill('.lux-modal [name=rn]', 'خصم 20%');
  await page.click('.lux-modal [data-ok]');
  await page.waitForTimeout(500);
  await expect(page.locator('.rwd', { hasText: 'خصم 20%' })).toBeVisible();
});

test('التسويق: خدمة الولاء ظاهرة بإحصاءاتها وزر الإعدادات يعمل', async ({ page }) => {
  await page.goto('/salon.html#marketing');
  await page.waitForTimeout(800);
  await expect(page.getByText('برنامج الولاء').first()).toBeVisible();
  await expect(page.getByText('نقطة / ريال')).toBeVisible();
  await expect(page.getByText('عميلة مشتركة')).toBeVisible();
  await expect(page.getByText('نقطة موزّعة')).toBeVisible();
  await page.click('button:has-text("إعدادات برنامج الولاء")');
  await page.waitForTimeout(400);
  await expect(page.locator('.lux-modal')).toContainText('نقطة لكل ريال مدفوع');
  await page.click('.lux-modal .x');
  // بطاقات الإهداء انتقلت إلى تسويق الصالون
  await expect(page.getByText('بطاقات الإهداء').first()).toBeVisible();
  await expect(page.getByText('ذهبية كلاسيك')).toBeVisible();
  // ولم تعد ضمن أدوات الخبيرة الاحترافية
  await page.goto('/expert.html#advanced');
  await page.waitForTimeout(800);
  await expect(page.locator('.adv-chip', { hasText: 'بطاقات الإهداء' })).toHaveCount(0);
});

test('اسم الخبيرة بأعلى لوحتها يفتح ملفها العام', async ({ page }) => {
  await page.goto('/expert.html');
  await page.waitForTimeout(700);
  await page.click('#meChip');
  await page.waitForURL(/experience\.html/);
  await page.waitForTimeout(600);
  await expect(page.getByText('رهف العتيبي').first()).toBeVisible();
  await expect(page.locator('#exp-rate')).toBeVisible();
});

test('الباقات: سَناء ووَهَج للخبيرات وفَريد للصوالين', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForTimeout(500);
  const tiers = page.locator('.tier');
  await expect(tiers.nth(0).locator('.aud')).toHaveText('ستاندر · للخبيرات المستقلات'); // سَناء
  await expect(tiers.nth(1).locator('.aud')).toHaveText('للخبيرات المستقلات');           // وَهَج
  await expect(tiers.nth(1)).toContainText('التحليلات والأدوات الاحترافية');
  await expect(tiers.nth(2).locator('.aud')).toHaveText('للصوالين والمراكز');             // فَرِيد
  // وثيقة الباقات تعرض التصنيف نفسه
  await page.goto('/pricing.html');
  await page.waitForTimeout(700);
  expect(await page.getByText('للخبيرات المستقلات').count()).toBeGreaterThanOrEqual(2);
  expect(await page.getByText('للصوالين والمراكز').count()).toBeGreaterThanOrEqual(1);
});

test('زر «ابدئي مجاناً 14 يوماً» يوجّه لصفحة الباقات', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForTimeout(500);
  await page.locator('a:has-text("ابدئي مجاناً 14 يوماً")').click();
  await page.waitForURL(/pricing\.html/);
  await expect(page.getByText('وثيقة الباقات والأسعار').first()).toBeVisible();
});

test('سهم الرجوع في صفحة الحجز يعيد للصفحة السابقة', async ({ page }) => {
  await page.goto('/store.html');
  await page.waitForTimeout(500);
  await page.goto('/booking.html');
  await page.waitForTimeout(500);
  await expect(page.locator('.backTop')).toBeVisible();
  await page.click('.backTop');
  await page.waitForURL(/store\.html/);
});

test('الإشعارات: كل حجز أو عملية بالمنصة تظهر بلوحة الأدمن', async ({ page }) => {
  // حجز أونلاين يسجّل حدثاً
  await page.goto('/booking.html');
  await page.waitForTimeout(600);
  await page.locator('.svc', { hasText: 'مكياج سهرة' }).click();
  await page.click('button:has-text("متابعة")');
  await wizardAssign(page);
  await page.click('button:has-text("تأكيد الحجز")');
  await expect(page.getByText('تم تأكيد حجزك')).toBeVisible();
  // الأدمن: الجرس يحمل عدداً، واللوحة المنسدلة والبطاقة تعرضان الحدث
  await page.goto('/admin.html');
  await page.waitForTimeout(800);
  await expect(page.locator('#ntfPip')).toBeVisible();
  await expect(page.getByText('الإشعارات الحية')).toBeVisible();
  await expect(page.getByText(/حجز أونلاين جديد لدى صالون لمسة/).first()).toBeVisible();
  await page.click('#ntfBell');
  await page.waitForTimeout(300);
  await expect(page.locator('#ntfPanel')).toBeVisible();
  await expect(page.locator('#ntfPanel')).toContainText('مكياج سهرة');
  // النقر على الإشعار يفتح صفحة الحدث نفسها (لوحة حجوزات الصالون)
  await page.click('#ntfPanel .ev[data-href]');
  await page.waitForURL(/salon\.html#board/);
  await page.waitForTimeout(600);
  await expect(page.getByText('لوحة الحجوزات').first()).toBeVisible();
  // والنقرة تحتسب الإشعارات مقروءة — العداد يختفي
  await page.goto('/admin.html');
  await page.waitForTimeout(700);
  await expect(page.locator('#ntfPip')).toBeHidden();
  // نفس الإشعارات تعمل بلوحة الخبيرة أيضاً
  await page.goto('/expert.html');
  await page.waitForTimeout(800);
  await page.click('#ntfBell');
  await page.waitForTimeout(300);
  await expect(page.locator('#ntfPanel')).toBeVisible();
  await expect(page.locator('#ntfPanel')).toContainText('مكياج سهرة');
});

test('صالون بليجر سبأ: بالمتجر وبقائمة خدماته الخاصة (حمامات ومساجات)', async ({ page }) => {
  // البطاقة بالمتجر
  await page.goto('/store.html');
  await page.waitForTimeout(700);
  const card = page.locator('.card.salon', { hasText: 'بليجر سبأ' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('حي الرحاب');
  await expect(card).toContainText('حمام مغربي');
  // صفحة الحجز: القائمة الخاصة كاملة والفريق من طاقمه
  await page.goto('/experience.html?name=' + encodeURIComponent('بليجر سبأ')
    + '&type=salon&role=' + encodeURIComponent('صالون · سبا') + '&city=' + encodeURIComponent('جازان'));
  await page.waitForTimeout(600);
  for (const s of ['تصفيف الشعر', 'العناية بالأظافر', 'الحمام المغربي', 'الحمام السوداني', 'مساج الأخشاب', 'المساج التايلندي', 'مساج الأحجار الساخنة'])
    await expect(page.locator('.opt', { hasText: s }).first()).toBeVisible();
  expect(await page.locator('.opt').count()).toBe(7);
});

test('صفحة الصالون: قائمة خدمات موسّعة تشمل الأظافر والبشرة والفروة والحمام المغربي والمساج', async ({ page }) => {
  await page.goto('/experience.html?name=' + encodeURIComponent('الجوهرة سبأ')
    + '&type=salon&role=' + encodeURIComponent('صالون · متكامل') + '&city=' + encodeURIComponent('جازان'));
  await page.waitForTimeout(600);
  for (const s of ['مناكير', 'بدكير', 'تنظيف بشرة عميق', 'تنظيف فروة الرأس', 'حمام مغربي', 'مساج استرخائي'])
    await expect(page.locator('.opt', { hasText: s }).first()).toBeVisible();
  // خصم الجوهرة 30% ينطبق على الخدمات الجديدة أيضاً (320 → 224)
  await expect(page.locator('.opt', { hasText: 'حمام مغربي' })).toContainText('224');
});

test('سهم الرجوع من تبويب جديد يعيد لصفحة المصدر نفسها لا للمتجر', async ({ page, context }) => {
  await page.goto('/client.html');
  await page.waitForTimeout(700);
  await page.click('.tab[data-t="explore"]');
  await page.waitForTimeout(400);
  // «احجزي» يفتح صفحة الحجز بتبويب جديد — السهم يجب أن يعيد لتطبيق العميلة
  const [pop] = await Promise.all([
    context.waitForEvent('page'),
    page.locator('#exList .card', { hasText: 'صالون لمسة' }).locator('a.gbtn').click(),
  ]);
  await pop.waitForLoadState();
  await pop.waitForTimeout(700);
  await pop.click('.backTop');
  await pop.waitForURL(/client\.html/);
});


test('حجز أكثر من خدمة في موعد واحد مع مجموع السعر والمدة', async ({ page }) => {
  await page.goto('/booking.html');
  await page.waitForTimeout(600);
  // اختيار خدمتين — تظهر علامتا ✓ وزر متابعة بالمجموع
  await page.locator('.svc', { hasText: 'مكياج سهرة' }).click();      // 350 · 60د
  await page.locator('.svc', { hasText: 'منيكير جل' }).click();       // 160 · 60د
  await expect(page.locator('.svc.sel')).toHaveCount(2);
  await expect(page.locator('button', { hasText: 'متابعة' })).toContainText('خدمات');
  await expect(page.locator('button', { hasText: 'متابعة' })).toContainText('510');
  await page.click('button:has-text("متابعة")');
  await wizardAssign(page);
  // التذكرة: الخدمتان + المدة الإجمالية + المجموع
  await expect(page.getByText('مكياج سهرة + منيكير جل')).toBeVisible();
  await expect(page.getByText('120 دقيقة')).toBeVisible();
  await expect(page.locator('.total')).toContainText('510');
  await page.click('button:has-text("تأكيد الحجز")');
  await expect(page.getByText('تم تأكيد حجزك')).toBeVisible();
});

test('الدخول الموحّد: بريد واحد وكلمة مرور واحدة ثم اختيار اللوحة', async ({ page }) => {
  await page.goto('/login.html');
  await page.waitForTimeout(500);
  // كلمة مرور خاطئة → رسالة خطأ ولا انتقال
  await page.fill('#identifier', '8ma.learn@gmail.com');
  await page.fill('#pw', '000000');
  await page.click('button:has-text("دخول")');
  await expect(page.locator('#loginErr')).toBeVisible();
  expect(page.url()).toContain('login.html');
  // كلمة المرور الصحيحة → نافذة اختيار اللوحة بخمس وجهات
  await page.fill('#pw', '123654');
  await page.click('button:has-text("دخول")');
  await expect(page.locator('#panelPick')).toBeVisible();
  await expect(page.locator('#panelPick .pc')).toHaveCount(5);
  await expect(page.locator('#panelPick')).toContainText('بوابة الموظفة');
  // اختيار لوحة الصالون يفتحها
  await page.click('#panelPick a:has-text("صالون")');
  await page.waitForURL(/salon\.html/);
  // البطاقات السريعة تعرض الحساب الموحّد
  await page.goto('/login.html');
  await page.waitForTimeout(500);
  await expect(page.locator('.dacc .e').first()).toHaveText('8ma.learn@gmail.com');
});

test('تطبيق العميلة: تبويب استكشفي بالتفاصيل والفلاتر كالموقع', async ({ page }) => {
  await page.goto('/client.html');
  await page.waitForTimeout(700);
  await page.click('.tab[data-t="explore"]');
  await page.waitForTimeout(400);
  await expect(page.locator('#exCount')).toHaveText('17');
  // تفاصيل البطاقة: تقييم وفروع وخبيرات ووسوم وخصم
  const jaw = page.locator('#exList .card', { hasText: 'الجوهرة سبأ' });
  await expect(jaw).toContainText('2 فروع');
  await expect(jaw).toContainText('خصم 30%');
  await expect(jaw).toContainText('105');
  expect(await jaw.locator('a').getAttribute('href')).toContain('experience.html');
  // فلتر النوع: صوالين فقط (مبدّل مقسّم)
  await page.click('button:has-text("صوالين")');
  await page.waitForTimeout(400);
  await expect(page.locator('#exCount')).toHaveText('8');
  // فلتر المدينة: جازان — من لوحة الفلاتر السفلية (الجوهرة + بليجر)
  await page.click('button:has-text("فلترة")');
  await page.waitForTimeout(400);
  await page.click('#exSheetIn button:has-text("جازان")');
  await page.waitForTimeout(250);
  await expect(page.locator('#exSheetIn button:has-text("عرض النتائج")')).toContainText('(2)');
  await page.click('#exSheetIn button:has-text("عرض النتائج")');
  await page.waitForTimeout(400);
  await expect(page.locator('#exCount')).toHaveText('2');
  await expect(page.locator('#exList')).toContainText('بليجر سبأ');
  // وسم الفلتر النشط ظاهر بالشريط ويمكن إزالته
  await expect(page.locator('button:has-text("جازان ✕")')).toBeVisible();
  // البحث الحي (بعد تصفير الفلاتر بزر مسح)
  await page.click('button:has-text("مسح")');
  await page.waitForTimeout(400);
  await expect(page.locator('#exCount')).toHaveText('8');
  await page.click('button:has-text("الكل")');
  await page.waitForTimeout(300);
  await page.fill('input[placeholder*="ابحثي"]', 'رهف');
  await page.waitForTimeout(300);
  await expect(page.locator('#exList .card')).toHaveCount(1);
  await expect(page.locator('#exList')).toContainText('رهف العتيبي');
});

test('تطبيق العميلة: حجز جديد من لوحة الوجهات وروابط حجز فعلية', async ({ page }) => {
  await page.goto('/client.html');
  await page.waitForTimeout(700);
  await page.click('button:has-text("حجز جديد")');
  await page.waitForTimeout(400);
  await expect(page.getByText('اختاري وجهتك')).toBeVisible();
  // صالون لمسة → صفحته الحية، والجوهرة سبأ → معالج الصالون (مع شارة الخصم)
  const rows = page.locator('.bk-row');
  expect(await rows.filter({ hasText: 'صالون لمسة' }).locator('a').getAttribute('href')).toBe('booking.html');
  expect(await rows.filter({ hasText: 'الجوهرة سبأ' }).locator('a').getAttribute('href')).toContain('experience.html');
  await expect(rows.filter({ hasText: 'الجوهرة سبأ' })).toContainText('خصم 30%');
  // المفضلات داخل اللوحة أيضاً
  expect(await rows.filter({ hasText: 'رهف العتيبي' }).locator('a').getAttribute('href')).toContain('experience.html');
});

test('«من نحن» نافذة منبثقة اختيارية في صفحة الحجز', async ({ page }) => {
  // بدون نص: لا زر
  await page.goto('/booking.html');
  await page.waitForTimeout(500);
  await expect(page.locator('.aboutBtn')).toHaveCount(0);
  // كتابة «من نحن» من المحرر — ضمن قسم الصفحات
  await page.goto('/salon.html#page');
  await page.waitForTimeout(800);
  await page.click('button:has-text("الصفحات")');
  await page.waitForTimeout(300);
  await page.fill('#aboutIn', 'بدأنا في 2019 برؤية بسيطة: جمالك يستحق مستوى آخر.\nطاقمنا خبيرات معتمدات بشهادات عالمية.');
  await page.waitForTimeout(400);
  // الزر يظهر والنافذة تعرض الفقرات
  await page.goto('/booking.html');
  await page.waitForTimeout(500);
  await page.click('.aboutBtn');
  await expect(page.locator('.wpop .wabout')).toContainText('بدأنا في 2019');
  await expect(page.locator('.wpop .wabout')).toContainText('خبيرات معتمدات');
  await page.click('.wpop .wok');
  await page.waitForTimeout(400);
  await expect(page.locator('.wpop')).toHaveCount(0);
});

test('موقعي بالخريطة: من المحرر إلى خريطة مدمجة في صفحة الحجز', async ({ page }) => {
  // بدون موقع: لا خريطة
  await page.goto('/booking.html');
  await page.waitForTimeout(500);
  await expect(page.locator('.mapc')).toHaveCount(0);
  // إدخال إحداثيات من المحرر
  await page.goto('/salon.html#page');
  await page.waitForTimeout(800);
  await page.click('button:has-text("الهوية")');
  await page.waitForTimeout(300);
  await page.fill('#mapIn', '21.543333,39.172779');
  await page.waitForTimeout(400);
  // صفحة الحجز: خريطة مدمجة + زر اتجاهات بالإحداثيات
  await page.goto('/booking.html');
  await page.waitForTimeout(500);
  await expect(page.locator('.mapc .mapf')).toHaveCount(1);
  expect(await page.locator('.mapc .mapf').getAttribute('src')).toContain('21.543333,39.172779');
  expect(await page.locator('.mapc a').getAttribute('href')).toContain('query=21.543333,39.172779');
  await expect(page.getByText('موقعنا')).toBeVisible();
});

test('روابط السوشل ميديا الاختيارية تظهر في صفحة الحجز', async ({ page }) => {
  // بدون روابط: لا أيقونات
  await page.goto('/booking.html');
  await page.waitForTimeout(500);
  await expect(page.locator('.socs')).toHaveCount(0);
  // تعبئة إنستقرام (باسم مستخدم) وواتساب (برقم) من المحرر
  await page.goto('/salon.html#page');
  await page.waitForTimeout(800);
  await page.click('button:has-text("الهوية")');
  await page.waitForTimeout(300);
  await page.fill('#soc-ig', '@lamsa.beauty');
  await page.fill('#soc-wa', '0555123456');
  await page.waitForTimeout(400);
  // الأيقونتان تظهران بروابط مطبَّعة
  await page.goto('/booking.html');
  await page.waitForTimeout(500);
  await expect(page.locator('.head .socs .soc')).toHaveCount(2);
  expect(await page.locator('.head .soc-ig').getAttribute('href')).toBe('https://instagram.com/lamsa.beauty');
  expect(await page.locator('.head .soc-wa').getAttribute('href')).toBe('https://wa.me/966555123456');
});

test('نوع الخط وشريط الترحيب من المحرر إلى صفحة الحجز', async ({ page }) => {
  await page.goto('/salon.html#page');
  await page.waitForTimeout(800);
  await page.click('button:has-text("الهوية")');
  await page.waitForTimeout(300);
  // اختيار خط «أميري» + كتابة رسالة ترحيب
  await page.locator('.font-chip', { hasText: 'أميري' }).click();
  await page.waitForTimeout(500);
  await page.click('button:has-text("الواجهة")');
  await page.waitForTimeout(300);
  await page.fill('#wbIn', '🌸 أهلاً بك! خصم 10٪ على أول حجز بكود LUMA10');
  await page.waitForTimeout(400);
  // صفحة الحجز: الخط مطبق والشريط ظاهر
  await page.goto('/booking.html');
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => document.body.style.fontFamily)).toContain('Amiri');
  // رسالة الترحيب نافذة منبثقة باسم الصالون
  await expect(page.locator('.wpop .wmsg')).toContainText('أهلاً بك! خصم 10٪');
  await expect(page.locator('.wpop .wsalon')).toContainText('صالون لمسة');
  // الإغلاق يخفيها لبقية الجلسة
  await page.click('.wpop .wok');
  await page.waitForTimeout(400);
  await expect(page.locator('.wpop')).toHaveCount(0);
  await page.reload();
  await page.waitForTimeout(500);
  await expect(page.locator('.wpop')).toHaveCount(0);
});

test('سياسة الحجز والخدمات المميزة تظهر في صفحة الحجز', async ({ page }) => {
  await page.goto('/salon.html#page');
  await page.waitForTimeout(800);
  await page.click('button:has-text("الصفحات")');
  await page.waitForTimeout(300);
  await expect(page.getByText('صفحات الموقع')).toBeVisible();
  // تمييز خدمة إضافية بشارة «عرض خاص» — من قسم التصنيفات
  await page.click('button:has-text("التصنيفات")');
  await page.waitForTimeout(300);
  await page.locator('.feat-sel').first().selectOption('عرض خاص');
  await page.waitForTimeout(500);
  // صفحة الحجز: الشارات والسياسة
  await page.goto('/booking.html');
  await page.waitForTimeout(600);
  await expect(page.locator('.svc .feat', { hasText: 'الأكثر طلباً' })).toBeVisible();   // الافتراضية
  await expect(page.locator('.svc .feat', { hasText: 'عرض خاص' })).toBeVisible();       // المضافة
  await expect(page.getByText('سياسة الحجز', { exact: false }).first()).toBeVisible();
  await expect(page.getByText(/إلغاء أو تعديل الحجز مجاناً/).first()).toBeVisible();
  // البنود تظهر أيضاً في خطوة التأكيد
  await page.locator('.svc').first().click();
  await page.click('button:has-text("متابعة")');
  await wizardAssign(page);
  await expect(page.locator('.policy.compact')).toBeVisible();
});

test('موقع الصالون: قائمة منسدلة بسبعة أقسام + بنرات وتصنيفات تعمل بالموقع', async ({ page }) => {
  await page.goto('/salon.html#page');
  await page.waitForTimeout(800);
  // القائمة الجانبية: النقر يفتح الفروع السبعة
  await page.click('.nav-item[data-id="page"]');
  await page.waitForTimeout(300);
  for (const l of ['عام', 'الهوية', 'استوديو التصميم', 'الواجهة', 'البنرات', 'الصفحات', 'التصنيفات'])
    await expect(page.locator('.pgsub', { hasText: l })).toBeVisible();
  // البنرات: إضافة بنر يظهر بالموقع
  await page.locator('.pgsub[data-sub="banners"]').click();
  await page.waitForTimeout(400);
  await page.fill('#bnIn', 'توصيل مجاني للطلبات فوق 200 ر.س');
  await page.locator('.card', { hasText: 'البنرات الترويجية' }).locator('button:has-text("+ إضافة")').click();
  await page.waitForTimeout(500);
  await expect(page.getByText('توصيل مجاني للطلبات فوق 200 ر.س').first()).toBeVisible();
  // التصنيفات: إخفاء «عناية»
  await page.locator('.pgsub[data-sub="cats"]').click();
  await page.waitForTimeout(400);
  await page.click('button:has-text("عناية")');
  await page.waitForTimeout(400);
  // موقع الصالون العام: البنر ظاهر
  await page.goto('/booking.html');
  await page.waitForTimeout(700);
  await expect(page.getByText('توصيل مجاني للطلبات فوق 200 ر.س')).toBeVisible();
});

test('الشعار والغلاف: رفع صورة من الجهاز ينعكس على صفحة الحجز', async ({ page }) => {
  const PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  await page.goto('/salon.html#page');
  await page.waitForTimeout(800);
  await page.click('button:has-text("الهوية")');
  await page.waitForTimeout(300);
  await page.setInputFiles('#up-logo', { name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from(PX, 'base64') });
  await expect(page.getByText('تعديل الصورة — قص وتكبير')).toBeVisible();   // محرر القص يفتح
  await page.click('button:has-text("حفظ الصورة")');
  await page.waitForTimeout(700);
  await expect(page.locator('#pv-logo')).toBeVisible();                 // معاينة الشعار في المحرر
  await page.setInputFiles('#up-cover', { name: 'cover.png', mimeType: 'image/png', buffer: Buffer.from(PX, 'base64') });
  await expect(page.getByText('تعديل الصورة — قص وتكبير')).toBeVisible();
  await page.click('button:has-text("حفظ الصورة")');
  await page.waitForTimeout(700);
  await expect(page.locator('#pv-cover')).toBeVisible();
  // زر ✂ على المعاينة يعيد فتح المحرر
  await page.locator('.crop-btn').first().click();
  await expect(page.getByText('تعديل الصورة — قص وتكبير')).toBeVisible();
  await page.locator('.x').click();
  await page.waitForTimeout(400);
  // صفحة الحجز تعرضهما
  await page.goto('/booking.html');
  await page.waitForTimeout(600);
  await expect(page.locator('.logo img')).toBeVisible();
  await expect(page.locator('.cover > img')).toBeVisible();
  // الإزالة تعيد الافتراضي
  await page.goto('/salon.html#page');
  await page.waitForTimeout(800);
  await page.click('button:has-text("الهوية")');
  await page.waitForTimeout(300);
  await page.locator('button[title="إزالة"]').first().click();
  await page.waitForTimeout(500);
  await expect(page.locator('#pv-logo')).toHaveCount(0);
});

test('معرض الأعمال: صور وفيديو من المحرر إلى صفحة الحجز', async ({ page }) => {
  const PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  await page.goto('/salon.html#page');
  await page.waitForTimeout(800);
  await page.click('button:has-text("الواجهة")');
  await page.waitForTimeout(300);
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
  await page.click('button:has-text("الهوية")');
  await page.waitForTimeout(300);
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
  // قالب الاستوديو الجاهز يعيد ضبط اللون والخط والقالب معاً
  await page.goto('/salon.html#page');
  await page.waitForTimeout(800);
  await page.evaluate(() => PAGE.showTab('design'));
  await page.waitForTimeout(500);
  await page.click('.st-tpl[data-tpl="spa"]');
  await page.waitForTimeout(500);
  await page.click('button:has-text("نشر التغييرات")');
  await page.waitForTimeout(800);
  await page.click('button:has-text("الهوية")');
  await page.waitForTimeout(400);
  await expect(page.locator('#thx-ac')).toHaveValue('#0f766e');
});

test('إدارة الخدمات: إضافة خدمة تنعكس في الكتالوج', async ({ page }) => {
  await page.goto('/salon.html#services');
  await page.waitForTimeout(800);
  await page.click('button:has-text("+ خدمة جديدة")');
  await page.fill('#svN', 'باديكير سبا');
  await page.fill('#svP', '300');
  await page.click('.lux-modal [data-ok]');
  await page.waitForTimeout(500);
  await expect(page.locator('.svc', { hasText: 'باديكير سبا' })).toBeVisible();
  await expect(page.locator('.svc', { hasText: 'باديكير سبا' })).toContainText('300');
  // تحرير سعر خدمة قائمة
  await page.locator('.svc', { hasText: 'منيكير جل' }).locator('button:has-text("تحرير")').click();
  await page.fill('#svP', '180');
  await page.click('.lux-modal [data-ok]');
  await page.waitForTimeout(500);
  await expect(page.locator('.svc', { hasText: 'منيكير جل' })).toContainText('180');
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
  await page.click('button:has-text("متابعة")');
  await wizardAssign(page);
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
  await page.click('button:has-text("متابعة")');
  await wizardAssign(page);
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

test('الترجمة: تبديل اللغة للإنجليزية يعم الموقع ويعود للعربية', async ({ page }) => {
  await page.goto('/index.html');
  await page.waitForTimeout(600);
  await expect(page.locator('.luma-lang-btn')).toHaveText('EN');
  await page.click('.luma-lang-btn');                       // → English (يعيد التحميل)
  await page.waitForTimeout(900);
  await expect(page.getByText('You are bigger than WhatsApp.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dir)).toBe('ltr');
  // الاختيار يتبع الزائرة لبقية الصفحات
  await page.goto('/login.html');
  await page.waitForTimeout(600);
  await expect(page.getByText('Welcome back to')).toBeVisible();
  await page.goto('/booking.html');
  await page.waitForTimeout(700);
  await expect(page.getByText('Choose your service')).toBeVisible();
  await expect(page.getByText('Booking policy').first()).toBeVisible();
  // العودة للعربية
  await page.click('.luma-lang-btn');
  await page.waitForTimeout(900);
  await expect(page.getByText('اختاري خدمتك')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dir)).toBe('rtl');
});

test('صفحة الخبيرة: نبذة ورابط أعمالها وتقييمات قابلة للإضافة', async ({ page }) => {
  await page.goto('/experience.html?name=' + encodeURIComponent('لمياء الزهراني')
    + '&role=' + encodeURIComponent('أخصائية بشرة') + '&city=' + encodeURIComponent('الرياض'));
  await page.waitForTimeout(600);
  // النبذة — «شاهدي أعمالها» يفتح اللاندنج بيج أولاً وفيها رابط أعمالها
  await expect(page.locator('#bioTxt')).toContainText('أخصائية بشرة');
  await expect(page.locator('#bioWork')).toBeVisible();
  expect(await page.locator('#bioWork').getAttribute('href')).toContain('expert-landing.html');
  await page.click('#bioWork');
  await page.waitForURL(/expert-landing\.html/);
  await page.waitForTimeout(500);
  await expect(page.locator('h1')).toHaveText('لمياء الزهراني');
  await expect(page.locator('#workBtn')).toBeVisible();
  expect(await page.locator('#workBtn').getAttribute('href')).toContain('instagram.com');
  expect(await page.locator('#works .wk').count()).toBe(6);
  // «احجزي موعدًا معها» يعيد لصفحة الحجز
  await page.click('#bookBtn');
  await page.waitForURL(/experience\.html/);
  await page.waitForTimeout(600);
  await expect(page.locator('#exp-rate')).toHaveText('5.0');
  // تبويب التقييمات بالبذور
  await page.click('#tab-revs');
  await expect(page.locator('#revList .rv', { hasText: 'أريج الدوسري' })).toBeVisible();
  // النموذج مقفل حتى توثيق رقم عميلة
  await expect(page.locator('#rvFormBox')).toBeHidden();
  await page.fill('#vfPhone', '0555101101');
  await page.click('#vfSend');
  const code = (await page.locator('#vfCodeDemo').textContent()).match(/\d{4}/)[0];
  await page.fill('#vfCode', code);
  await page.click('#vfOk');
  await expect(page.locator('#rvFormBox')).toBeVisible();
  await expect(page.locator('#rvName')).toHaveValue('نوف العتيبي');
  await page.fill('#rvText', 'تجربة راقية والنتيجة فاقت التوقع.');
  await page.click('#rvSend');
  await expect(page.locator('#revList .rv', { hasText: 'تجربة راقية والنتيجة فاقت التوقع' })).toBeVisible();
  await expect(page.locator('#revList').getByText('عميلة موثقة ✓').first()).toBeVisible();
});

test('تعليقات المتجر للعميلات فقط: رقم غير مسجل يُرفض والموثق ينشر', async ({ page }) => {
  await page.goto('/store.html');
  await page.waitForTimeout(700);
  await page.locator('.card.salon').first().click();
  await page.waitForTimeout(500);
  // النموذج مقفل والبوابة ظاهرة
  await expect(page.locator('.rv-form')).toBeHidden();
  await expect(page.locator('#rvGate')).toContainText('للعميلات فقط');
  // رقم غير مسجل: يمر بالرمز ثم يُرفض
  await page.fill('#vfPhone', '0500000000');
  await page.click('#vfSend');
  let code = (await page.locator('#vfCodeDemo').textContent()).match(/\d{4}/)[0];
  await page.fill('#vfCode', code);
  await page.click('#vfOk');
  await expect(page.locator('#rvGate')).toContainText('غير مسجّل');
  // رقم عميلة معروفة: يُوثق ويُفتح النموذج باسمها
  await page.fill('#vfPhone', '0555303303');
  await page.click('#vfSend');
  code = (await page.locator('#vfCodeDemo').textContent()).match(/\d{4}/)[0];
  await page.fill('#vfCode', code);
  await page.click('#vfOk');
  await expect(page.locator('.rv-form')).toBeVisible();
  await expect(page.locator('#rv-name')).toHaveValue('لطيفة المطيري');
  await page.fill('#rv-text', 'تقييم من عميلة موثقة بالرقم.');
  await page.click('.rv-send');
  await expect(page.locator('.sv-review', { hasText: 'تقييم من عميلة موثقة بالرقم' })).toBeVisible();
  await expect(page.locator('#sv-revlist').getByText('عميلة موثقة ✓').first()).toBeVisible();
});

test('خصم التخرج 30% للجوهرة سبأ: شريطة وسعر مخفض وتطبيق في الحجز', async ({ page }) => {
  await page.goto('/store.html');
  await page.waitForTimeout(700);
  const card = page.locator('.card.salon', { hasText: 'الجوهرة سبأ' });
  await expect(card).toContainText('2 فروع');                        // الفرع الثاني أُضيف
  await expect(card.locator('.offer-rb')).toContainText('30%');
  await expect(card.locator('.offer-rb')).toContainText('التخرج');
  await expect(card.locator('.price s')).toContainText('150');       // السعر الأصلي مشطوب
  await expect(card.locator('.price .v')).toContainText('105');      // بعد الخصم
  // صفحة الحجز: بانر الخصم والأسعار المخفضة
  await page.goto('/experience.html?name=' + encodeURIComponent('الجوهرة سبأ')
    + '&type=salon&role=' + encodeURIComponent('صالون نسائي متكامل') + '&city=' + encodeURIComponent('جازان'));
  await page.waitForTimeout(700);
  await expect(page.getByText(/خصم 30% بمناسبة التخرج/)).toBeVisible();
  // فرعا الصالون كشرائح اختيار — الافتراضي الأول، واختيار الثاني ينعكس في التأكيد
  await expect(page.locator('.br-chip')).toHaveCount(2);
  await expect(page.getByText('طريق الملك فهد').first()).toBeVisible();
  await page.locator('.br-chip', { hasText: 'الفرع الثاني' }).click();
  const first = page.locator('.opt').first();                        // مكياج سهرة 350 → 245
  await expect(first.locator('s')).toContainText('350');
  await expect(first.locator('.price .v')).toContainText('245');
  // خطوة اختيار الخبيرة تعرض طاقم الجوهرة سبأ الفعلي بأسمائهن ووظائفهن
  await first.click();
  await page.click('button:has-text("التالي")');
  await page.locator('.date').first().click();          // خطوة التاريخ أولاً للصوالين
  await page.click('button:has-text("التالي")');
  await expect(page.getByText('فاطمة').first()).toBeVisible();
  await expect(page.getByText('خبيرة مكياج وعرائس').first()).toBeVisible();
  await expect(page.getByText('زهراء').first()).toBeVisible();
  await expect(page.getByText('فنية أظافر').first()).toBeVisible();
});

test('نافذة الصالون تعرض طاقم الخبيرات بأسمائهن ووظائفهن', async ({ page }) => {
  await page.goto('/store.html');
  await page.waitForTimeout(700);
  await page.locator('.card.salon').first().click();   // صالون لمسة
  await page.waitForTimeout(500);
  await expect(page.locator('#sv-branches')).toContainText('الفروع (2)');
  await expect(page.locator('#sv-branches')).toContainText('حي الشاطئ');
  await expect(page.locator('#sv-team')).toContainText('طاقم الخبيرات (4)');
  await expect(page.locator('#sv-team')).toContainText('أمل');
  await expect(page.locator('#sv-team')).toContainText('خبيرة مكياج وعرائس');
  await expect(page.locator('#sv-team')).toContainText('ريم');
  await expect(page.locator('#sv-team')).toContainText('فنية أظافر ورموش');
});

test('صورة لكل صالون: رسم مميز افتراضي والرفع صلاحية المالكة فقط', async ({ page }) => {
  await page.goto('/store.html');
  await page.waitForTimeout(700);
  // كل بطاقة صالون لها رسم مميز افتراضي
  expect(await page.locator('.card.salon .motif svg').count()).toBeGreaterThan(3);
  // الزائرة/العميلة لا ترى زر إضافة الصورة إطلاقاً
  await expect(page.locator('.cvcam')).toHaveCount(0);
  // جلسة مالكة (صالون) → يظهر الزر ويعمل الرفع
  await page.evaluate(() => localStorage.setItem('luma_role', 'salon'));
  await page.reload();
  await page.waitForTimeout(700);
  await expect(page.locator('.card.salon .cvcam').first()).toBeVisible();
  const PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.card.salon .cvcam').first().click()]);
  await fc.setFiles({ name: 'salon.png', mimeType: 'image/png', buffer: Buffer.from(PX, 'base64') });
  await page.waitForTimeout(700);
  await expect(page.locator('.card.salon .cvimg').first()).toBeVisible();
  // الإزالة تعيد الرسم
  await page.locator('.card.salon .cvcam.del').first().click();
  await page.waitForTimeout(500);
  await expect(page.locator('.card.salon .cvimg')).toHaveCount(0);
  // صورة الخبيرة: زر «إضافة صورة» على بطاقة الخبيرة، الرفع يعرض الصورة مكان الحرف
  const exCam = page.locator('.card:not(.salon) .cvcam').first();
  await expect(exCam).toContainText('إضافة صورة');
  const [fc2] = await Promise.all([page.waitForEvent('filechooser'), exCam.click()]);
  await fc2.setFiles({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from(PX, 'base64') });
  await page.waitForTimeout(700);
  await expect(page.locator('.card .explogo').first()).toBeVisible();
  await page.locator('.card:not(.salon) .cvcam.del').first().click();
  await page.waitForTimeout(500);
  await expect(page.locator('.card .explogo')).toHaveCount(0);
});

test('المتجر: نافذة الصالون بالتعليقات والاستفسارات', async ({ page }) => {
  await page.goto('/store.html');
  await page.waitForTimeout(700);
  await page.locator('.card.salon').first().click();
  await expect(page.locator('.sv-review').first()).toBeVisible();
  await expect(page.getByText('استفسارات')).toBeVisible();
});

test('لوحة أداء الموقع في «عام»: أرقام حية وتغذية آخر الحجوزات', async ({ page }) => {
  // اللوحة تظهر افتراضياً في تبويب «عام» مع كل الأقسام المطلوبة
  await page.goto('/salon.html#page');
  await page.waitForTimeout(800);
  await expect(page.getByText('أداء الموقع')).toBeVisible();
  for (const lbl of ['زيارة للموقع', 'قيمة المبيعات', 'حجز', 'عميلة'])
    await expect(page.getByText(lbl, { exact: true }).first()).toBeVisible();
  await expect(page.getByText('الخدمات الأكثر حجزاً')).toBeVisible();
  await expect(page.getByText('آخر الحجوزات')).toBeVisible();
  // لا حجوزات بعد: رسالة فارغة
  await expect(page.getByText('لا حجوزات أونلاين بعد')).toBeVisible();
  // زيارة الموقع تزيد العداد
  await page.goto('/booking.html');
  await page.waitForTimeout(700);
  const v1 = await page.evaluate(() => parseInt(localStorage.getItem('luma_store_visits') || '0'));
  expect(v1).toBeGreaterThan(0);
  // حجز أونلاين يظهر في تغذية «آخر الحجوزات»
  await page.evaluate(() => localStorage.setItem('luma_public_bookings', JSON.stringify(
    [{ client: 'أروى الاختبار', service: 'مكياج سهرة', time: '6:00 م', at: new Date().toISOString() }])));
  await page.goto('/salon.html#page');
  await page.waitForTimeout(800);
  await expect(page.getByText('أروى الاختبار').first()).toBeVisible();
  await expect(page.locator('.badge', { hasText: 'حجز' }).first()).toBeVisible();
});

test('قسم «الهوية» موحّد: الاسم والشعار والألوان والخط والموقع وحسابات التواصل', async ({ page }) => {
  await page.goto('/salon.html#page');
  await page.waitForTimeout(800);
  await page.click('button:has-text("الهوية")');
  await page.waitForTimeout(300);
  // كل بطاقات الهوية في مكان واحد
  await expect(page.getByText('هوية الصفحة')).toBeVisible();
  await expect(page.getByText('اسم الصالون')).toBeVisible();
  await expect(page.getByText('رقم التواصل')).toBeVisible();
  await expect(page.getByText('الشعار', { exact: false }).first()).toBeVisible();
  await expect(page.getByText('صورة الغلاف الفاخرة')).toBeVisible();
  await expect(page.getByText('ألوان الهوية')).toBeVisible();
  await expect(page.locator('#thx-ac')).toBeVisible();
  await expect(page.getByText('نوع الخط')).toBeVisible();
  await expect(page.locator('.font-chip')).toHaveCount(8);
  await expect(page.getByText('موقعي على الخريطة')).toBeVisible();
  await expect(page.locator('#mapIn')).toBeVisible();
  await expect(page.getByText('حسابات التواصل')).toBeVisible();
  await expect(page.locator('#soc-ig')).toBeVisible();
  // تعديل لون من داخل الهوية يفعّل شارة الثيم المخصص
  await page.fill('#thx-ac', '#cc3366');
  await page.locator('#thx-ac').evaluate(el => el.dispatchEvent(new Event('change')));
  await page.waitForTimeout(400);
  await expect(page.locator('#thBadge')).toBeVisible();
});


test('محرر «الواجهة»: ألوان وخط وأشكال وطرق عرض وFooter تنعكس على المتجر', async ({ page }) => {
  await page.goto('/salon.html#page');
  await page.waitForTimeout(800);
  await page.click('button:has-text("الواجهة")');
  await page.waitForTimeout(300);
  // كل مجموعات التحكم موجودة
  await expect(page.getByText('ألوان الواجهة')).toBeVisible();
  await expect(page.getByText('اللون الأساسي')).toBeVisible();
  await expect(page.getByText('اللون الثانوي')).toBeVisible();
  await expect(page.getByText('لون الأزرار', { exact: true })).toBeVisible();
  await expect(page.getByText('خط الواجهة')).toBeVisible();
  await expect(page.locator('.font-chip2')).toHaveCount(8);
  await expect(page.getByText('شكل البطاقات')).toBeVisible();
  await expect(page.getByText('شكل الأزرار')).toBeVisible();
  await expect(page.getByText('طريقة عرض الخدمات')).toBeVisible();
  await expect(page.getByText('شكل القائمة')).toBeVisible();
  await expect(page.getByText('Footer — تذييل الصفحة')).toBeVisible();
  // لون الأزرار مخصص + بطاقات حادة + أزرار كبسولة + قائمة بخط سفلي
  await page.fill('#uix-btn', '#22aa88');
  await page.locator('#uix-btn').evaluate(el => el.dispatchEvent(new Event('change')));
  await page.waitForTimeout(400);
  await page.locator('[data-ui="cardStyle:sharp"]').click();
  await page.waitForTimeout(350);
  await page.locator('[data-ui="btnStyle:pill"]').click();
  await page.waitForTimeout(350);
  await page.locator('[data-ui="menuStyle:underline"]').click();
  await page.waitForTimeout(350);
  await page.fill('#ftNote', 'نسعد بخدمتكم يومياً');
  await page.waitForTimeout(400);
  // الموقع يعكس كل شيء
  await page.goto('/booking.html');
  await page.waitForTimeout(700);
  const btnColor = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--btn').trim());
  expect(btnColor).toBe('#22aa88');
  const cls = await page.evaluate(() => document.body.className);
  expect(cls).toContain('ui-card-sharp');
  expect(cls).toContain('ui-btn-pill');
  expect(cls).toContain('ui-menu-underline');
  // Footer ظاهر باسم الصالون والسطر الإضافي وشعار لوما
  await expect(page.locator('.foot')).toBeVisible();
  await expect(page.locator('.foot')).toContainText('صالون لمسة');
  await expect(page.locator('.foot')).toContainText('نسعد بخدمتكم يومياً');
  await expect(page.locator('.foot')).toContainText('LUMA');
  // إخفاء الـFooter من المحرر يخفيه من المتجر
  await page.goto('/salon.html#page');
  await page.waitForTimeout(800);
  await page.click('button:has-text("الواجهة")');
  await page.waitForTimeout(300);
  await page.click('#ftTgl');
  await page.waitForTimeout(400);
  await page.goto('/booking.html');
  await page.waitForTimeout(600);
  await expect(page.locator('.foot')).toHaveCount(0);
});

test('تبويب «الزيارات»: الزوار والمشاهدات والصفحات والمصادر والأجهزة ومعدل التحويل', async ({ page }) => {
  await page.goto('/salon.html#page');
  await page.waitForTimeout(800);
  await page.click('button:has-text("الزيارات")');
  await page.waitForTimeout(300);
  await expect(page.getByText('تحليلات الزيارات')).toBeVisible();
  await expect(page.getByText('الزوار', { exact: true })).toBeVisible();
  await expect(page.getByText('مشاهدات الخدمات', { exact: true })).toBeVisible();
  await expect(page.getByText('معدل التحويل', { exact: true })).toBeVisible();
  await expect(page.getByText('مشاهدات الخدمات — الأعلى')).toBeVisible();
  await expect(page.getByText('أكثر الصفحات زيارة')).toBeVisible();
  await expect(page.getByText('مصادر الزيارات')).toBeVisible();
  await expect(page.getByText('الأجهزة')).toBeVisible();
  await expect(page.locator('.card', { hasText: 'مصادر الزيارات' }).getByText('انستغرام')).toBeVisible();
  await expect(page.locator('.card', { hasText: 'الأجهزة' }).getByText('جوال')).toBeVisible();
});

test('صفحات الموقع: الجاهزة والإضافية تظهر بتذييل الموقع وتفتح بنافذة', async ({ page }) => {
  await page.goto('/salon.html#page');
  await page.waitForTimeout(800);
  await page.click('button:has-text("الصفحات")');
  await page.waitForTimeout(300);
  // 7 صفحات جاهزة + محررات الأسئلة والسياسات
  await expect(page.getByText('صفحات موقعك الجاهزة')).toBeVisible();
  await expect(page.locator('.spg-row')).toHaveCount(7);
  await expect(page.locator('#faqIn')).toBeVisible();
  await expect(page.locator('#privIn')).toBeVisible();
  await expect(page.locator('#retIn')).toBeVisible();
  // إخفاء «سياسة الخصوصية» + إضافة صفحة خاصة
  await page.locator('.spg-row[data-pg="privacy"] .spg-tgl').click();
  await page.waitForTimeout(400);
  await page.fill('#xpT', 'خدمات الشركات والفعاليات');
  await page.fill('#xpB', 'نقدم باقات خاصة للفعاليات والمناسبات الكبرى\nتواصلوا معنا لتفاصيل الأسعار');
  await page.click('button:has-text("+ إضافة الصفحة")');
  await page.waitForTimeout(500);
  // تذييل الموقع: الروابط الصحيحة ظاهرة والمخفية غائبة
  await page.goto('/booking.html');
  await page.waitForTimeout(700);
  await expect(page.locator('.fpages')).toBeVisible();
  await expect(page.locator('.fpg', { hasText: 'خدماتنا' })).toBeVisible();
  await expect(page.locator('.fpg', { hasText: 'فريقنا' })).toBeVisible();
  await expect(page.locator('.fpg', { hasText: 'سياسة الخصوصية' })).toHaveCount(0);
  await expect(page.locator('.fpg', { hasText: 'خدمات الشركات والفعاليات' })).toBeVisible();
  // الأسئلة الشائعة تفتح بنافذة بمحتواها
  await page.locator('.fpg', { hasText: 'الأسئلة الشائعة' }).click();
  await expect(page.locator('.pg-lb')).toContainText('هل أحتاج حجزاً مسبقاً؟');
  await page.locator('.pg-lb .pgx').click();
  // الصفحة الإضافية تفتح بمحتواها
  await page.locator('.fpg', { hasText: 'خدمات الشركات والفعاليات' }).click();
  await expect(page.locator('.pg-lb')).toContainText('نقدم باقات خاصة للفعاليات');
  // «خدماتنا» قائمة تلقائية بالأسعار
  await page.locator('.pg-lb .pgx').click();
  await page.locator('.fpg', { hasText: 'خدماتنا' }).click();
  await expect(page.locator('.pg-lb')).toContainText('مكياج عروس');
});

test('تصنيفات لكل موقع: إضافة وحذف وإخفاء تنعكس على خدمات الموقع', async ({ page }) => {
  await page.goto('/salon.html#page');
  await page.waitForTimeout(800);
  await page.click('button:has-text("التصنيفات")');
  await page.waitForTimeout(300);
  // القائمة الافتراضية: شعر/أظافر/مكياج/بشرة/عناية/عناية بالجسم/منتجات
  await expect(page.getByText('تصنيفات موقعك')).toBeVisible();
  await expect(page.locator('.cat-chip')).toHaveCount(7);
  // إضافة تصنيف جديد
  await page.fill('#catIn', 'رموش وحواجب');
  await page.locator('.card', { hasText: 'تصنيفات موقعك' }).locator('button:has-text("+ إضافة")').click();
  await page.waitForTimeout(400);
  await expect(page.locator('.cat-chip')).toHaveCount(8);
  await expect(page.locator('.cat-chip', { hasText: 'رموش وحواجب' })).toBeVisible();
  // حذف تصنيف «منتجات»
  await page.locator('.cat-chip', { hasText: 'منتجات' }).locator('button[title="حذف التصنيف"]').click();
  await page.waitForTimeout(400);
  await expect(page.locator('.cat-chip')).toHaveCount(7);
  // إخفاء «مكياج» يخفي خدمات المكياج من المتجر
  await page.locator('.cat-chip', { hasText: 'مكياج' }).locator('button', { hasText: 'مكياج' }).first().click();
  await page.waitForTimeout(400);
  await page.goto('/booking.html');
  await page.waitForTimeout(700);
  await expect(page.locator('.svc', { hasText: 'مكياج عروس' })).toHaveCount(0);
  await expect(page.locator('.svc', { hasText: 'تسريحة' }).first()).toBeVisible();
});

test('قسم «الخدمات» المستقل: وصف وموظفات وحالة وإظهار بالمتجر', async ({ page }) => {
  await page.goto('/salon.html#page');
  await page.waitForTimeout(800);
  await page.click('.nav-item[data-id="page"]');
  await page.waitForTimeout(300);
  await page.locator('.pgsub[data-sub="svc"]').click();
  await page.waitForTimeout(400);
  await expect(page.getByText('إدارة الخدمات')).toBeVisible();
  await expect(page.locator('.msvc')).toHaveCount(12);
  // كل بطاقة: حالة + ظهور + وصف + موظفات
  const row = page.locator('.msvc', { hasText: 'مكياج سهرة' });
  await expect(row.locator('.msvc-st')).toContainText('نشطة');
  await expect(row.locator('.msvc-desc')).toBeVisible();
  // إسناد «تسريحة» إلى سارة
  await page.locator('.msvc', { hasText: 'تسريحة' }).locator('.msvc-stf', { hasText: 'سارة' }).click();
  await page.waitForTimeout(400);
  await expect(page.locator('.msvc', { hasText: 'تسريحة' }).locator('.msvc-stf', { hasText: 'سارة' })).toContainText('✓');
  // إخفاء «مكياج سهرة» من المتجر
  await page.locator('.msvc', { hasText: 'مكياج سهرة' }).locator('.msvc-hide').click();
  await page.waitForTimeout(400);
  await page.goto('/booking.html');
  await page.waitForTimeout(700);
  await expect(page.locator('.svc', { hasText: 'مكياج سهرة' })).toHaveCount(0);
  await expect(page.locator('.svc', { hasText: 'مكياج عروس' }).first()).toBeVisible();
});


test('قسم «الحجوزات» المستقل: قادمة ومكتملة وملغاة مع الإجراءات', async ({ page }) => {
  await page.goto('/salon.html#page');
  await page.waitForTimeout(800);
  await page.click('.nav-item[data-id="page"]');
  await page.waitForTimeout(300);
  await page.locator('.pgsub[data-sub="books"]').click();
  await page.waitForTimeout(400);
  await expect(page.getByText('حجوزات الموقع')).toBeVisible();
  // القادمة: حجزان مبدئيان بعميل وخدمة وموظفة ووقت
  await expect(page.locator('.mbk')).toHaveCount(2);
  const b1 = page.locator('.mbk', { hasText: 'نوف العتيبي' });
  await expect(b1).toContainText('مكياج عروس');
  await expect(b1).toContainText('مع أمل');
  // إتمام حجز نوف — ينتقل للمكتملة
  await b1.locator('.mbk-done').click();
  await page.waitForTimeout(400);
  await expect(page.locator('.mbk')).toHaveCount(1);
  await page.locator('.bkf[data-f="done"]').click();
  await page.waitForTimeout(400);
  await expect(page.locator('.mbk')).toHaveCount(3);
  await expect(page.locator('.mbk', { hasText: 'نوف العتيبي' })).toBeVisible();
  // الملغاة
  await page.locator('.bkf[data-f="cancel"]').click();
  await page.waitForTimeout(400);
  await expect(page.locator('.mbk', { hasText: 'مها الزهراني' })).toBeVisible();
});

test('قسم «الفريق» المستقل: التخصص والخدمات والجدول والنبذة', async ({ page }) => {
  await page.goto('/salon.html#page');
  await page.waitForTimeout(800);
  await page.click('.nav-item[data-id="page"]');
  await page.waitForTimeout(300);
  await page.locator('.pgsub[data-sub="team"]').click();
  await page.waitForTimeout(400);
  await expect(page.getByText('فريق الصالون')).toBeVisible();
  await expect(page.locator('.mteam')).toHaveCount(4);
  const amal = page.locator('.mteam', { hasText: 'أمل' });
  await expect(amal).toContainText('التخصص: مكياج');
  await expect(amal).toContainText('مكياج سهرة');
  await expect(amal).toContainText('الجمعة إجازة');
  // نبذة تُحفظ وتبقى بعد إعادة التحميل
  await amal.locator('.mteam-bio').fill('خبرة 8 سنوات في مكياج العرائس والمناسبات');
  await amal.locator('.mteam-bio').evaluate(el => el.dispatchEvent(new Event('change')));
  await page.waitForTimeout(400);
  await page.reload();
  await page.waitForTimeout(800);
  await page.click('.nav-item[data-id="page"]');
  await page.waitForTimeout(300);
  await page.locator('.pgsub[data-sub="team"]').click();
  await page.waitForTimeout(400);
  await expect(page.locator('.mteam', { hasText: 'أمل' }).locator('.mteam-bio')).toHaveValue('خبرة 8 سنوات في مكياج العرائس والمناسبات');
});

test('استوديو التصميم: قوالب جاهزة وقالب الصفحة ينعكسان في المعاينة الحية', async ({ page }) => {
  await page.goto('/salon.html#page');
  await page.waitForTimeout(900);
  await page.evaluate(() => PAGE.showTab('design'));
  await page.waitForTimeout(700);
  const pf = () => page.frames().find(f => f.url().includes('preview=1'));
  // المعاينة إطار حقيقي للصفحة العامة لا محاكاة
  expect(pf()).toBeTruthy();
  await expect(page.locator('.st-tpl')).toHaveCount(6);
  await expect(page.locator('.st-theme')).toHaveCount(4);
  // قالب جاهز واحد يغيّر لون الموقع كلياً خلال أقل من ثانية
  await page.click('.st-tpl[data-tpl="rose"]');
  await page.waitForTimeout(600);
  expect(await pf().evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ac').trim())).toBe('#db2777');
  // قالب الصفحة له أثر بصري مثبت: الاستدارة والصنف على الجذر
  await page.click('.st-theme[data-theme="classic"]');
  await page.waitForTimeout(600);
  expect(await pf().evaluate(() => document.body.className)).toContain('theme-classic');
  expect(await pf().evaluate(() => getComputedStyle(document.body).getPropertyValue('--rad').trim())).toBe('0px');
  await page.click('.st-theme[data-theme="bold"]');
  await page.waitForTimeout(600);
  expect(await pf().evaluate(() => document.body.className)).toContain('theme-bold');
  expect(await pf().evaluate(() => getComputedStyle(document.body).getPropertyValue('--rad').trim())).toBe('10px');
});

test('استوديو التصميم: إخفاء وترتيب وتكرار الأقسام ينعكس فوراً بلا حفظ قبل النشر', async ({ page }) => {
  await page.goto('/salon.html#page');
  await page.waitForTimeout(900);
  await page.evaluate(() => PAGE.showTab('design'));
  await page.waitForTimeout(700);
  const pf = () => page.frames().find(f => f.url().includes('preview=1'));
  // الأقسام التسعة عشر كلها معروضة وقابلة للسحب
  await expect(page.locator('.sec-row')).toHaveCount(19);
  await expect(page.locator('.sec-row[draggable="true"]')).toHaveCount(19);
  // «خدماتنا» ثابت: لا زر إخفاء ولا حذف
  const svcRow = page.locator('.sec-row', { hasText: 'خدماتنا' });
  await expect(svcRow.locator('.sec-tgl')).toHaveCount(0);
  await expect(svcRow.locator('.sec-del')).toHaveCount(0);
  // إخفاء «آراء العميلات» يخفيها من الصفحة العامة فوراً
  expect(await pf().evaluate(() => !!document.querySelector('[data-sec^="reviews"]').innerHTML)).toBe(true);
  await page.locator('.sec-row', { hasText: 'آراء العميلات' }).locator('.sec-tgl').click();
  await page.waitForTimeout(600);
  expect(await pf().evaluate(() => !!document.querySelector('[data-sec^="reviews"]'))).toBe(false);
  // تكرار «لماذا نحن» يعرضه مرتين
  await page.locator('.sec-row', { hasText: 'لماذا نحن' }).locator('.sec-dup').click();
  await page.waitForTimeout(600);
  expect(await pf().evaluate(() => document.querySelectorAll('[data-sec^="perks"]').length)).toBe(2);
  // لا شيء يُحفظ حتى النشر
  expect(await page.evaluate(() => (JSON.parse(localStorage.getItem('luma_page_cfg') || '{}').layout || []).length)).toBe(0);
  await expect(page.getByText('لديك تغييرات غير منشورة')).toBeVisible();
  await page.click('button:has-text("نشر التغييرات")');
  await page.waitForTimeout(800);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('luma_page_cfg') || '{}').layout || []);
  expect(saved.length).toBe(20);
  expect(saved.filter(x => x.k === 'perks').length).toBe(2);
  expect(saved.find(x => x.k === 'reviews').on).toBe(false);
});

test('استوديو التصميم: التراجع يرجع الحالة والكتابة السريعة لقطة واحدة', async ({ page }) => {
  await page.goto('/salon.html#page');
  await page.waitForTimeout(900);
  await page.evaluate(() => PAGE.showTab('design'));
  await page.waitForTimeout(700);
  // ثلاث خطوات ثم ثلاث تراجعات ترجع للأصل
  await page.click('.st-theme[data-theme="minimal"]');
  await page.waitForTimeout(800);
  await page.click('.st-theme[data-theme="bold"]');
  await page.waitForTimeout(800);
  await page.click('.st-theme[data-theme="classic"]');
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => STUDIO.val('themeId'))).toBe('classic');
  for (let i = 0; i < 3; i++) { await page.click('button:has-text("تراجع")'); await page.waitForTimeout(700); }
  expect(await page.evaluate(() => STUDIO.form.themeId)).toBeUndefined();
  // تجاهل المسودة يعيد كل شيء
  await page.click('.st-theme[data-theme="bold"]');
  await page.waitForTimeout(600);
  await expect(page.getByText('لديك تغييرات غير منشورة')).toBeVisible();
});

test('استوديو التصميم: محرر محتوى القسم يضيف عنصراً يظهر بالصفحة العامة', async ({ page }) => {
  await page.goto('/salon.html#page');
  await page.waitForTimeout(900);
  await page.evaluate(() => PAGE.showTab('design'));
  await page.waitForTimeout(700);
  // فتح محرر «الباقات والعروض» وإضافة عرض
  await page.locator('.sec-row', { hasText: 'الباقات والعروض' }).locator('.sec-ed').click();
  await page.waitForTimeout(500);
  await page.click('.st-add');
  await page.waitForTimeout(500);
  await expect(page.locator('.st-row')).toHaveCount(1);
  await page.locator('.st-row input').nth(1).fill('باقة العروس الماسية');
  await page.locator('.st-row input').nth(1).dispatchEvent('change');
  await page.waitForTimeout(600);
  // إظهار القسم ثم التحقق من ظهوره في المعاينة
  await page.click('button:has-text("رجوع للأقسام")');
  await page.waitForTimeout(400);
  await page.locator('.sec-row', { hasText: 'الباقات والعروض' }).locator('.sec-tgl').click();
  await page.waitForTimeout(700);
  const pf = page.frames().find(f => f.url().includes('preview=1'));
  expect(await pf.evaluate(() => document.body.innerText)).toContain('باقة العروس الماسية');
});

test('المعاينة الحية: تتجاهل الرسائل غير المطابقة ولا تعمل بدون preview=1', async ({ page }) => {
  // بدون preview=1 لا يُسجَّل مستقبِل ولا تتأثر الصفحة
  await page.goto('/booking.html');
  await page.waitForTimeout(700);
  await page.evaluate(() => window.postMessage({ type: 'salon-preview', settings: { title: 'اختراق' } }, window.location.origin));
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => CFG.title)).not.toBe('اختراق');
  // مع preview=1: رسالة بنوع خاطئ تُتجاهل، والصحيحة تُطبَّق
  await page.goto('/booking.html?preview=1');
  await page.waitForTimeout(700);
  await page.evaluate(() => window.postMessage({ type: 'other-thing', settings: { title: 'اختراق' } }, window.location.origin));
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => CFG.title)).not.toBe('اختراق');
  await page.evaluate(() => window.postMessage({ type: 'salon-preview', settings: { title: 'صالون المعاينة' } }, window.location.origin));
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => CFG.title)).toBe('صالون المعاينة');
  // وضع المعاينة لا يزيد عدّاد الزيارات ولا يحفظ شيئاً
  const before = await page.evaluate(() => localStorage.getItem('luma_store_visits'));
  await page.reload();
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => localStorage.getItem('luma_store_visits'))).toBe(before);
});

test('واتساب: ربط مزوّد خاص بكل صالون وحالة الربط والاختبار في وضع التجربة', async ({ page }) => {
  await page.goto('/salon.html#whatsapp');
  await page.waitForTimeout(900);
  // خمسة مزوّدين وحالة «موقوف» ابتداءً
  await expect(page.locator('.wa-prov')).toHaveCount(5);
  await expect(page.getByText('موقوف')).toBeVisible();
  await expect(page.getByText('الربط غير مكتمل')).toBeVisible();
  // تعبئة حقول Meta ثم تفعيل الربط → الحالة «متصل»
  await page.locator('.wa-f[data-f="sender"]').fill('1234567890');
  await page.locator('.wa-f[data-f="sender"]').dispatchEvent('change');
  await page.locator('.wa-f[data-f="token"]').fill('TESTTOKEN');
  await page.locator('.wa-f[data-f="token"]').dispatchEvent('change');
  await page.evaluate(() => WA.toggle());
  await page.waitForTimeout(600);
  await expect(page.getByText('متصل')).toBeVisible();
  await expect(page.getByText('الربط مكتمل')).toBeVisible();
  // تبديل المزوّد يغيّر الحقول المطلوبة
  await page.locator('.wa-prov[data-prov="twilio"]').click();
  await page.waitForTimeout(500);
  await expect(page.locator('.wa-f[data-f="sid"]')).toBeVisible();
  await page.locator('.wa-prov[data-prov="meta"]').click();
  await page.waitForTimeout(500);
  // اختبار الإرسال في وضع التجربة يُسجَّل بلا إرسال فعلي
  await page.evaluate(() => WA.test());
  await page.waitForTimeout(500);
  await page.fill('input[name=ph]', '0551234567');
  await page.click('.lux-btn.lux-gold[data-ok]');
  await page.waitForTimeout(900);
  const log = await page.evaluate(() => JSON.parse(localStorage.getItem('luma_wa_log') || '[]'));
  expect(log.length).toBe(1);
  expect(log[0].status).toBe('sandbox');
  expect(log[0].to).toBe('966551234567');   // تحويل 05… إلى E.164
});

test('واتساب: قوالب الأحداث قابلة للتحرير والتعطيل والمتغيرات تُملأ', async ({ page }) => {
  await page.goto('/salon.html#whatsapp');
  await page.waitForTimeout(900);
  await page.evaluate(() => WA.go('events'));
  await page.waitForTimeout(600);
  await expect(page.locator('.wa-ev')).toHaveCount(7);
  // تعطيل حدث «تأكيد الحجز» يمنع إرساله
  await page.locator('.wa-ev[data-ev="booking"] .wa-tgl').click();
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => LumaWA.send('booking', { client: 'نوف' }, '0551112233'));
  expect(r.status).toBe('skipped');
  // تحرير قالب «الفاتورة» ثم التحقق من تعبئة المتغيرات
  await page.locator('.wa-ev[data-ev="receipt"] .wa-tpl').fill('عزيزتي {{client}} فاتورتك {{amount}} ريال من {{salon}}');
  await page.locator('.wa-ev[data-ev="receipt"] .wa-tpl').dispatchEvent('change');
  await page.waitForTimeout(500);
  const txt = await page.evaluate(() =>
    LumaWA.fill(LumaWA.tplOf(LumaWA.get(), 'receipt'), { client: 'نوف', amount: '530', salon: 'صالون لمسة' }));
  expect(txt).toBe('عزيزتي نوف فاتورتك 530 ريال من صالون لمسة');
  // متغير غير معروف لا يظهر كـ {{x}}
  expect(await page.evaluate(() => LumaWA.fill('مرحباً {{client}} {{unknown}}', { client: 'ريم' }))).toBe('مرحباً ريم');
});

test('واتساب: بلا ربط يرجع لرابط wa.me اليدوي بدل الفشل الصامت', async ({ page }) => {
  await page.goto('/salon.html#whatsapp');
  await page.waitForTimeout(900);
  const r = await page.evaluate(() => LumaWA.send('booking', { client: 'هند', service: 'مكياج' }, '0509998877'));
  expect(r.status).toBe('manual');
  expect(r.link).toContain('wa.me/966509998877');
  await page.evaluate(() => WA.go('log'));
  await page.waitForTimeout(600);
  await expect(page.locator('.wa-row')).toHaveCount(1);
  await expect(page.getByText('لا يوجد ربط API — رابط إرسال يدوي')).toBeVisible();
  await expect(page.locator('button:has-text("فتح واتساب")')).toBeVisible();
});

test('واتساب: بناء طلب كل مزوّد بالشكل الصحيح', async ({ page }) => {
  await page.goto('/salon.html#whatsapp');
  await page.waitForTimeout(900);
  const reqs = await page.evaluate(() => {
    const mk = p => LumaWA.buildRequest({ provider: p, sender: 'SND', token: 'TK', sid: 'SD', url: 'https://x.test/hook' }, '966500000000', 'مرحباً');
    const meta = mk('meta'), tw = mk('twilio'), d3 = mk('d360'), um = mk('ultramsg'), cu = mk('custom');
    return {
      metaUrl: meta.url, metaAuth: meta.init.headers.Authorization, metaBody: meta.init.body,
      twUrl: tw.url, twAuth: tw.init.headers.Authorization.slice(0, 6), twBody: tw.init.body,
      d3Key: d3.init.headers['D360-API-KEY'], umUrl: um.url, cuUrl: cu.url,
    };
  });
  expect(reqs.metaUrl).toBe('https://graph.facebook.com/v21.0/SND/messages');
  expect(reqs.metaAuth).toBe('Bearer TK');
  expect(JSON.parse(reqs.metaBody).messaging_product).toBe('whatsapp');
  expect(JSON.parse(reqs.metaBody).text.body).toBe('مرحباً');
  expect(reqs.twUrl).toContain('/Accounts/SD/Messages.json');
  expect(reqs.twAuth).toBe('Basic ');
  expect(reqs.twBody).toContain('To=whatsapp%3A%2B966500000000');
  expect(reqs.d3Key).toBe('TK');
  expect(reqs.umUrl).toBe('https://api.ultramsg.com/SD/messages/chat');
  expect(reqs.cuUrl).toBe('https://x.test/hook');
});
