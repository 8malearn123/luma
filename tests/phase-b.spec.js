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

/* ═════════ ب-2 · طبقة البيانات بوضعيها ═════════ */

async function asOwner(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('luma_session', JSON.stringify(
        { role: 'salon', name: 'اختبار', at: Date.now(), exp: Date.now() + 36e5 }));
    } catch (e) {}
  });
}

test('الوضع المحلي: دورة بيانات كاملة تعمل بلا مشروع سحابي', async ({ page }) => {
  await asOwner(page);
  await page.goto('/salon.html');
  await page.waitForTimeout(1200);
  const r = await page.evaluate(async () => {
    const out = { mode: LumaDB.mode };
    const a = await LumaDB.insert('t_test', { name: 'نوف', price: 450 });
    const c = await LumaDB.insert('t_test', { name: 'لينا', price: 150 });
    out.hasId = !!a.id;
    out.count = (await LumaDB.select('t_test')).length;
    out.filtered = (await LumaDB.select('t_test', { where: { name: 'نوف' } })).length;
    out.updated = (await LumaDB.update('t_test', a.id, { price: 500 })).price;
    await LumaDB.remove('t_test', c.id);
    out.after = (await LumaDB.select('t_test')).length;
    try { await LumaDB.rpc('x'); out.rpc = 'لم يرفض'; } catch (e) { out.rpc = 'رفض'; }
    return out;
  });
  expect(r.mode).toBe('local');
  expect(r.hasId).toBe(true);
  expect(r.count).toBe(2);
  expect(r.filtered).toBe(1);
  expect(r.updated).toBe(500);
  expect(r.after).toBe(1);
  expect(r.rpc).toBe('رفض');   // النداءات السحابية ترفض بوضوح بلا ربط
});

test('الوضع المحلي: البيانات تبقى بعد تحديث الصفحة', async ({ page }) => {
  await asOwner(page);
  await page.goto('/salon.html');
  await page.waitForTimeout(1100);
  await page.evaluate(async () => { await LumaDB.insert('t_keep', { name: 'باقية' }); });
  await page.reload();
  await page.waitForTimeout(1100);
  const rows = await page.evaluate(async () => await LumaDB.select('t_keep'));
  expect(rows.map(r => r.name)).toContain('باقية');
});

test('الوضع السحابي: النداءات تُبنى بصيغة PostgREST الصحيحة', async ({ page, context }) => {
  const seen = [];
  await context.route('https://demo.supabase.co/**', route => {
    const req = route.request(); const u = new URL(req.url());
    seen.push({ m: req.method(), path: u.pathname + u.search,
                auth: req.headers()['authorization'] || '', apikey: !!req.headers()['apikey'],
                prefer: req.headers()['prefer'] || '' });
    if (u.pathname.includes('/auth/v1/verify'))
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ access_token: 'AT123', refresh_token: 'RT456',
                               expires_at: Math.floor(Date.now() / 1000) + 3600 }) });
    if (u.pathname.includes('/auth/v1/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'srv-1' }]) });
  });
  // ملف الإعداد نفسه هو ما يحدّد الوضع
  await context.route('**/luma-config.js', route => route.fulfill({ status: 200,
    contentType: 'application/javascript',
    body: "window.LUMA_CONFIG={supabaseUrl:'https://demo.supabase.co',supabaseAnonKey:'anon-xyz',salonTz:'Asia/Riyadh'};" }));
  await asOwner(page);
  await page.goto('/salon.html');
  await page.waitForTimeout(1200);

  const mode = await page.evaluate(async () => {
    await LumaDB.auth.verifyOtp('o@luma.test', '123456');
    await LumaDB.select('bookings', { where: { status: 'confirmed' }, order: 'starts_at', limit: 5 });
    await LumaDB.insert('bookings', { client_name: 'جديدة' });
    await LumaDB.update('bookings', 'srv-1', { price: 300 });
    await LumaDB.remove('bookings', 'srv-1');
    await LumaDB.rpc('get_available_booking_slots', { p_date: '2026-10-08' });
    return LumaDB.mode;
  });
  expect(mode).toBe('cloud');

  const find = re => seen.find(s => re.test(s.path));
  expect(find(/bookings\?status=eq\.confirmed.*order=starts_at.*limit=5/)).toBeTruthy();
  expect(find(/rpc\/get_available_booking_slots/)).toBeTruthy();
  expect(seen.filter(s => s.m === 'PATCH')[0].path).toContain('id=eq.srv-1');
  expect(seen.filter(s => s.m === 'DELETE')[0].path).toContain('id=eq.srv-1');
  // المفتاح العام على كل نداء، ورمز الجلسة بعد الدخول، وPrefer على الكتابة
  expect(seen.every(s => s.apikey)).toBe(true);
  expect(seen.filter(s => s.path.startsWith('/rest/')).every(s => s.auth === 'Bearer AT123')).toBe(true);
  expect(seen.find(s => s.m === 'POST' && s.path.includes('/rest/v1/bookings')).prefer).toBe('return=representation');
});

