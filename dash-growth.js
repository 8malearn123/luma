/* LUMA dashboard — Growth & Money: earnings, analytics, loyalty, affiliate */
(function(){
  const S = window.LUMA_SCREENS = window.LUMA_SCREENS || {};

  /* reusable area/line chart */
  function areaChart(data, max, opts={}){
    const W=opts.w||640, H=opts.h||220, pad={t:18,r:12,b:30,l:36};
    const iw=W-pad.l-pad.r, ih=H-pad.t-pad.b, step=iw/(data.length-1);
    const pts=data.map((d,i)=>[pad.l+i*step, pad.t+ih-(d.v/max)*ih]);
    const line=pts.map((p,i)=>`${i?'L':'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    const area=`${line} L${pad.l+iw} ${pad.t+ih} L${pad.l} ${pad.t+ih} Z`;
    let grid='';
    for(let g=0;g<=4;g++){const y=pad.t+ih-(g/4)*ih;grid+=`<line x1="${pad.l}" y1="${y}" x2="${W-pad.r}" y2="${y}" stroke="#26242d" stroke-width="1" stroke-dasharray="2 4"/><text x="${pad.l-8}" y="${y+4}" fill="#58545f" font-size="10" font-family="IBM Plex Mono" text-anchor="end">${((g/4)*max).toFixed(0)}</text>`;}
    const dots=pts.map((p,i)=>`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${i===pts.length-1?4:2.5}" fill="${i===pts.length-1?'#dbbd81':'#9c8047'}"/>`).join('');
    const labels=data.map((d,i)=>`<text x="${(pad.l+i*step).toFixed(1)}" y="${H-12}" fill="#86818d" font-size="10" font-family="Cairo" text-anchor="middle">${d.m}</text>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="overflow:visible">
      <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9c8047" stop-opacity="0.34"/><stop offset="1" stop-color="#9c8047" stop-opacity="0"/></linearGradient></defs>
      ${grid}<path d="${area}" fill="url(#ag)"/><path d="${line}" fill="none" stroke="#ccab64" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>${dots}${labels}
    </svg>`;
  }

  /* ════════ EARNINGS ════════ */
  const EARN=[{m:'مارس',v:9.2},{m:'أبريل',v:11},{m:'مايو',v:10.4},{m:'يونيو',v:13.5},{m:'يوليو',v:15.2},{m:'أغسطس',v:16.8},{m:'سبتمبر',v:18.4}];
  const TX=[
    {n:'نوف العتيبي', s:'مكياج عروس كامل', d:'اليوم · 1:00 م', a:850, st:'مكتمل', stc:'green'},
    {n:'سارة الأحمدي', s:'مكياج سهرة', d:'اليوم · 10:00 ص', a:350, st:'مكتمل', stc:'green'},
    {n:'ريم الزهراني', s:'مكياج ناعم', d:'اليوم · 4:30 م', a:250, st:'بانتظار الدفع', stc:'gold'},
    {n:'دانة السالم', s:'جلسة تعليمية', d:'أمس', a:500, st:'مكتمل', stc:'green'},
    {n:'جواهر الشهري', s:'مكياج سهرة', d:'قبل يومين', a:350, st:'مكتمل', stc:'green'},
  ];
  S.earnings = { render(){ return `
<style>
  .ea-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:22px;}
  @media(max-width:1100px){.ea-grid{grid-template-columns:1fr 1fr;}}
  .ea-main{display:grid;grid-template-columns:1.55fr 1fr;gap:18px;align-items:start;}
  @media(max-width:1100px){.ea-main{grid-template-columns:1fr;}}
  .payout{background:linear-gradient(150deg,#201f26,#1a140e);border:1px solid var(--gold-deep);border-radius:16px;padding:22px;}
  .payout .lbl{font-size:13px;color:var(--gold-pale);}
  .payout .amt{font-family:'Bodoni Moda',serif;font-weight:500;font-size:46px;color:var(--white);direction:ltr;margin:6px 0 4px;}
  .payout .sub{font-size:12px;color:var(--muted);}
  .tx-row{display:flex;align-items:center;gap:14px;padding:13px 0;border-bottom:1px solid var(--line-soft);}
  .tx-row:last-child{border-bottom:none;}
  .tx-row .av{width:36px;height:36px;border-radius:50%;background:var(--surface3);border:0.5px solid var(--line);display:flex;align-items:center;justify-content:center;font-family:'Bodoni Moda',serif;color:var(--gold-light);font-size:15px;}
  .tx-row .info{flex:1;min-width:0;}
  .tx-row .info .n{font-size:14px;color:var(--white);font-weight:500;}
  .tx-row .info .s{font-size:12px;color:var(--muted);}
  .tx-row .amt{font-family:'Bodoni Moda',serif;font-size:19px;color:var(--gold-light);direction:ltr;}
</style>
<div class="ea-grid">
  <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('wallet',19)}</div><div class="delta up">▲ 12%</div></div><div class="val">18,400<span class="u">ر.س</span></div><div class="k">أرباح هذا الشهر</div></div>
  <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('chart',19)}</div><div class="delta up">▲ 34%</div></div><div class="val">94,600<span class="u">ر.س</span></div><div class="k">أرباح السنة</div></div>
  <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('calendar',19)}</div></div><div class="val">1,250<span class="u">ر.س</span></div><div class="k">مبالغ معلّقة</div></div>
  <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('star',19)}</div></div><div class="val">391<span class="u">ر.س</span></div><div class="k">متوسط قيمة الحجز</div></div>
</div>
<div class="ea-main">
  <div class="card">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px"><div><div style="font-family:Cairo;font-weight:600;font-size:17px;color:var(--white)">تدفّق الأرباح</div><div style="font-size:12.5px;color:var(--muted)">آخر ٧ أشهر · بالألف ريال</div></div><span class="badge gold">+34% سنوياً</span></div>
    ${areaChart(EARN,20)}
  </div>
  <div>
    <div class="payout">
      <div class="lbl">الرصيد القابل للسحب</div>
      <div class="amt gold-fill">17,150 ر.س</div>
      <div class="sub">يُحوّل إلى حسابك البنكي خلال ٢٤ ساعة</div>
      <button class="btn btn-gold" style="width:100%;justify-content:center;margin-top:16px">سحب الرصيد</button>
    </div>
    <div class="card" style="margin-top:16px">
      <div style="display:flex;justify-content:space-between;font-size:13px;padding:7px 0"><span style="color:var(--muted)">عمولة لوما (وَهَج)</span><span style="color:var(--white)">10%</span></div>
      <div style="display:flex;justify-content:space-between;font-size:13px;padding:7px 0;border-top:1px solid var(--line-soft)"><span style="color:var(--muted)">عمولة هذا الشهر</span><span style="color:var(--white)">1,840 ر.س</span></div>
      <div style="display:flex;justify-content:space-between;font-size:13px;padding:7px 0;border-top:1px solid var(--line-soft)"><span style="color:var(--muted)">ترقية لفَرِيد توفّر</span><span style="color:var(--gold-light)">2% عمولة</span></div>
    </div>
  </div>
</div>
<div class="card" style="margin-top:18px">
  <div class="sec-label">آخر المعاملات <span class="ln"></span><span class="more">تصدير كشف ←</span></div>
  ${TX.map(t=>`<div class="tx-row"><div class="av">${t.n.charAt(0)}</div><div class="info"><div class="n">${t.n}</div><div class="s">${t.s} · ${t.d}</div></div><span class="badge ${t.stc}">${t.st}</span><div class="amt">+${t.a} ر.س</div></div>`).join('')}
</div>`; }};

  /* ════════ ANALYTICS ════════ */
  const BOOK=[{m:'مارس',v:24},{m:'أبريل',v:29},{m:'مايو',v:27},{m:'يونيو',v:35},{m:'يوليو',v:40},{m:'أغسطس',v:44},{m:'سبتمبر',v:47}];
  const SRC=[['المتجر',46,'#ccab64'],['رابط مباشر',28,'#9c8047'],['انستقرام',18,'#846a38'],['الإحالات',8,'#5a4624']];
  const TOPSVC=[['مكياج عروس',38],['مكياج سهرة',30],['مكياج ناعم',18],['جلسة تعليمية',14]];
  const PEAK=['10ص','12م','2م','4م','6م','8م'].map((h,i)=>({h,v:[40,55,35,70,90,75][i]}));
  S.analytics = { render(){ return `
<style>
  .an-kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:22px;}
  @media(max-width:1100px){.an-kpi{grid-template-columns:1fr 1fr;}}
  .an-row{display:grid;grid-template-columns:1.5fr 1fr;gap:18px;align-items:start;}
  @media(max-width:1000px){.an-row{grid-template-columns:1fr;}}
  .an-row2{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:18px;align-items:start;}
  @media(max-width:1000px){.an-row2{grid-template-columns:1fr;}}
  .src-row{display:flex;align-items:center;gap:12px;padding:10px 0;}
  .src-row .nm{font-size:13.5px;color:var(--cream);width:90px;}
  .src-row .bar{flex:1;height:9px;background:var(--surface3);border-radius:10px;overflow:hidden;}
  .src-row .bar span{display:block;height:100%;border-radius:10px;}
  .src-row .pc{font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--gold-pale);width:38px;text-align:left;direction:ltr;}
  .peak{display:flex;align-items:flex-end;gap:10px;height:130px;padding-top:10px;}
  .peak .col{flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;height:100%;justify-content:flex-end;}
  .peak .col .b{width:100%;max-width:34px;border-radius:6px 6px 0 0;background:linear-gradient(180deg,#ccab64,#846a38);}
  .peak .col .h{font-size:11px;color:var(--muted);direction:ltr;}
  .top-svc{display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid var(--line-soft);}
  .top-svc:last-child{border-bottom:none;}
  .top-svc .nm{flex:1;font-size:13.5px;color:var(--white);}
  .top-svc .bar{width:120px;height:7px;background:var(--surface3);border-radius:10px;overflow:hidden;}
  .top-svc .bar span{display:block;height:100%;background:linear-gradient(90deg,#9c8047,#dbbd81);border-radius:10px;}
  .top-svc .pc{font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--gold-pale);width:34px;text-align:left;direction:ltr;}
</style>
<div class="an-kpi">
  <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('globe',19)}</div><div class="delta up">▲ 22%</div></div><div class="val">2,840</div><div class="k">زيارة لصفحتك</div></div>
  <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('chart',19)}</div><div class="delta up">▲ 3%</div></div><div class="val">16.5<span class="u">%</span></div><div class="k">معدّل التحويل للحجز</div></div>
  <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('star',19)}</div></div><div class="val">مكياج عروس</div><div class="k">الأكثر طلباً</div></div>
  <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('calendar',19)}</div></div><div class="val">6<span class="u">م</span></div><div class="k">وقت الذروة</div></div>
</div>
<div class="an-row">
  <div class="card"><div style="display:flex;justify-content:space-between;margin-bottom:12px"><div><div style="font-family:Cairo;font-weight:600;font-size:17px;color:var(--white)">الحجوزات عبر الزمن</div><div style="font-size:12.5px;color:var(--muted)">آخر ٧ أشهر</div></div><span class="badge gold">+96% نمو</span></div>${areaChart(BOOK,50)}</div>
  <div class="card"><div class="sec-label">مصادر الزيارات <span class="ln"></span></div>${SRC.map(s=>`<div class="src-row"><span class="nm">${s[0]}</span><div class="bar"><span style="width:${s[1]}%;background:${s[2]}"></span></div><span class="pc">${s[1]}%</span></div>`).join('')}</div>
</div>
<div class="an-row2">
  <div class="card"><div class="sec-label">أوقات الذروة <span class="ln"></span></div><div class="peak">${PEAK.map(p=>`<div class="col"><div class="b" style="height:${p.v}%"></div><span class="h">${p.h}</span></div>`).join('')}</div></div>
  <div class="card"><div class="sec-label">أكثر الخدمات طلباً <span class="ln"></span></div>${TOPSVC.map(s=>`<div class="top-svc"><span class="nm">${s[0]}</span><div class="bar"><span style="width:${s[1]/38*100}%"></span></div><span class="pc">${s[1]}%</span></div>`).join('')}</div>
</div>`; }};

  /* ════════ LOYALTY ════════ */
  const MEMBERS=[
    {n:'نوف العتيبي', pts:1240, tier:'ذهبية', visits:14},
    {n:'لطيفة المطيري', pts:980, tier:'ذهبية', visits:11},
    {n:'منيرة الدوسري', pts:640, tier:'فضية', visits:7},
    {n:'سارة الأحمدي', pts:520, tier:'فضية', visits:8},
    {n:'جواهر الشهري', pts:410, tier:'برونزية', visits:5},
  ];
  const REWARDS=[['خصم 10%','500 نقطة'],['جلسة مجانية','1500 نقطة'],['ترقية خدمة','800 نقطة']];
  S.loyalty = { render(){ return `
<style>
  .ly-hero{display:flex;align-items:center;justify-content:space-between;background:linear-gradient(135deg,#201f26,#1a140e);border:1px solid var(--gold-deep);border-radius:16px;padding:22px 26px;margin-bottom:22px;flex-wrap:wrap;gap:16px;}
  .ly-hero .l{display:flex;align-items:center;gap:16px;}
  .ly-hero .ic{width:52px;height:52px;border-radius:14px;background:rgba(156,124,58,0.2);border:0.5px solid var(--gold-deep);display:flex;align-items:center;justify-content:center;color:var(--gold-light);}
  .ly-hero .t1{font-family:Cairo;font-weight:700;font-size:19px;color:var(--white);}
  .ly-hero .t2{font-size:13px;color:var(--gold-pale);margin-top:2px;}
  .ly-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:22px;}
  @media(max-width:900px){.ly-grid{grid-template-columns:1fr;}}
  .ly-main{display:grid;grid-template-columns:1.4fr 1fr;gap:18px;align-items:start;}
  @media(max-width:1000px){.ly-main{grid-template-columns:1fr;}}
  .mem{display:flex;align-items:center;gap:13px;padding:13px 0;border-bottom:1px solid var(--line-soft);}
  .mem:last-child{border-bottom:none;}
  .mem .rk{font-family:'Bodoni Moda',serif;font-size:18px;color:var(--gold-deep);width:22px;direction:ltr;}
  .mem .av{width:36px;height:36px;border-radius:50%;background:var(--surface3);border:0.5px solid var(--line);display:flex;align-items:center;justify-content:center;font-family:'Bodoni Moda',serif;color:var(--gold-light);font-size:15px;}
  .mem .nm{flex:1;font-size:14px;color:var(--white);font-weight:500;}
  .mem .pts{font-family:'IBM Plex Mono',monospace;font-size:13px;color:var(--gold-light);direction:ltr;}
  .rwd{display:flex;align-items:center;justify-content:space-between;background:var(--surface2);border:1px solid var(--line);border-radius:11px;padding:14px 16px;margin-bottom:10px;}
  .rwd .nm{font-size:14px;color:var(--white);font-weight:500;}
  .rwd .pt{font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--gold-pale);direction:ltr;}
</style>
<div class="ly-hero">
  <div class="l"><div class="ic">${icon('loyalty',24)}</div><div><div class="t1">برنامج الولاء مُفعّل</div><div class="t2">عميلاتك يجمعن نقاطاً مع كل حجز ويستبدلنها بمكافآت</div></div></div>
  <button class="toggle on" style="width:52px;height:30px"><span class="k"></span></button>
</div>
<div class="ly-grid">
  <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('users',19)}</div><div class="delta up">▲ 18</div></div><div class="val">86</div><div class="k">عضوة في البرنامج</div></div>
  <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('loyalty',19)}</div></div><div class="val">42,300</div><div class="k">نقطة ممنوحة</div></div>
  <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('star',19)}</div></div><div class="val">31</div><div class="k">عملية استبدال</div></div>
</div>
<div class="ly-main">
  <div class="card"><div class="sec-label">أعلى العضوات <span class="ln"></span><span class="more">عرض الكل ←</span></div>
    ${MEMBERS.map((m,i)=>`<div class="mem"><span class="rk">${i+1}</span><span class="av">${m.n.charAt(0)}</span><span class="nm">${m.n} <span class="badge soft" style="margin-right:6px">${m.tier}</span></span><span class="pts">${m.pts.toLocaleString('en')} نقطة</span></div>`).join('')}
  </div>
  <div>
    <div class="card" style="margin-bottom:16px"><div class="sec-label">إعداد النقاط <span class="ln"></span></div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;font-size:13.5px"><span style="color:var(--muted)">نقاط لكل ريال</span><span style="color:var(--white);font-weight:600">1 نقطة</span></div>
      <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-top:1px solid var(--line-soft);font-size:13.5px"><span style="color:var(--muted)">نقاط ترحيبية</span><span style="color:var(--white);font-weight:600">100 نقطة</span></div>
    </div>
    <div class="card"><div class="sec-label">المكافآت <span class="ln"></span><span class="more">+ مكافأة</span></div>
      ${REWARDS.map(r=>`<div class="rwd"><span class="nm">${r[0]}</span><span class="pt">${r[1]}</span></div>`).join('')}
    </div>
  </div>
</div>`; }};

  /* ════════ AFFILIATE ════════ */
  const REFS=[
    {n:'دانة السالم', date:'قبل ٣ أيام', earned:40, st:'مدفوعة', stc:'green'},
    {n:'عبير القحطاني', date:'قبل أسبوع', earned:40, st:'مدفوعة', stc:'green'},
    {n:'أسماء الحربي', date:'قبل أسبوعين', earned:40, st:'معلّقة', stc:'gold'},
  ];
  S.affiliate = { render(){ return `
<style>
  .af-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:22px;}
  @media(max-width:900px){.af-grid{grid-template-columns:1fr;}}
  .af-main{display:grid;grid-template-columns:1fr 1.2fr;gap:18px;align-items:start;}
  @media(max-width:1000px){.af-main{grid-template-columns:1fr;}}
  .ref-row{display:flex;align-items:center;gap:13px;padding:13px 0;border-bottom:1px solid var(--line-soft);}
  .ref-row:last-child{border-bottom:none;}
  .ref-row .av{width:36px;height:36px;border-radius:50%;background:var(--surface3);border:0.5px solid var(--line);display:flex;align-items:center;justify-content:center;font-family:'Bodoni Moda',serif;color:var(--gold-light);font-size:15px;}
  .ref-row .info{flex:1;} .ref-row .info .n{font-size:14px;color:var(--white);font-weight:500;} .ref-row .info .d{font-size:12px;color:var(--muted);}
  .ref-row .am{font-family:'Bodoni Moda',serif;font-size:18px;color:var(--gold-light);direction:ltr;}
</style>
<div class="card" style="margin-bottom:22px;background:linear-gradient(135deg,#201f26,#1a140e);border-color:var(--gold-deep)">
  <div style="display:flex;align-items:center;gap:14px;margin-bottom:16px"><div style="width:48px;height:48px;border-radius:13px;background:rgba(156,124,58,0.2);border:0.5px solid var(--gold-deep);display:flex;align-items:center;justify-content:center;color:var(--gold-light)">${icon('affiliate',22)}</div><div><div style="font-family:Cairo;font-weight:700;font-size:18px;color:var(--white)">ادعي خبيرات أخريات، واكسبي</div><div style="font-size:13px;color:var(--gold-pale);margin-top:2px">احصلي على ١٠٪ من اشتراك الشهر الأول لكل خبيرة تنضم برابطك</div></div></div>
  <div style="display:flex;align-items:center;gap:12px;background:var(--bg);border:1px solid var(--line);border-radius:11px;padding:6px 6px 6px 16px">
    <span id="refLink" style="flex:1;font-family:'IBM Plex Mono',monospace;font-size:14px;color:var(--gold-light);direction:ltr;text-align:left">luma.sa/join?ref=rahaf</span>
    <button class="btn btn-ghost" style="padding:9px 16px" onclick="LUX_copyRef&&LUX_copyRef()">نسخ الرابط</button>
    <button class="btn btn-gold" style="padding:9px 16px" onclick="LUX_shareRef&&LUX_shareRef()">مشاركة</button>
  </div>
</div>
<div class="af-grid">
  <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('users',19)}</div><div class="delta up">▲ 2</div></div><div class="val">7</div><div class="k">خبيرات انضممن برابطك</div></div>
  <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('wallet',19)}</div></div><div class="val">280<span class="u">ر.س</span></div><div class="k">أرباح الإحالات</div></div>
  <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('chart',19)}</div></div><div class="val">142</div><div class="k">نقرة على رابطك</div></div>
</div>
<div class="af-main">
  <div class="card"><div class="sec-label">كيف يعمل؟ <span class="ln"></span></div>
    ${[['شاركي رابطك','مع خبيرات تثقين بهنّ'],['تنضم خبيرة','وتشترك في إحدى الباقات'],['تكسبين عمولتك','١٠٪ من اشتراكها الأول']].map((s,i)=>`<div style="display:flex;gap:14px;align-items:flex-start;padding:13px 0;border-bottom:${i<2?'1px solid var(--line-soft)':'none'}"><span style="font-family:'Bodoni Moda',serif;font-size:24px;color:var(--gold-deep);direction:ltr;line-height:1">${i+1}</span><div><div style="font-size:14.5px;color:var(--white);font-weight:500">${s[0]}</div><div style="font-size:12.5px;color:var(--muted);margin-top:2px">${s[1]}</div></div></div>`).join('')}
  </div>
  <div class="card"><div class="sec-label">إحالاتك <span class="ln"></span></div>
    ${REFS.map(r=>`<div class="ref-row"><div class="av">${r.n.charAt(0)}</div><div class="info"><div class="n">${r.n}</div><div class="d">${r.date}</div></div><span class="badge ${r.stc}">${r.st}</span><div class="am">+${r.earned} ر.س</div></div>`).join('')}
  </div>
</div>`; }};

  /* ── referral link: copy + share ── */
  function refURL(){const el=document.getElementById('refLink');return 'https://'+((el&&el.textContent.trim())||'luma.sa/join?ref=rahaf');}
  function copyText(txt,okMsg){
    const done=()=>{window.LUX?window.LUX.toast(okMsg,'ok'):0;};
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(txt).then(done).catch(()=>fallback());}
    else fallback();
    function fallback(){try{const ta=document.createElement('textarea');ta.value=txt;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();done();}catch(e){window.LUX&&window.LUX.toast('تعذّر النسخ — انسخي الرابط يدويًا','err');}}
  }
  window.LUX_copyRef=function(){copyText(refURL(),'تم نسخ رابط الدعوة ✓');};
  window.LUX_shareRef=function(){
    const url=refURL();
    const data={title:'انضمي إلى LUMA',text:'احصلي على خصم ٢٠٪ على اشتراكك الأول عند الانضمام عبر رابطي إلى منصة لوما ✦',url};
    if(navigator.share){navigator.share(data).then(()=>{window.LUX&&window.LUX.toast('تمت المشاركة ✓','ok');}).catch(()=>{});}
    else if(window.LUX){
      window.LUX.modal('مشاركة رابط الدعوة',`<div class="lux-lead">شاركي رابطك مع خبيرات أخريات — تحصلين على مكافأة عند انضمام كل واحدة.</div>
        <div class="lux-row"><span class="k">الرابط</span><span class="v" style="direction:ltr;font-family:'IBM Plex Mono',monospace;color:var(--gold-light,#ccab64)">${url}</span></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px">
          <a class="lux-btn lux-ghost" style="text-align:center;text-decoration:none" target="_blank" href="https://wa.me/?text=${encodeURIComponent(data.text+' '+url)}">واتساب</a>
          <a class="lux-btn lux-ghost" style="text-align:center;text-decoration:none" target="_blank" href="https://twitter.com/intent/tweet?text=${encodeURIComponent(data.text)}&url=${encodeURIComponent(url)}">X / تويتر</a>
          <a class="lux-btn lux-ghost" style="text-align:center;text-decoration:none" target="_blank" href="https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(data.text)}">تيليجرام</a>
          <button class="lux-btn lux-gold" data-cp>نسخ الرابط</button>
        </div>`,
        {onMount(ov,close){ov.querySelector('[data-cp]').onclick=()=>{copyText(url,'تم نسخ الرابط ✓');};}});
    } else { copyText(url,'تم نسخ رابط الدعوة ✓'); }
  };
})();
