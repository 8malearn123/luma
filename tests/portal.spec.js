// ═══ بوابة الموظفة — دورة كاملة: دخول، جدول، أرباح، طلب، حضور ═══
const { test, expect } = require('@playwright/test');

test.beforeEach(async ({ context }) => {
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
});

async function login(page, name = 'ريم') {
  await page.goto('/staff-portal.html');
  await page.waitForTimeout(400);
  await page.locator('.pick', { hasText: name }).click();
  await page.fill('#pin', '1234');
  await page.click('button:has-text("دخول")');
  await page.waitForTimeout(400);
}

test('الدخول يعرض جدول اليوم والأرباح الحية', async ({ page }) => {
  await login(page);
  await expect(page.getByText('جدولي اليوم')).toBeVisible();
  await expect(page.getByText('جواهر الشهري')).toBeVisible();          // من حجوزات اللوحة
  await page.click('.tabs button[data-t="pay"]');
  await expect(page.getByText('صافي أرباحك هذا الشهر')).toBeVisible();
  await expect(page.getByText(/عمولة الخدمات/)).toBeVisible();
});

test('طلب إجازة من البوابة يصل للوحة الصالون بسلسلة الموافقات', async ({ page }) => {
  await login(page);
  await page.click('.tabs button[data-t="req"]');
  await page.click('button:has-text("+ طلب جديد")');
  const d1 = new Date(Date.now() + 86400000 * 40).toISOString().slice(0, 10);
  const d2 = new Date(Date.now() + 86400000 * 41).toISOString().slice(0, 10);
  await page.fill('#f_from', d1);
  await page.fill('#f_to', d2);
  await page.click('#rqSend');
  await expect(page.getByText('أُرسل طلبك')).toBeVisible();
  // نفس الطلب يظهر للمالكة في شاشة الموارد البشرية بانتظار الاعتماد
  await page.goto('/salon.html#hr');
  await page.waitForTimeout(800);
  await page.click('button:has-text("الطلبات")');
  const card = page.locator('.card', { hasText: d1 });
  await expect(card.getByText('ريم')).toBeVisible();
  await expect(card.locator('button', { hasText: 'اعتماد' })).toBeVisible();
});

test('تسجيل الحضور المتأخر يظهر علماً في جدول دوام الصالون', async ({ page }) => {
  // وردية تبدأ 00:00 لضمان احتساب تأخير مهما كان وقت التشغيل (حتى قبل الفجر)
  await page.addInitScript(() => {
    if (localStorage.getItem('__t_init')) return;   // مرة واحدة فقط — لا تصفير عند التنقل
    localStorage.setItem('__t_init', '1');
    const wd = new Date().getDay();
    const shifts = {}; shifts['reem'] = {}; shifts['reem'][wd] = { off: false, start: '00:00', end: '23:59' };
    localStorage.setItem('luma_hr_shifts', JSON.stringify(shifts));
    localStorage.setItem('luma_hr_att', JSON.stringify({}));
  });
  await login(page);
  await page.click('.tabs button[data-t="att"]');
  await page.click('button:has-text("تسجيل حضور")');
  await expect(page.getByText(/سُجّل حضورك — تأخير \d+ دقيقة/)).toBeVisible();
  // العلم الأحمر عند المالكة
  await page.goto('/salon.html#hr');
  await page.waitForTimeout(800);
  await page.click('button:has-text("جدول الدوام")');
  await expect(page.getByText(/تأخير \d+ دقيقة/).first()).toBeVisible();
});