test('ping يصف الحالة بصدق في الوضع المحلي', async ({ page }) => {
  await asOwner(page);
  await page.goto('/salon.html');
  await page.waitForTimeout(1100);
  const r = await page.evaluate(async () => await LumaDB.ping());
  expect(r.mode).toBe('local');
  expect(r.ok).toBe(true);
  expect(r.msg).toContain('لم يُربط مشروع سحابي');
});

test('ملف الإعداد المنشور لا يحمل مفاتيح', async ({ page }) => {
  const res = await page.request.get('/luma-config.js');
  const body = await res.text();
  expect(body).toContain('supabaseUrl');
  expect(body).toMatch(/supabaseUrl:\s*''/);        // فارغ في المستودع
  expect(body).toMatch(/supabaseAnonKey:\s*''/);
  // لا مفتاح حقيقي مسرَّب: مفاتيح Supabase رموز JWT تبدأ بـ eyJ
  expect(body).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/);
  // ولا إسناد لمفتاح service_role (ذكره في تعليق تحذيري مقصود)
  expect(body).not.toMatch(/service_role\s*[:=]\s*['"][^'"]+['"]/);
});

/* ═════════ ب-3 · ترحيل بيانات المتصفح ═════════ */

const CLOUD_CFG = "window.LUMA_CONFIG={supabaseUrl:'https://demo.supabase.co',supabaseAnonKey:'anon',salonTz:'Asia/Riyadh'};";

async function mockCloud(context, opts = {}) {
  await context.route('**/luma-config.js', r => r.fulfill(
    { status: 200, contentType: 'application/javascript', body: CLOUD_CFG }));
  await context.route('https://demo.supabase.co/**', route => {
    const req = route.request(); const u = new URL(req.url());
    const json = (o, st = 200) => route.fulfill({ status: st, contentType: 'application/json', body: JSON.stringify(o) });
    if (u.pathname.endsWith('/salons') && req.method() === 'GET') return json([]);
    if (u.pathname.endsWith('/salons')) return json([{ id: 'salon-uuid-1' }]);
    if (u.pathname.endsWith('/staff_profiles')) return json([{ id: 'staff-' + Math.random().toString(36).slice(2, 6) }]);
    if (u.pathname.endsWith('/bookings')) {
      const d = JSON.parse(req.postData() || '{}');
      if (opts.onBooking) opts.onBooking(d);
      // الخادم يرفض ما هو خارج دوام 10:00–22:00 بتوقيت الرياض (07:00–19:00 UTC)
      const h = new Date(d.starts_at).getUTCHours();
      if (h < 7 || h >= 19) return json({ message: 'STAFF_UNAVAILABLE' }, 400);
      return json([{ id: 'bk-1' }]);
    }
    return json([{ id: 'x' }]);
  });
}

async function seedBrowserData(page) {
  await page.addInitScript(() => {
    localStorage.setItem('luma_session', JSON.stringify({ role: 'salon', at: Date.now(), exp: Date.now() + 36e5 }));
    localStorage.setItem('luma_salon_staff', JSON.stringify([{ id: 's1', n: 'ليان', role: 'مكياج' }, { id: 's2', n: 'دانة', role: 'شعر' }]));
    localStorage.setItem('luma_svc_catalog', JSON.stringify([['مكياج عروس', 4, 850], ['قص', 2, 150]]));
    localStorage.setItem('luma_public_bookings', JSON.stringify([
      { staff: 's1', client: 'نوف', service: 'مكياج عروس', price: 850, date: '2026-10-08', time: '17:00', dur: 180 },
      { staff: 's2', client: 'مها', service: 'قص', price: 150, date: '2026-10-08', time: '23:00', dur: 30 },
      { staff: 'مجهولة', client: 'يتيم', service: 'x', price: 0, date: '2026-10-09', time: '12:00' }]));
    localStorage.setItem('luma_page_cfg', JSON.stringify({ title: 'صالون لمسة', city: 'جدة' }));
  });
}

