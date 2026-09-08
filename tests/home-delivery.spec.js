// ═══ التوصيل والخدمة المنزلية — ضمن باقة فَرِيد (799) ═══
// مساران مختلفان: بضاعة تنتقل (توصيل) وخبيرة تنتقل (زيارة منزلية).
// الفرق الجوهري المُختبَر هنا: الزيارة المنزلية تشغل وقت الخبيرة نفسها،
// فيُحجز وقت الطريق على جدولها وإلا صار موعدها التالي مستحيلاً.
const { test, expect } = require('@playwright/test');

test.use({ timezoneId: 'Asia/Riyadh' });

test.beforeEach(async ({ context }) => {
  await context.route(/^https?:\/\/(?!127\.0\.0\.1)/, r => r.abort());
});

/* ملاحظة تُوفّر ساعة تصحيح: لوحة الصالون تضم إطار «المعاينة الفورية»،
   وكل إعادة رسم تُعيد تحميله. و addInitScript يعمل في كل إطار، فبذرةٌ
   غير مقيّدة تُعيد كتابة التخزين من داخل الإطار وتدهس ما حفظته اللوحة.
   لذلك تُزرع البذور في الإطار الأعلى وحده — ومرةً واحدة، لأن البذرة
   تُعاد على كل تنقّل فتدهس ما كتبه التطبيق نفسه بعدها. */

const HOME_CFG = {
  enabled: true,
  delivery: { on: true, fee: 25, freeAbove: 300, prepDays: 'خلال يومين',
              zones: [{ name: 'شمال جدة', fee: 20, eta: 'خلال يوم' }] },
  homeService: { on: true, fee: 80, minTotal: 250, travelMin: 30,
                 districts: ['الشاطئ', 'الروضة'], services: [], staff: [],
                 from: '10:00', to: '20:00' },
};

async function withFareed(page, cfg = HOME_CFG) {
  await page.addInitScript(([c]) => {
    if (window.top !== window.self) return;
    if (localStorage.getItem('luma_seeded')) return;   // بذرة أولية لا تُعاد
    localStorage.setItem('luma_seeded', '1');
    localStorage.setItem('luma_plan', 'fareed');
    localStorage.setItem('luma_home_cfg', JSON.stringify(c));
    localStorage.setItem('luma_session', JSON.stringify(
      { role: 'salon', at: Date.now(), exp: Date.now() + 36e5 }));
  }, [cfg]);
}

/* ═════════ بوابة الباقة ═════════ */

test('الميزة مقفلة على الباقات الأدنى ومفتوحة على فَرِيد', async ({ page }) => {
  await page.addInitScript(() => {
    if (window.top !== window.self) return;
    localStorage.setItem('luma_session', JSON.stringify({ role: 'salon', at: Date.now(), exp: Date.now() + 36e5 }));
  });
  await page.goto('/salon.html');
  await page.waitForTimeout(1200);
  const r = await page.evaluate(() => {
    const out = {};
    LumaHome.setPlan('sanaa');  out.sanaa = LumaHome.hasFeature('home');
    LumaHome.setPlan('wahaj');  out.wahaj = LumaHome.hasFeature('home');
    LumaHome.setPlan('fareed'); out.fareed = LumaHome.hasFeature('home');
    out.price = LumaHome.PLANS.fareed.price;
    return out;
  });
  expect(r).toEqual({ sanaa: false, wahaj: false, fareed: true, price: 799 });
});

test('بلا باقة فَرِيد لا تُفعَّل الميزة ولو ضُبط الإعداد', async ({ page }) => {
  await page.addInitScript(([c]) => {
    if (window.top !== window.self) return;
    localStorage.setItem('luma_plan', 'wahaj');
    localStorage.setItem('luma_home_cfg', JSON.stringify(c));
    localStorage.setItem('luma_session', JSON.stringify({ role: 'salon', at: Date.now(), exp: Date.now() + 36e5 }));
  }, [HOME_CFG]);
  await page.goto('/salon.html');
  await page.waitForTimeout(1200);
  const r = await page.evaluate(() => ({ d: LumaHome.deliveryOn(), h: LumaHome.homeServiceOn() }));
  expect(r).toEqual({ d: false, h: false });
});

