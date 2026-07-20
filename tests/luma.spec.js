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
  // تحديد الكل كمقروء يخفي العداد
  await page.click('#ntfPanel button:has-text("تحديد الكل كمقروء")');
  await page.waitForTimeout(300);
  await expect(page.locator('#ntfPip')).toBeHidden();
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
  await expect(page.locator('#exCount')).toHaveText('16');
  // تفاصيل البطاقة: تقييم وفروع وخبيرات ووسوم وخصم
  const jaw = page.locator('#exList .card', { hasText: 'الجوهرة سبأ' });
  await expect(jaw).toContainText('2 فروع');
  await expect(jaw).toContainText('خصم 30%');
  await expect(jaw).toContainText('105');
  expect(await jaw.locator('a').getAttribute('href')).toContain('experience.html');
  // فلتر النوع: صوالين فقط (مبدّل مقسّم)
  await page.click('button:has-text("صوالين")');
  await page.waitForTimeout(400);
  await expect(page.locator('#exCount')).toHaveText('7');
  // فلتر المدينة: جازان — من لوحة الفلاتر السفلية
  await page.click('button:has-text("فلترة")');
  await page.waitForTimeout(400);
  await page.click('#exSheetIn button:has-text("جازان")');
  await page.waitForTimeout(250);
  await expect(page.locator('#exSheetIn button:has-text("عرض النتائج")')).toContainText('(1)');
  await page.click('#exSheetIn button:has-text("عرض النتائج")');
  await page.waitForTimeout(400);
  await expect(page.locator('#exCount')).toHaveText('1');
  // وسم الفلتر النشط ظاهر بالشريط ويمكن إزالته
  await expect(page.locator('button:has-text("جازان ✕")')).toBeVisible();
  // البحث الحي (بعد تصفير الفلاتر بزر مسح)
  await page.click('button:has-text("مسح")');
  await page.waitForTimeout(400);
  await expect(page.locator('#exCount')).toHaveText('7');
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
  // كتابة «من نحن» من المحرر
  await page.goto('/salon.html#page');
  await page.waitForTimeout(800);
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
  await page.click('button:has-text("المحتوى والوسائط")');
  await page.waitForTimeout(300);
  await page.fill('#mapIn', '21.543333,39.172779');
  await page.waitForTimeout(400);
  // صفحة الحجز: خريطة مدمجة + زر اتجاهات بالإحداثيات
  await page.goto('/booking.html');
  await page.waitForTimeout(500);
  await expect(page.locator('.mapc .mapf')).toHaveCount(1);
  expect(await page.locator('.mapc .mapf').getAttribute('src')).toContain('21.543333,39.172779');
  expect(await page.locator('.mapc a').getAttribute('href')).toContain('query=21.543333,39.172779');
  await expect(page.getByText('موقعنا 📍')).toBeVisible();
});

test('روابط السوشل ميديا الاختيارية تظهر في صفحة الحجز', async ({ page }) => {
  // بدون روابط: لا أيقونات
  await page.goto('/booking.html');
  await page.waitForTimeout(500);
  await expect(page.locator('.socs')).toHaveCount(0);
  // تعبئة إنستقرام (باسم مستخدم) وواتساب (برقم) من المحرر
  await page.goto('/salon.html#page');
  await page.waitForTimeout(800);
  await page.click('button:has-text("المحتوى والوسائط")');
  await page.waitForTimeout(300);
  await page.fill('#soc-ig', '@lamsa.beauty');
  await page.fill('#soc-wa', '0555123456');
  await page.waitForTimeout(400);
  // الأيقونتان تظهران بروابط مطبَّعة
  await page.goto('/booking.html');
  await page.waitForTimeout(500);
  await expect(page.locator('.socs .soc')).toHaveCount(2);
  expect(await page.locator('.soc-ig').getAttribute('href')).toBe('https://instagram.com/lamsa.beauty');
  expect(await page.locator('.soc-wa').getAttribute('href')).toBe('https://wa.me/966555123456');
});

