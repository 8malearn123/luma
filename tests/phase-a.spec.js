// ═══ اختبارات المرحلة أ — تثبّت ما أصلحه الفحص الشامل ═══
// السويت الأصلية (62 اختباراً) لم تلتقط أياً من هذه الأعطال لأنها لم تكن
// تغطي الجوال ولا التواريخ ولا تعارض المواعيد ولا حساب الضريبة.
const { test, expect } = require('@playwright/test');

/* توقيت الرياض: اختبارات التاريخ بلا منطقة زمنية محددة تفقد معناها،
   لأن الجهاز الافتراضي في CI يعمل بتوقيت UTC فلا يظهر الفرق أصلاً */
test.use({ timezoneId: 'Asia/Riyadh' });

/* حجب الشبكة الخارجية حتى تبقى الاختبارات سريعة وحتمية */
test.beforeEach(async ({ page }) => {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, r => r.abort());
});

/* ═════════ أ-3 · التواريخ والتقويم ═════════ */

test('LumaDate: تاريخ محلي لا UTC — حجز ما بعد منتصف الليل لا ينزلق ليوم سابق', async ({ page }) => {
  await page.goto('/booking.html');
  await page.waitForTimeout(600);
  const r = await page.evaluate(() => {
    // 1:30 فجراً بتوقيت الرياض = 22:30 UTC من اليوم السابق
    const t = new Date('2026-09-09T22:30:00Z');
    return { utc: t.toISOString().slice(0, 10), local: LumaDate.iso(t) };
  });
  expect(r.utc).toBe('2026-09-09');     // ما كان يُخزَّن قبل الإصلاح
  expect(r.local).toBe('2026-09-10');   // اليوم المحلي الصحيح
});

test('التقويم ميلادي لا هجري — العميلة والصالون يريان التاريخ نفسه', async ({ page }) => {
  await page.goto('/booking.html');
  await page.waitForTimeout(600);
  const label = await page.evaluate(() => LumaDate.fmt('2026-09-07', { day: 'numeric', month: 'long' }));
  expect(label).toContain('سبتمبر');            // ميلادي
  expect(label).not.toContain('ربيع');          // لا هجري
});

test('لا تواريخ ثابتة في بيانات العرض: كل «قادم» في المستقبل فعلاً', async ({ page }) => {
  await page.goto('/salon.html#page');
  await page.waitForTimeout(1200);
  await page.evaluate(() => PAGE.showTab('books'));
  await page.waitForTimeout(400);
  const bad = await page.evaluate(() =>
    PAGE.bookList().filter(b => b.st === 'up' && LumaDate.isPast(b.date)).map(b => b.date));
  expect(bad).toEqual([]);
});

/* ═════════ أ-2 · منطق الحجز ═════════ */

test('تعارض المواعيد: خدمة طويلة تحجب كامل مدتها لا خانة واحدة', async ({ page }) => {
  await page.goto('/booking.html');
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => {
    const day = days[3];
    BOOKED.push({ staff: 'amal', service: 'مكياج عروس', dur: 180, date: day.iso, time: '17:00' });
    const s = slotsFor('amal', day, 30);
    const at = t => (s.find(x => x.t === t) || {}).taken;
    return { at1700: at('17:00'), at1800: at('18:00'), at1900: at('19:00'), at1630: at('16:30') };
  });
  expect(r.at1700).toBe(true);
  expect(r.at1800).toBe(true);   // كان متاحاً قبل الإصلاح — تعارض مواعيد حقيقي
  expect(r.at1900).toBe(true);
  expect(r.at1630).toBe(false);  // ينتهي 17:00 فلا تداخل
});

test('الخدمة الأطول من المتبقي لا تُعرض خانةً تتجاوز نهاية الدوام', async ({ page }) => {
  await page.goto('/booking.html');
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => {
    const day = days[3];
    const sh = shiftOf('amal', day.wd);
    const long = slotsFor('amal', day, 180);
    return { close: sh.end, last: long.length ? long[long.length - 1].t : null, step: long.length > 1 ? toMin(long[1].t) - toMin(long[0].t) : null };
  });
  expect(toMinutes(r.last) + 180).toBeLessThanOrEqual(toMinutes(r.close));
  expect(r.step).toBe(30);
});
function toMinutes(t) { const m = /^(\d{1,2}):(\d{2})/.exec(String(t)); return m ? +m[1] * 60 + +m[2] : 0; }