test('لوحة الصالون: تعرض دعوة الترقية بلا فَرِيد، واللوحة كاملة معها', async ({ page }) => {
  await page.addInitScript(() => {
    if (window.top !== window.self) return;
    localStorage.setItem('luma_session', JSON.stringify({ role: 'salon', at: Date.now(), exp: Date.now() + 36e5 }));
  });
  await page.goto('/salon.html#page');
  await page.waitForTimeout(1500);
  await page.evaluate(() => PAGE.showTab('home'));
  await page.waitForTimeout(400);
  await expect(page.locator('#screen')).toContainText('ضمن باقة فَرِيد', { useInnerText: true });

  await page.evaluate(() => { LumaHome.setPlan('fareed'); PAGE.showTab('home'); });
  await page.waitForTimeout(400);
  await expect(page.locator('#screen')).toContainText('توصيل المنتجات', { useInnerText: true });
  await expect(page.locator('#screen')).toContainText('الخدمة في منزل العميلة', { useInnerText: true });
});

/* ═════════ حساب الصالون: الإعداد ═════════ */

test('المالكة تضبط النطاقات والأحياء ورسوم الانتقال', async ({ page }) => {
  await withFareed(page, { enabled: true, delivery: { on: true }, homeService: { on: true } });
  await page.goto('/salon.html#page');
  await page.waitForTimeout(1500);
  await page.evaluate(() => PAGE.showTab('home'));
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    document.getElementById('zoNm').value = 'جنوب جدة';
    document.getElementById('zoFee').value = '35';
    document.getElementById('zoEta').value = 'خلال يومين';
    PAGE.homeAddZone();
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => { document.getElementById('hdIn').value = 'النزهة'; PAGE.homeAddDistrict(); });
  await page.waitForTimeout(300);
  await page.evaluate(() => PAGE.homeField('homeService.travelMin', '45'));
  const cfg = await page.evaluate(() => LumaHome.cfg());
  expect(cfg.delivery.zones[0]).toMatchObject({ name: 'جنوب جدة', fee: 35 });
  expect(cfg.homeService.districts).toContain('النزهة');
  expect(cfg.homeService.travelMin).toBe(45);
  // ويبقى محفوظاً بعد التحديث
  await page.reload();
  await page.waitForTimeout(1300);
  expect(await page.evaluate(() => LumaHome.cfg().homeService.travelMin)).toBe(45);
});

test('حساب الرسوم: نطاق، ومجاني فوق الحد، وحد أدنى للزيارة', async ({ page }) => {
  await withFareed(page);
  await page.goto('/salon.html');
  await page.waitForTimeout(1200);
  const r = await page.evaluate(() => ({
    zone: LumaHome.deliveryFee(100, 'شمال جدة'),
    dflt: LumaHome.deliveryFee(100, ''),
    free: LumaHome.deliveryFee(500, 'شمال جدة'),
    okVisit: LumaHome.homeFee(300),
    lowVisit: LumaHome.homeFee(100),
    dur: LumaHome.totalDurationAtHome(60),
  }));
  expect(r.zone.fee).toBe(20);                 // رسوم النطاق تسبق الافتراضية
  expect(r.dflt.fee).toBe(25);
  expect(r.free.free).toBe(true);              // مجاني فوق 300
  expect(r.okVisit.ok).toBe(true);
  expect(r.lowVisit.ok).toBe(false);
  expect(r.lowVisit.reason).toContain('الحد الأدنى');
  expect(r.dur).toBe(120);                     // 60 خدمة + 30 طريق ×2
});