test('نوع الخط وشريط الترحيب من المحرر إلى صفحة الحجز', async ({ page }) => {
  await page.goto('/salon.html#page');
  await page.waitForTimeout(800);
  await page.click('button:has-text("المظهر")');
  await page.waitForTimeout(300);
  // اختيار خط «أميري» + كتابة رسالة ترحيب
  await page.locator('.font-chip', { hasText: 'أميري' }).click();
  await page.waitForTimeout(500);
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
  await page.click('button:has-text("الحجز والخدمات")');
  await page.waitForTimeout(300);
  await expect(page.getByText('سياسة الحجز والخدمات المميزة')).toBeVisible();
  // تمييز خدمة إضافية بشارة «عرض خاص»
  await page.locator('.feat-sel').first().selectOption('عرض خاص');
  await page.waitForTimeout(500);
  // صفحة الحجز: الشارات والسياسة
  await page.goto('/booking.html');
  await page.waitForTimeout(600);
  await expect(page.locator('.svc .feat', { hasText: 'الأكثر طلباً' })).toBeVisible();   // الافتراضية
  await expect(page.locator('.svc .feat', { hasText: 'عرض خاص' })).toBeVisible();       // المضافة
  await expect(page.getByText('سياسة الحجز 📋').first()).toBeVisible();
  await expect(page.getByText(/إلغاء أو تعديل الحجز مجاناً/).first()).toBeVisible();
  // البنود تظهر أيضاً في خطوة التأكيد
  await page.locator('.svc').first().click();
  await page.click('button:has-text("متابعة")');
  await wizardAssign(page);
  await expect(page.locator('.policy.compact')).toBeVisible();
});

test('الشعار والغلاف: رفع صورة من الجهاز ينعكس على صفحة الحجز', async ({ page }) => {
  const PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  await page.goto('/salon.html#page');
  await page.waitForTimeout(800);
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
  await page.locator('button[title="إزالة"]').first().click();
  await page.waitForTimeout(500);
  await expect(page.locator('#pv-logo')).toHaveCount(0);
});

test('معرض الأعمال: صور وفيديو من المحرر إلى صفحة الحجز', async ({ page }) => {
  const PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  await page.goto('/salon.html#page');
  await page.waitForTimeout(800);
  await page.click('button:has-text("المحتوى والوسائط")');
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
  await page.click('button:has-text("المظهر")');
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
  // القالب الجاهز يعيد الاختيار كنقطة بداية
  await page.goto('/salon.html#page');
  await page.waitForTimeout(800);
  await page.click('button:has-text("المظهر")');
  await page.waitForTimeout(300);
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
  await expect(page.getByText('Everything your beauty deserves… in one place.')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.dir)).toBe('ltr');
  // الاختيار يتبع الزائرة لبقية الصفحات
  await page.goto('/login.html');
  await page.waitForTimeout(600);
  await expect(page.getByText('Welcome back to')).toBeVisible();
  await page.goto('/booking.html');
  await page.waitForTimeout(700);
  await expect(page.getByText('Choose your service')).toBeVisible();
  await expect(page.getByText('Booking policy 📋').first()).toBeVisible();
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
  // النبذة ورابط الأعمال
  await expect(page.locator('#bioTxt')).toContainText('أخصائية بشرة');
  await expect(page.locator('#bioWork')).toBeVisible();
  expect(await page.locator('#bioWork').getAttribute('href')).toContain('instagram.com');
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
  // كل منتج له صورة SVG مدمجة
  await page.click('#tab-shop');
  await expect(page.locator('.pcard .art svg')).toHaveCount(6);
  // زر رفع صورة المنتج لا يظهر للزائرة — صلاحية المالكة فقط
  await expect(page.locator('.pcam')).toHaveCount(0);
  // جلسة خبيرة → يظهر الرفع ويعمل ثم الإزالة
  await page.evaluate(() => localStorage.setItem('luma_role', 'expert'));
  await page.reload();
  await page.waitForTimeout(600);
  await page.click('#tab-shop');
  const PPX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.pcam').first().click()]);
  await fc.setFiles({ name: 'prod.png', mimeType: 'image/png', buffer: Buffer.from(PPX, 'base64') });
  await page.waitForTimeout(700);
  await expect(page.locator('.pimg')).toHaveCount(1);
  await page.locator('.pcam.del').click();
  await page.waitForTimeout(400);
  await expect(page.locator('.pimg')).toHaveCount(0);
  // تابي وتمارا في إتمام الطلب مع تفصيل الأقساط
  await page.locator('.pcard .add').first().click();
  await page.click('#cartFab');
  await page.click('button:has-text("إتمام الطلب")');
  await page.click('.paym[data-p="tabby"]');
  await expect(page.locator('#bnplHint')).toContainText('4 دفعات');
  await page.click('.paym[data-p="tamara"]');
  await expect(page.locator('#bnplHint')).toContainText('3 دفعات');
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