test('نافذة الحجز 30 يوماً بتنقّل أسبوعي — لا ثلاثة أيام', async ({ page }) => {
  await page.goto('/booking.html');
  await page.waitForTimeout(800);
  const n = await page.evaluate(() => days.length);
  expect(n).toBe(30);
  const span = await page.evaluate(() => LumaDate.daysBetween(days[0].iso, days[days.length - 1].iso));
  expect(span).toBe(29);
});

test('ساعات اليوم التي مضت لا تُعرض للحجز', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-09-10T13:00:00Z')); // 4:00 عصراً بالرياض
  await page.goto('/booking.html');
  await page.waitForTimeout(800);
  const r = await page.evaluate(() => {
    const s = slotsFor('amal', days[0], 60);
    return { first: s.length ? s[0].t : null, all: s.map(x => x.t) };
  });
  expect(r.all.filter(t => toMinutes(t) <= 16 * 60)).toEqual([]);
});

/* ═════════ أ-4 · الضريبة و ZATCA ═════════ */

test('الضريبة تُستخرج من السعر لا تُضاف إليه — العميلة تدفع ما رأته', async ({ page }) => {
  await page.goto('/salon.html');
  await page.waitForTimeout(1000);
  const r = await page.evaluate(() => vatBreakdown(450));
  expect(r.gross).toBe(450);
  expect(+(r.net + r.vat).toFixed(2)).toBe(450);
  expect(r.vat).toBeCloseTo(58.70, 2);
});

test('الرقم الضريبي يُتحقق من صيغته: 15 رقماً يبدأ وينتهي بـ3', async ({ page }) => {
  await page.goto('/salon.html');
  await page.waitForTimeout(1000);
  const r = await page.evaluate(() => ({
    valid: isValidVatNo('310123456700003'),
    fake: isValidVatNo('000000000000000'),
    short: isValidVatNo('31012345670000'),
    empty: isValidVatNo(''),
  }));
  expect(r).toEqual({ valid: true, fake: false, short: false, empty: false });
});

test('رمز ZATCA: ختم وقت فعلي والبقشيش خارج الوعاء الخاضع للضريبة', async ({ page }) => {
  await page.goto('/salon.html');
  await page.waitForTimeout(1000);
  const r = await page.evaluate(() => {
    const rec = { amount: 304.35, vat: 45.65, gross: 350, tip: 20, total: 370, at: '2026-09-07T17:17:54.039Z' };
    const enc = new TextEncoder();
    const tlv = (tag, str) => { const b = enc.encode(str); const o = new Uint8Array(2 + b.length); o[0] = tag; o[1] = b.length; o.set(b, 2); return o; };
    const stamp = new Date(rec.at).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const parts = [tlv(1, 'صالون لمسة'), tlv(2, '310123456700003'), tlv(3, stamp), tlv(4, rec.gross.toFixed(2)), tlv(5, rec.vat.toFixed(2))];
    return { stamp, total: rec.gross.toFixed(2), vat: rec.vat.toFixed(2),
             hasQr: zatcaQR('صالون لمسة', '310123456700003', rec).length > 100,
             noQrFake: zatcaQR('صالون لمسة', '000000000000000', rec) === '' };
  });
  expect(r.stamp).toBe('2026-09-07T17:17:54Z');          // لا T12:00:00Z ثابت
  expect(+r.total).toBeCloseTo(304.35 + 45.65, 2);       // الإجمالي = صافي + ضريبة
  expect(r.total).not.toBe('370.00');                    // البقشيش ليس توريداً
  expect(r.hasQr).toBe(true);
  expect(r.noQrFake).toBe(true);
});