test('المالكة تنقل حالة الطلب والزيارة خطوة خطوة', async ({ page }) => {
  await page.addInitScript(([c]) => {
    if (window.top !== window.self) return;
    if (localStorage.getItem('luma_seeded')) return;   // بذرة أولية لا تُعاد
    localStorage.setItem('luma_seeded', '1');
    localStorage.setItem('luma_plan', 'fareed');
    localStorage.setItem('luma_home_cfg', JSON.stringify(c));
    localStorage.setItem('luma_session', JSON.stringify({ role: 'salon', at: Date.now(), exp: Date.now() + 36e5 }));
    localStorage.setItem('luma_salon_orders', JSON.stringify([{ mode: 'delivery', ref: 'ORD-1', client: 'نوف',
      status: 'new', address: { district: 'شمال جدة', street: 'طريق الملك' }, total: 340 }]));
    localStorage.setItem('luma_public_bookings', JSON.stringify([{ mode: 'home', client: 'مها', service: 'مكياج',
      status: 'confirmed', date: '2026-10-01', time: '17:00', address: { district: 'الشاطئ', street: 'ش الأمير' } }]));
  }, [HOME_CFG]);
  await page.goto('/salon.html#page');
  await page.waitForTimeout(1500);
  await page.evaluate(() => PAGE.showTab('home'));
  await page.waitForTimeout(400);
  await expect(page.locator('#screen')).toContainText('الطلبات والزيارات الجارية', { useInnerText: true });

  await page.evaluate(() => PAGE.homeAdvance('order', 0));
  await page.waitForTimeout(300);
  await page.evaluate(() => PAGE.homeAdvance('visit', 0));
  await page.waitForTimeout(300);
  const st = await page.evaluate(() => ({
    order: (LumaStore.get('luma_salon_orders', [])[0] || {}).status,
    visit: (LumaStore.get('luma_public_bookings', [])[0] || {}).status,
  }));
  expect(st.order).toBe('prep');        // طلب جديد ← قيد التجهيز
  expect(st.visit).toBe('onway');       // مؤكد ← الخبيرة في الطريق
});

/* ═════════ حساب العميلة: الحجز والطلب ═════════ */

test('صفحة الحجز: خيار المكان يظهر ويُجمع العنوان', async ({ page }) => {
  await withFareed(page);
  await page.clock.setFixedTime(new Date('2026-09-08T07:00:00Z'));
  await page.goto('/booking.html');
  await page.waitForTimeout(900);
  await page.locator('.svc').first().click();
  await page.click('button:has-text("متابعة")');
  await page.waitForTimeout(400);
  await expect(page.locator('.venue-pick')).toBeVisible();
  await page.locator('.venue', { hasText: 'في منزلي' }).click();
  await page.waitForTimeout(300);
  // أحياء المالكة فقط تُعرض
  const opts = await page.locator('#adDist option').allTextContents();
  expect(opts).toContain('الشاطئ');
  expect(opts).toContain('الروضة');
  // بلا عنوان لا يمكن المتابعة
  await expect(page.locator('button:has-text("متابعة لاختيار التاريخ")')).toBeDisabled();
  await page.selectOption('#adDist', 'الشاطئ');
  await page.fill('#adStreet', 'شارع الأمير');
  await page.click('button:has-text("حفظ العنوان")');
  await page.waitForTimeout(300);
  await expect(page.locator('button:has-text("متابعة لاختيار التاريخ")')).toBeEnabled();
});

test('الزيارة المنزلية تحجز وقت الطريق على جدول الخبيرة', async ({ page }) => {
  await withFareed(page);
  await page.clock.setFixedTime(new Date('2026-09-08T07:00:00Z'));
  await page.goto('/booking.html');
  await page.waitForTimeout(900);
  const r = await page.evaluate(() => {
    const day = days.find(d => !shiftOf('amal', d.wd).off && !onLeave('amal', d.iso) && !LumaDate.isToday(d.iso));
    const salonSlots = slotsFor('amal', day, 60).length;                        // بالصالون
    const homeSlots = slotsFor('amal', day, LumaHome.totalDurationAtHome(60)).length; // بالمنزل
    return { salonSlots, homeSlots, booked: LumaHome.totalDurationAtHome(60) };
  });
  expect(r.booked).toBe(120);
  // الخانات المتاحة للزيارة المنزلية أقل — لأنها تشغل ضعف الوقت
  expect(r.homeSlots).toBeLessThan(r.salonSlots);
});