test('المعاينة تعرض ما سيُرحَّل بلا أي كتابة', async ({ page, context }) => {
  let wrote = false;
  await context.route('**/luma-config.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: CLOUD_CFG }));
  await context.route('https://demo.supabase.co/**', route => {
    if (route.request().method() !== 'GET') wrote = true;
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await seedBrowserData(page);
  await page.goto('/salon.html');
  await page.waitForTimeout(1300);
  const prev = await page.evaluate(() => LumaMigrate.preview());
  expect(prev.mode).toBe('cloud');
  expect(prev.alreadyMigrated).toBe(false);
  expect(prev.totalRows).toBeGreaterThan(0);
  expect(prev.pending.map(i => i.label)).toContain('الطاقم');
  expect(wrote).toBe(false);                 // معاينة فقط — لا كتابة
});

test('الترحيل ينقل الطاقم والخدمات والحجوزات ويبلّغ عن كل عنصر', async ({ page, context }) => {
  await mockCloud(context);
  await seedBrowserData(page);
  await page.goto('/salon.html');
  await page.waitForTimeout(1300);
  const rep = await page.evaluate(async () => await LumaMigrate.run());
  expect(rep.salonId).toBe('salon-uuid-1');
  const names = rep.migrated.map(m => m.name);
  expect(names).toContain('ليان');
  expect(names).toContain('دانة');
  expect(names).toContain('مكياج عروس');
  // الحجز اليتيم (بلا موظفة) يُتخطّى برسالة مفهومة لا يسقط صامتاً
  expect(rep.skipped.some(s => /يتيم/.test(s.name))).toBe(true);
  // ورفض الخادم يظهر كما هو
  expect(rep.failed.some(f => /خارج الدوام|متعارض/.test(f.why))).toBe(true);
});

test('وقت الحجز يُحوَّل من توقيت الصالون لا من توقيت جهاز المالكة', async ({ browser }) => {
  // جهاز المالكة بتوقيت طوكيو — النتيجة يجب ألا تتغير
  const ctx = await browser.newContext({ timezoneId: 'Asia/Tokyo' });
  const page = await ctx.newPage();
  const sent = [];
  await mockCloud(ctx, { onBooking: d => sent.push(d) });
  await seedBrowserData(page);
  await page.goto('/salon.html');
  await page.waitForTimeout(1300);
  await page.evaluate(async () => await LumaMigrate.run());
  const nouf = sent.find(d => d.client_name === 'نوف');
  expect(nouf).toBeTruthy();
  // 17:00 بتوقيت الرياض = 14:00 UTC مهما كان توقيت الجهاز
  expect(nouf.starts_at).toContain('T14:00');
  await ctx.close();
});

test('الترحيل لا يُكرَّر ولا يحذف من المتصفح شيئاً', async ({ page, context }) => {
  await mockCloud(context);
  await seedBrowserData(page);
  await page.goto('/salon.html');
  await page.waitForTimeout(1300);
  await page.evaluate(async () => await LumaMigrate.run());
  const again = await page.evaluate(async () => await LumaMigrate.run());
  expect(again.skipped.some(s => /مسبقاً/.test(s.why))).toBe(true);
  expect(again.migrated).toHaveLength(0);
  // المصدر سليم — التراجع ممكن دائماً
  const staff = await page.evaluate(() => JSON.parse(localStorage.getItem('luma_salon_staff') || '[]').length);
  expect(staff).toBe(2);
});

test('الترحيل بلا ربط مشروع يرفض برسالة واضحة', async ({ page }) => {
  await seedBrowserData(page);
  await page.goto('/salon.html');
  await page.waitForTimeout(1200);
  const rep = await page.evaluate(async () => await LumaMigrate.run());
  expect(rep.failed[0].why).toContain('لم يُربط مشروع سحابي');
});