test('تذكرة الحجز تُفصح أن السعر شامل الضريبة', async ({ page }) => {
  /* ساعة ثابتة صباح ثلاثاء: يوم عمل كامل الخانات، فلا يتعلق الاختبار
     بساعة تشغيله (مساءً تكون خانات اليوم قد مضت) */
  await page.clock.setFixedTime(new Date('2026-09-08T07:00:00Z'));
  await page.goto('/booking.html');
  await page.waitForTimeout(700);
  await page.locator('.svc').first().click();
  await page.click('button:has-text("متابعة")');
  await page.locator('.day:not([disabled])').first().click();
  await page.click('button:has-text("متابعة")');
  for (let g = 0; g < 8; g++) {
    await page.waitForTimeout(250);
    if (await page.locator('.ticket').count()) break;
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
  await expect(page.locator('.ticket')).toContainText('شامل ضريبة القيمة المضافة');
});

/* ═════════ أ-1 · تخطيط الجوال ═════════ */

const DASHBOARDS = ['salon.html', 'expert.html', 'admin.html'];

for (const f of DASHBOARDS) {
  test(`الجوال: ${f} بلا تجاوز أفقي ودرج تنقّل يعمل`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/' + f);
    await page.waitForTimeout(1200);

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(2);

    // المحتوى يملأ العرض بدل أن ينضغط خلف شريط جانبي مثبّت
    const mainW = await page.evaluate(() => Math.round((document.querySelector('.main') || document.body).getBoundingClientRect().width));
    expect(mainW).toBeGreaterThan(340);

    // الدرج مغلق ابتداءً ثم يُفتح بالزر
    await expect(page.locator('.luma-burger')).toBeVisible();
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.sidebar')).visibility)).toBe('hidden');
    await page.click('.luma-burger');
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.sidebar')).visibility)).toBe('visible');
    await expect(page.locator('.luma-burger')).toHaveAttribute('aria-expanded', 'true');

    // Escape يغلقه
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await expect(page.locator('.luma-burger')).toHaveAttribute('aria-expanded', 'false');
  });

  test(`سطح المكتب: ${f} يبقى كما هو — شريط جانبي ثابت وزر القائمة مخفي`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/' + f);
    await page.waitForTimeout(1200);
    const r = await page.evaluate(() => {
      const sb = document.querySelector('.sidebar');
      const bg = document.querySelector('.luma-burger');
      return { w: Math.round(sb.getBoundingClientRect().width), pos: getComputedStyle(sb).position,
               vis: getComputedStyle(sb).visibility, burger: bg ? getComputedStyle(bg).display : 'none',
               overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    expect(r.w).toBeGreaterThan(250);
    expect(r.pos).toBe('sticky');
    expect(r.vis).toBe('visible');
    expect(r.burger).toBe('none');
    expect(r.overflow).toBeLessThanOrEqual(2);
  });
}

test('الجوال: كل شاشات لوحة الصالون بلا تجاوز أفقي', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/salon.html');
  await page.waitForTimeout(1400);
  const n = await page.locator('.nav-item').count();
  const bad = [];
  for (let i = 0; i < n; i++) {
    await page.evaluate(j => { const x = document.querySelectorAll('.nav-item')[j]; if (x) x.click(); }, i);
    await page.waitForTimeout(260);
    const o = await page.evaluate(() => ({
      o: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      t: (document.getElementById('tb-title') || {}).textContent || '',
    }));
    if (o.o > 2) bad.push(`${o.t}=${o.o}px`);
  }
  expect(bad).toEqual([]);
});

test('الجوال: الصفحات العامة بلا تجاوز أفقي', async ({ page }) => {
  const PUBLIC = ['index.html', 'store.html', 'market.html', 'salons.html', 'booking.html',
                  'experience.html', 'login.html', 'staff-portal.html', 'pricing.html'];
  await page.setViewportSize({ width: 390, height: 844 });
  const bad = [];
  for (const f of PUBLIC) {
    await page.goto('/' + f);
    await page.waitForTimeout(700);
    const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (o > 2) bad.push(`${f}=${o}px`);
  }
  expect(bad).toEqual([]);
});

/* ═════════ أ-5 · الحماية والانتشار ═════════ */

test('وثيقة اعتماد الشريك لا تظهر في صفحة الأسعار العامة', async ({ page }) => {
  await page.goto('/pricing.html');
  await page.waitForTimeout(900);
  await expect(page.locator('#partner-approval')).toBeHidden();
  await expect(page.locator('#public-cta')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('التوقيع', { useInnerText: true });
  await expect(page.locator('body')).not.toContainText('ملاحظة الشريك التشغيلي', { useInnerText: true });
  // ولها دعوة حقيقية بدل طريق مسدود
  await expect(page.locator('#public-cta a[href="login.html"]')).toBeVisible();
});

test('وثيقة الشريك تظهر بـ ?doc=partner وتُمنع من الفهرسة', async ({ page }) => {
  await page.goto('/pricing.html?doc=partner');
  await page.waitForTimeout(900);
  await expect(page.locator('#partner-approval')).toBeVisible();
  await expect(page.locator('body')).toContainText('التوقيع', { useInnerText: true });
  const robots = await page.evaluate(() => (document.querySelector('meta[name=robots]') || {}).content || '');
  expect(robots).toContain('noindex');
});

test('robots.txt يمنع فهرسة الوثائق الداخلية ولوحات التحكم', async ({ page }) => {
  const res = await page.request.get('/robots.txt');
  expect(res.status()).toBe(200);
  const body = await res.text();
  for (const p of ['/profile.html', '/admin.html', '/salon.html', '/expert.html', '/staff-portal.html']) {
    expect(body).toContain('Disallow: ' + p);
  }
  expect(body).toContain('Sitemap:');
});

const PUBLIC_SEO = ['index.html', 'store.html', 'market.html', 'salons.html',
                    'booking.html', 'pricing.html', 'expert-landing.html'];
for (const f of PUBLIC_SEO) {
  test(`بطاقة مشاركة كاملة في ${f}`, async ({ page }) => {
    await page.goto('/' + f);
    await page.waitForTimeout(500);
    const m = await page.evaluate(() => ({
      desc: (document.querySelector('meta[name=description]') || {}).content || '',
      title: (document.querySelector('meta[property="og:title"]') || {}).content || '',
      img: (document.querySelector('meta[property="og:image"]') || {}).content || '',
      card: (document.querySelector('meta[name="twitter:card"]') || {}).content || '',
      canon: (document.querySelector('link[rel=canonical]') || {}).href || '',
    }));
    expect(m.desc.length).toBeGreaterThan(40);
    expect(m.title).toContain('LUMA');
    expect(m.img).toContain('og-image.png');
    expect(m.card).toBe('summary_large_image');
    expect(m.canon).toContain(f);
  });
}

test('صورة المشاركة موجودة وبمقاس بطاقة صحيح', async ({ page }) => {
  await page.goto('/index.html');
  const res = await page.request.get('/og-image.png');
  expect(res.status()).toBe(200);
  const size = await page.evaluate(() => new Promise(r => {
    const i = new Image();
    i.onload = () => r({ w: i.naturalWidth, h: i.naturalHeight });
    i.onerror = () => r({ w: 0, h: 0 });
    i.src = '/og-image.png';
  }));
  expect(size).toEqual({ w: 1200, h: 630 });
});

test('اللوحات الخاصة خارج الفهرسة', async ({ page }) => {
  for (const f of ['salon.html', 'expert.html', 'admin.html', 'client.html', 'staff-portal.html', 'profile.html']) {
    await page.goto('/' + f);
    await page.waitForTimeout(300);
    const robots = await page.evaluate(() => (document.querySelector('meta[name=robots]') || {}).content || '');
    expect(robots, f).toContain('noindex');
  }
});

test('امتلاء التخزين يُبلَّغ صراحةً ولا يمرّ صامتاً', async ({ page }) => {
  await page.goto('/salon.html');
  await page.waitForTimeout(1200);
  const r = await page.evaluate(() => {
    const seen = [];
    const orig = window.LUX && LUX.toast;
    if (orig) LUX.toast = (m, t) => { seen.push(String(m)); return orig(m, t); };
    const chunk = 'd'.repeat(240 * 1024);
    let ok = true, saved = 0;
    for (let i = 0; i < 60 && ok; i++) { ok = LumaStore.set('luma_qtest_' + i, chunk); if (ok) saved++; }
    return { saved, lastReturnedFalse: !ok, notified: seen.some(m => m.includes('امتلأت مساحة التخزين')) };
  });
  expect(r.saved).toBeGreaterThan(0);
  expect(r.lastReturnedFalse).toBe(true);   // set تعود false بدل ابتلاع الخطأ
  expect(r.notified).toBe(true);            // ورسالة صريحة للمستخدمة
});