test('الحجز المنزلي يُحفظ بمكانه وعنوانه ومدته شاملة الطريق', async ({ page }) => {
  await withFareed(page);
  await page.clock.setFixedTime(new Date('2026-09-08T07:00:00Z'));
  await page.goto('/booking.html');
  await page.waitForTimeout(900);
  await page.locator('.svc').first().click();
  await page.click('button:has-text("متابعة")');
  await page.waitForTimeout(300);
  await page.locator('.venue', { hasText: 'في منزلي' }).click();
  await page.waitForTimeout(300);
  await page.selectOption('#adDist', 'الشاطئ');
  await page.fill('#adStreet', 'شارع الأمير');
  await page.fill('#adDetails', 'فيلا 12');
  await page.click('button:has-text("حفظ العنوان")');
  await page.waitForTimeout(300);
  await page.click('button:has-text("متابعة لاختيار التاريخ")');
  await page.waitForTimeout(300);
  await page.locator('.day:not([disabled])').first().click();
  await page.click('button:has-text("متابعة")');
  await page.waitForTimeout(400);
  await page.locator('.stf:not(.leave)').first().click();
  await page.waitForTimeout(300);
  await page.locator('.slot:not([disabled])').first().click();
  await page.waitForTimeout(400);
  // التذكرة تُظهر رسوم الانتقال والعنوان
  await expect(page.locator('.ticket')).toContainText('رسوم انتقال الخبيرة');
  await expect(page.locator('.ticket')).toContainText('شارع الأمير');
  await page.click('button:has-text("تأكيد الحجز")');
  await page.waitForTimeout(600);
  const rec = await page.evaluate(() => {
    const l = JSON.parse(localStorage.getItem('luma_public_bookings') || '[]');
    return l[l.length - 1];
  });
  expect(rec.mode).toBe('home');
  expect(rec.homeFee).toBe(80);
  expect(rec.status).toBe('confirmed');
  expect(rec.address.district).toBe('الشاطئ');
  expect(rec.dur).toBe(rec.serviceMin + rec.travelMin * 2);   // الطريق محجوز فعلاً
});

test('بلا تفعيل الخدمة المنزلية لا يظهر خيار المكان إطلاقاً', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-08T07:00:00Z'));
  await page.goto('/booking.html');
  await page.waitForTimeout(900);
  await page.locator('.svc').first().click();
  await page.click('button:has-text("متابعة")');
  await page.waitForTimeout(400);
  await expect(page.locator('.venue-pick')).toHaveCount(0);
  await expect(page.locator('.days')).toBeVisible();     // يذهب للتاريخ مباشرة
});

test('سلة المتجر: توصيل برسوم نطاق، ومجاني فوق الحد', async ({ page }) => {
  await withFareed(page);
  await page.goto('/booking.html');
  await page.waitForTimeout(900);
  const r = await page.evaluate(() => {
    const first = SHOP[0];
    cart[first.n] = 1;
    shipMode = 'deliver'; shipZone = 'شمال جدة';
    const withZone = { sub: cartTotal(), fee: shipFee(), grand: cartGrand() };
    cart[first.n] = Math.ceil(400 / first.p);       // تجاوز حد المجانية
    const big = { sub: cartTotal(), fee: shipFee(), grand: cartGrand() };
    shipMode = 'pickup';
    const pickup = { fee: shipFee(), grand: cartGrand() };
    return { withZone, big, pickup };
  });
  expect(r.withZone.fee).toBe(20);
  expect(r.withZone.grand).toBe(r.withZone.sub + 20);
  expect(r.big.fee).toBe(0);                       // مجاني فوق 300
  expect(r.pickup.fee).toBe(0);                    // الاستلام بلا رسوم
});

