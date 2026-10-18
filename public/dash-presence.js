/* LUMA dashboard — Presence screens: profile, site, portfolio, myservices */
(function(){
  const S = window.LUMA_SCREENS = window.LUMA_SCREENS || {};
  const tile = (label='',h=150,badge='')=>`<div class="pf-tile" style="height:${h}px">${badge?`<span class="pf-badge">${badge}</span>`:''}<svg class="lat" width="100%" height="100%"><rect width="100%" height="100%" fill="url(#dlat)"/></svg><span class="mk">◆</span>${label?`<span class="pf-lbl">${label}</span>`:''}</div>`;
  const LATDEF = `<svg width="0" height="0" style="position:absolute"><defs><pattern id="dlat" width="64" height="64" patternUnits="userSpaceOnUse"><g fill="none" stroke="#9c8047" stroke-width="1" opacity="0.5"><circle cx="0" cy="0" r="32"/><circle cx="64" cy="0" r="32"/><circle cx="0" cy="64" r="32"/><circle cx="64" cy="64" r="32"/><circle cx="32" cy="32" r="32"/></g></pattern></defs></svg>`;

  const COMMON = `
<style>
  .pf-tile{position:relative;border-radius:12px;background:linear-gradient(150deg,#1b1a21,#18171d);border:1px solid var(--line);overflow:hidden;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:border-color .25s,transform .25s;}
  .pf-tile:hover{border-color:var(--gold-deep);transform:translateY(-3px);}
  .pf-tile .lat{position:absolute;inset:0;opacity:0.4;}
  .pf-tile .mk{position:relative;color:var(--gold-deep);font-size:22px;}
  .pf-tile .pf-lbl{position:absolute;bottom:12px;right:14px;font-size:12.5px;color:var(--cream);font-weight:500;}
  .pf-badge{position:absolute;top:10px;left:10px;z-index:3;font-size:10px;color:var(--gold-light);background:rgba(23,18,13,0.8);border:0.5px solid var(--gold-deep);border-radius:20px;padding:3px 9px;}
  .form-row{display:flex;flex-direction:column;gap:7px;margin-bottom:18px;}
  .form-row label{font-size:13px;color:var(--gold-pale);font-weight:500;}
  .inp,.ta{background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:13px 15px;color:var(--white);font-family:'IBM Plex Sans Arabic','Cairo',sans-serif;font-size:14px;font-weight:300;outline:none;transition:border-color .25s;width:100%;}
  .inp:focus,.ta:focus{border-color:var(--gold-deep);}
  .ta{resize:none;min-height:110px;line-height:1.8;}
  .two{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
  @media(max-width:560px){.two{grid-template-columns:1fr;}}
  .toggle{width:46px;height:27px;border-radius:20px;border:none;cursor:pointer;position:relative;transition:background .25s;flex-shrink:0;}
  .toggle.on{background:linear-gradient(120deg,#dbbd81,#9c8047);}
  .toggle.off{background:var(--surface3);}
  .toggle .k{position:absolute;top:3px;width:21px;height:21px;border-radius:50%;background:#fff;transition:right .25s,left .25s;}
  .toggle.on .k{left:3px;} .toggle.off .k{right:3px;}
  .chip-tag{font-size:12.5px;color:var(--gold-pale);border:0.5px solid var(--gold-deep);background:rgba(156,124,58,0.08);padding:7px 14px;border-radius:20px;display:inline-flex;align-items:center;gap:8px;}
  .chip-tag .x{color:var(--muted);cursor:pointer;}
  .twocol{display:grid;grid-template-columns:1fr 360px;gap:22px;align-items:start;}
  @media(max-width:1050px){.twocol{grid-template-columns:1fr;}}
</style>${LATDEF}`;

  /* ════════ PROFILE ════════ */
  S.profile = { render(){ return COMMON + `
<div class="twocol">
  <div>
    <div class="card" style="margin-bottom:18px">
      <div class="sec-label">المعلومات الأساسية <span class="ln"></span></div>
      <div class="two">
        <div class="form-row"><label>الاسم الكامل</label><input class="inp" value="رهف العتيبي"/></div>
        <div class="form-row"><label>اسم العرض في المتجر</label><input class="inp" value="رهف · استوديو مكياج"/></div>
      </div>
      <div class="two">
        <div class="form-row"><label>التخصص الرئيسي</label><input class="inp" value="خبيرة مكياج"/></div>
        <div class="form-row"><label>المدينة</label><input class="inp" value="جدة"/></div>
      </div>
    </div>
    <div class="card" style="margin-bottom:18px">
      <div class="sec-label">النبذة التعريفية <span class="ln"></span></div>
      <div class="form-row"><textarea class="ta">متخصصة في مكياج العرائس والسهرات بلمسة ناعمة تُبرز ملامحكِ الطبيعية. خبرة ٨ سنوات في أرقى مناسبات جدة.</textarea></div>
      <div style="font-size:12px;color:var(--muted)">١٤٢ / ٢٤٠ حرفاً</div>
    </div>
    <div class="card" style="margin-bottom:18px">
      <div class="sec-label">التخصصات <span class="ln"></span></div>
      <div style="display:flex;flex-wrap:wrap;gap:9px">
        ${['مكياج عرائس','سهرات','تصوير','مكياج ناعم','جلسات تعليمية'].map(t=>`<span class="chip-tag">${t} <span class="x">×</span></span>`).join('')}
        <span class="chip-tag" style="border-style:dashed;color:var(--muted)">+ إضافة</span>
      </div>
    </div>
    <div class="card">
      <div class="sec-label">معلومات التواصل <span class="ln"></span></div>
      <div class="two">
        <div class="form-row"><label>رقم الجوال</label><input class="inp" dir="ltr" style="text-align:right" value="05X XXX XXXX"/></div>
        <div class="form-row"><label>حساب انستقرام</label><input class="inp" dir="ltr" style="text-align:right" value="@rahaf.studio"/></div>
      </div>
    </div>
    <div style="display:flex;gap:12px;justify-content:flex-start;margin-top:20px">
      <button class="btn btn-gold">حفظ التغييرات</button>
      <button class="btn btn-ghost">إلغاء</button>
    </div>
  </div>
  <div>
    <div class="card" style="text-align:center;position:sticky;top:90px">
      <div class="sec-label" style="justify-content:center">معاينة بطاقتك <span style="position:absolute;left:22px"></span></div>
      <div style="width:96px;height:96px;border-radius:50%;margin:6px auto 0;background:linear-gradient(140deg,#201f26,#18171d);border:1px solid var(--gold-deep);display:flex;align-items:center;justify-content:center;font-family:'Bodoni Moda',serif;font-size:42px;color:var(--gold-light);position:relative">ر<button style="position:absolute;bottom:0;left:0;width:30px;height:30px;border-radius:50%;background:var(--gold-light);border:2px solid var(--surface);color:#131217;cursor:pointer;font-size:13px">✎</button></div>
      <div style="font-family:'IBM Plex Sans Arabic','Cairo',sans-serif;font-weight:700;font-size:19px;color:var(--white);margin-top:14px;display:flex;align-items:center;gap:7px;justify-content:center">رهف العتيبي <span style="color:var(--gold-light);font-size:13px">◆</span></div>
      <div style="font-size:13px;color:var(--gold-pale)">خبيرة مكياج · جدة</div>
      <div style="display:flex;align-items:center;gap:7px;justify-content:center;margin-top:10px;font-size:13px;color:var(--cream)"><span style="color:var(--gold-light)">★</span> 4.9 <span style="color:var(--muted)">· ٢١٣ حجز</span></div>
      <div style="margin-top:18px;padding-top:18px;border-top:1px solid var(--line-soft);font-size:12.5px;color:var(--muted);line-height:1.7">هكذا تظهرين للعميلات في متجر لوما.</div>
    </div>
  </div>
</div>`; }};

  /* ════════ SITE (public landing) ════════ */
  const SECTIONS=[
    {t:'معرض الأعمال', d:'عرض صورك للعميلات', on:true},
    {t:'قائمة الخدمات والأسعار', d:'مع زر حجز مباشر', on:true},
    {t:'التقييمات والمراجعات', d:'بناء الثقة', on:true},
    {t:'نبذة تعريفية', d:'قصتك ومسيرتك', on:true},
    {t:'بطاقات الإهداء', d:'بيع بطاقات هدايا', on:false},
    {t:'الأسئلة الشائعة', d:'إجابات جاهزة', on:false},
  ];
  S.site = { render(){ return COMMON + `
<div class="twocol" style="grid-template-columns:1fr 380px">
  <div>
    <div class="card" style="margin-bottom:18px">
      <div class="sec-label">رابط استوديوكِ <span class="ln"></span></div>
      <div style="display:flex;align-items:center;gap:12px;background:var(--bg);border:1px solid var(--line);border-radius:11px;padding:6px 6px 6px 16px">
        <span style="flex:1;font-family:'IBM Plex Mono',monospace;font-size:14px;color:var(--gold-light);direction:ltr;text-align:left">luma.sa/rahaf</span>
        <button class="btn btn-ghost" style="padding:9px 16px">نسخ</button>
        <button class="btn btn-gold" style="padding:9px 16px">مشاركة</button>
      </div>
      <div style="display:flex;gap:18px;margin-top:18px;align-items:center">
        <div style="width:96px;height:96px;border-radius:12px;background:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <svg width="74" height="74" viewBox="0 0 74 74">${qr()}</svg>
        </div>
        <div><div style="font-size:14px;color:var(--white);font-weight:600">رمز QR للحجز السريع</div><div style="font-size:12.5px;color:var(--muted);margin-top:5px;line-height:1.7;max-width:34ch">ضعيه في استوديوكِ أو على حساباتك ليحجز العملاء بمسحة واحدة.</div><button class="btn btn-ghost" style="margin-top:12px;padding:8px 16px">تحميل الرمز</button></div>
      </div>
    </div>
    <div class="card">
      <div class="sec-label">أقسام صفحتك <span class="ln"></span></div>
      ${SECTIONS.map(s=>`<div style="display:flex;align-items:center;gap:14px;padding:13px 0;border-bottom:1px solid var(--line-soft)">
        <div style="flex:1"><div style="font-size:14.5px;color:var(--white);font-weight:500">${s.t}</div><div style="font-size:12.5px;color:var(--muted);margin-top:1px">${s.d}</div></div>
        <button class="toggle ${s.on?'on':'off'}" onclick="this.classList.toggle('on');this.classList.toggle('off')"><span class="k"></span></button>
      </div>`).join('')}
    </div>
  </div>
  <div>
    <div style="position:sticky;top:90px">
      <div class="sec-label">معاينة مباشرة <span class="ln"></span></div>
      <div style="border:1px solid var(--line);border-radius:14px;overflow:hidden;background:var(--surface)">
        <div style="display:flex;align-items:center;gap:7px;padding:11px 14px;border-bottom:1px solid var(--line);background:var(--surface2)">
          <span style="width:9px;height:9px;border-radius:50%;background:var(--line)"></span><span style="width:9px;height:9px;border-radius:50%;background:var(--line)"></span><span style="width:9px;height:9px;border-radius:50%;background:var(--line)"></span>
          <span style="flex:1;margin-right:8px;font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--muted);direction:ltr;text-align:left">luma.sa/rahaf</span>
        </div>
        <div style="padding:24px 20px;text-align:center">
          <div style="width:64px;height:64px;border-radius:50%;margin:0 auto;background:linear-gradient(140deg,#201f26,#18171d);border:1px solid var(--gold-deep);display:flex;align-items:center;justify-content:center;font-family:'Bodoni Moda',serif;font-size:28px;color:var(--gold-light)">ر</div>
          <div style="font-family:'IBM Plex Sans Arabic','Cairo',sans-serif;font-weight:700;font-size:17px;color:var(--white);margin-top:12px">رهف · استوديو مكياج</div>
          <div style="font-size:12px;color:var(--gold-pale)">خبيرة مكياج · جدة</div>
          <div style="font-size:11.5px;color:var(--cream);margin-top:4px"><span style="color:var(--gold-light)">★</span> 4.9 · ٢١٣ حجز</div>
          <button class="btn btn-gold" style="width:100%;justify-content:center;margin-top:16px">احجزي الآن</button>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:14px">${tile('',60)}${tile('',60)}${tile('',60)}</div>
        </div>
      </div>
    </div>
  </div>
</div>`; }};

  /* ════════ PORTFOLIO ════════ */
  const CATS=['الكل','مكياج عرائس','سهرات','مكياج ناعم','قبل / بعد'];
  S.portfolio = { render(){ return COMMON + `
<style>.pf-cat{font-family:'IBM Plex Sans Arabic','Cairo',sans-serif;font-size:12.5px;padding:8px 16px;border-radius:20px;cursor:pointer;background:var(--surface);border:1px solid var(--line);color:var(--muted);}.pf-cat.on{background:rgba(156,124,58,0.14);border-color:var(--gold-deep);color:var(--gold-light);}</style>
<div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-wrap:wrap">
  <div style="display:flex;gap:8px;flex-wrap:wrap">${CATS.map((c,i)=>`<button class="pf-cat ${i===0?'on':''}" onclick="this.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('on'));this.classList.add('on')">${c}</button>`).join('')}</div>
  <div style="margin-right:auto;display:flex;gap:10px"><button class="btn btn-gold">+ رفع صور</button></div>
</div>
<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:14px" id="pf-grid">
  ${tile('مكياج عروس · نوف',210,'مميّز')}
  ${tile('سهرة ذهبية',210)}
  ${tile('قبل / بعد',210,'قبل · بعد')}
  ${tile('مكياج ناعم',210)}
  ${tile('عروس كلاسيك',210)}
  ${tile('سهرة',210,'قبل · بعد')}
  ${tile('تخرّج',210)}
  ${tile('عروس مسائية',210)}
  <div class="pf-tile" style="height:210px;border-style:dashed;flex-direction:column;gap:8px"><span class="mk" style="font-size:30px">+</span><span style="position:relative;font-size:12.5px;color:var(--muted)">أضيفي صورة</span></div>
</div>
<style>@media(max-width:1100px){#pf-grid{grid-template-columns:repeat(3,1fr)!important;}}@media(max-width:680px){#pf-grid{grid-template-columns:repeat(2,1fr)!important;}}</style>`; }};

  /* ════════ MY SERVICES ════════ */
  const SVC=[
    {n:'مكياج عروس كامل', d:'١٢٠ دقيقة', p:850, on:true, book:'الأكثر حجزاً'},
    {n:'مكياج سهرة', d:'٦٠ دقيقة', p:350, on:true, book:''},
    {n:'مكياج ناعم / نهاري', d:'٤٥ دقيقة', p:250, on:true, book:''},
    {n:'جلسة تعليمية خاصة', d:'٩٠ دقيقة', p:500, on:true, book:''},
    {n:'مكياج تخرّج', d:'٦٠ دقيقة', p:300, on:false, book:''},
  ];
  S.myservices = { render(){ return COMMON + `
<div class="cl-kpi" style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:22px">
  <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('services',19)}</div></div><div class="val">5</div><div class="k">إجمالي الخدمات</div></div>
  <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('calendar',19)}</div></div><div class="val">850<span class="u">ر.س</span></div><div class="k">أعلى خدمة سعراً</div></div>
  <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('loyalty',19)}</div><div class="delta up">★</div></div><div class="val">مكياج عروس</div><div class="k">الأكثر حجزاً هذا الشهر</div></div>
</div>
<style>.cl-kpi .stat .val{font-size:32px}</style>
<div class="sec-label">خدماتك <span class="ln"></span><span class="more"><button class="btn btn-gold" style="padding:9px 18px">+ خدمة جديدة</button></span></div>
<div style="display:flex;flex-direction:column;gap:11px">
  ${SVC.map(s=>`<div style="display:flex;align-items:center;gap:16px;background:var(--surface);border:1px solid var(--line);border-radius:13px;padding:16px 20px;${s.on?'':'opacity:0.6'}">
    <div style="width:44px;height:44px;border-radius:11px;background:var(--surface3);border:0.5px solid var(--line);display:flex;align-items:center;justify-content:center;color:var(--gold-light)">${icon('services',20)}</div>
    <div style="flex:1"><div style="display:flex;align-items:center;gap:9px"><span style="font-size:15.5px;color:var(--white);font-weight:600">${s.n}</span>${s.book?`<span class="badge gold">★ ${s.book}</span>`:''}</div><div style="font-size:12.5px;color:var(--muted);margin-top:2px">◷ ${s.d}</div></div>
    <div style="font-family:'Bodoni Moda',serif;font-size:26px;color:var(--gold-light);direction:ltr">${s.p} <span style="font-family:'IBM Plex Sans Arabic',Cairo;font-size:12px;color:var(--muted)">ر.س</span></div>
    <button class="toggle ${s.on?'on':'off'}" onclick="this.classList.toggle('on');this.classList.toggle('off');this.closest('div').style.opacity=this.classList.contains('on')?'1':'0.6'"><span class="k"></span></button>
    <button class="bk-more" style="background:none;border:none;color:var(--muted);font-size:20px;cursor:pointer">⋯</button>
  </div>`).join('')}
</div>`; }};

  function qr(){ // decorative QR
    let r=''; const cells=11, sz=74/cells;
    const seed=[0,2,3,5,8,10,1,4,7,9,2,6,3,8,5,0,10,4,7,1,6,9,3];
    for(let y=0;y<cells;y++)for(let x=0;x<cells;x++){if(((x*7+y*3+ (seed[(x+y)%seed.length]))%3)===0)r+=`<rect x="${x*sz}" y="${y*sz}" width="${sz}" height="${sz}" fill="#131217"/>`;}
    // finder squares
    const finder=(fx,fy)=>`<rect x="${fx}" y="${fy}" width="${sz*3}" height="${sz*3}" fill="#131217"/><rect x="${fx+sz}" y="${fy+sz}" width="${sz}" height="${sz}" fill="#fff"/>`;
    return r+finder(0,0)+finder(74-sz*3,0)+finder(0,74-sz*3);
  }
})();