test('طلب التوصيل يُحفظ بعنوانه ورسومه وحالة تتبّعه', async ({ page }) => {
  await withFareed(page);
  await page.goto('/booking.html');
  await page.waitForTimeout(900);
  await page.evaluate(() => { cart[SHOP[0].n] = 1; shipMode = 'deliver'; shipZone = 'شمال جدة'; shipAddr = 'طريق الملك، فيلا 3'; });
  await page.evaluate(() => openCart());
  await page.waitForTimeout(400);
  await page.fill('#odName', 'نوف العتيبي');
  await page.fill('#odPhone', '0501234567');
  await page.click('button:has-text("تأكيد الطلب")');
  await page.waitForTimeout(600);
  const o = await page.evaluate(() => JSON.parse(localStorage.getItem('luma_salon_orders') || '[]')[0]);
  expect(o.mode).toBe('delivery');
  expect(o.shipFee).toBe(20);
  expect(o.status).toBe('new');
  expect(o.address.street).toContain('طريق الملك');
});

test('حساب العميلة: عناويني وتتبّع الزيارات والطلبات', async ({ page }) => {
  await page.addInitScript(([c]) => {
    if (window.top !== window.self) return;
    localStorage.setItem('luma_session', JSON.stringify({ role: 'client', at: Date.now(), exp: Date.now() + 36e5 }));
    localStorage.setItem('luma_plan', 'fareed');
    localStorage.setItem('luma_home_cfg', JSON.stringify(c));
    localStorage.setItem('luma_addresses', JSON.stringify([{ id: 'a1', label: 'الشاطئ', district: 'الشاطئ', street: 'شارع الأمير' }]));
    localStorage.setItem('luma_public_bookings', JSON.stringify([{ mode: 'home', status: 'onway', service: 'مكياج عروس',
      staffName: 'أمل', date: '2026-09-12', time: '17:00', price: 850, homeFee: 80,
      address: { district: 'الشاطئ', street: 'شارع الأمير' } }]));
    localStorage.setItem('luma_salon_orders', JSON.stringify([{ mode: 'delivery', status: 'out', ref: 'ORD-1',
      items: { 'سيروم': 1 }, total: 340, address: { district: 'شمال جدة', street: 'طريق الملك' } }]));
  }, [HOME_CFG]);
  await page.goto('/client.html');
  await page.waitForTimeout(1300);
  await page.evaluate(() => CLI.go('bookings'));
  await page.waitForTimeout(400);
  await expect(page.locator('body')).toContainText('زياراتي المنزلية وطلباتي', { useInnerText: true });
  await expect(page.locator('body')).toContainText('الخبيرة في الطريق', { useInnerText: true });
  await expect(page.locator('body')).toContainText('خرج للتوصيل', { useInnerText: true });

  await page.evaluate(() => CLI.go('account'));
  await page.waitForTimeout(400);
  await expect(page.locator('body')).toContainText('عناويني', { useInnerText: true });
  await expect(page.locator('body')).toContainText('شارع الأمير', { useInnerText: true });
});

test('صفحة الباقات تُدرج الميزتين ضمن فَرِيد وحدها', async ({ page }) => {
  await page.goto('/pricing.html');
  await page.waitForTimeout(1200);
  await expect(page.locator('body')).toContainText('توصيل المنتجات للمنزل', { useInnerText: true });
  await expect(page.locator('body')).toContainText('الخدمة في منزل العميلة', { useInnerText: true });
  // في جدول المقارنة: علامة لفَرِيد فقط
  const row = page.locator('#ctable tr', { hasText: 'الخدمة في منزل العميلة' }).first();
  const cells = await row.locator('td').allTextContents();
  expect(cells.length).toBeGreaterThanOrEqual(4);
});
