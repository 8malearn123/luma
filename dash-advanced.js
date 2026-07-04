/* LUMA dashboard — Advanced tools (chip-tabbed) + Sync/Integrations */
(function(){
  const S = window.LUMA_SCREENS = window.LUMA_SCREENS || {};
  const avc = n=>`<span class="avx">${n.charAt(0)}</span>`;

  const TOOLCHIPS = [
    ['waitlist','قائمة الانتظار','calendar'],
    ['memberships','الاشتراكات','loyalty'],
    ['group','حجوزات جماعية','users'],
    ['staff','الطاقم','user'],
    ['inventory','المخزون','services'],
    ['expenses','المصاريف والربح','wallet'],
    ['contracts','العقود الرقمية','shield'],
    ['giftcards','بطاقات الإهداء','star'],
    ['policy','سياسة الإلغاء','tools'],
  ];

  const TOOLS = {
    waitlist(){
      const W=[
        {n:'هيا الشمري',s:'مكياج عروس كامل',d:'يفضّل ٢٨ يونيو',st:'مكان متاح',stc:'gold'},
        {n:'وعد القرني',s:'مكياج سهرة',d:'أي مساء هذا الأسبوع',st:'بالانتظار',stc:'soft'},
        {n:'شهد الغامدي',s:'مكياج ناعم',d:'صباح الجمعة',st:'بالانتظار',stc:'soft'},
        {n:'رنا العمري',s:'جلسة تعليمية',d:'مرن',st:'بالانتظار',stc:'soft'},
      ];
      return panel('قائمة الانتظار','عميلات ينتظرن توفّر موعد — أبلغيهنّ بنقرة عند توفّر مكان.',
        `<button class="btn btn-gold">+ إضافة للقائمة</button>`,
        W.map(w=>`<div class="trow"><div class="av">${avc(w.n).replace('avx','avi')}</div><div class="ti"><div class="n">${w.n}</div><div class="s">${w.s} · ${w.d}</div></div><span class="badge ${w.stc}">${w.st}</span><button class="btn ${w.stc==='gold'?'btn-gold':'btn-ghost'}" style="padding:8px 16px">${w.stc==='gold'?'عرض موعد':'إشعار'}</button></div>`).join(''));
    },
    memberships(){
      const P=[
        {n:'باقة الجمال الشهرية',p:'600',per:'شهرياً',subs:18,benefits:['جلستان شهرياً','خصم ١٥٪ على الإضافات','أولوية الحجز']},
        {n:'باقة العناية الفصلية',p:'1,500',per:'كل ٣ أشهر',subs:9,benefits:['٦ جلسات','خصم ٢٠٪','هدية فصلية']},
      ];
      return panel('الاشتراكات','باقات عضوية متجددة تضمن دخلاً ثابتاً وعميلات أوفياء.',
        `<button class="btn btn-gold">+ باقة اشتراك</button>`,
        `<div class="cards2">${P.map(p=>`<div class="bigcard"><div class="bh"><div><div class="bn">${p.n}</div><div class="bsub">${p.subs} مشتركة نشطة</div></div><button class="toggle on"><span class="k"></span></button></div><div class="bprice"><span class="num">${p.p}</span> <span class="u">ر.س / ${p.per}</span></div><ul class="blist">${p.benefits.map(b=>`<li><span class="d">◆</span>${b}</li>`).join('')}</ul></div>`).join('')}</div>
         <div class="mini-stat"><span>إيراد الاشتراكات الشهري المتكرر</span><b class="gold-fill">24,300 ر.س</b></div>`);
    },
    group(){
      const G=[
        {t:'حفل زفاف — آل عبدالله',d:'٣ يوليو · ٦:٠٠ م',ppl:8,total:'5,400',st:'مؤكد',stc:'green'},
        {t:'تخرّج جماعي — دفعة طب',d:'١٢ يوليو · ٤:٠٠ م',ppl:12,total:'4,200',st:'بانتظار العربون',stc:'gold'},
        {t:'مناسبة عائلية',d:'٢٠ يوليو · ٧:٠٠ م',ppl:5,total:'2,000',st:'مؤكد',stc:'green'},
      ];
      return panel('حجوزات جماعية','أعراس ومناسبات بعدد كبير — إدارة الفريق والتسعير في مكان واحد.',
        `<button class="btn btn-gold">+ حجز جماعي</button>`,
        G.map(g=>`<div class="trow"><div class="gi">${icon('users',20)}</div><div class="ti"><div class="n">${g.t}</div><div class="s">${g.d} · ${g.ppl} أشخاص</div></div><div class="amt">${g.total} ر.س</div><span class="badge ${g.stc}">${g.st}</span></div>`).join(''));
    },
    staff(){
      const T=[
        {n:'رهف العتيبي',role:'المالكة · خبيرة رئيسية',today:4,c:'gold'},
        {n:'أمل السبيعي',role:'مساعدة خبيرة',today:3,c:'soft'},
        {n:'نورة الحارثي',role:'مساعدة + استقبال',today:2,c:'soft'},
      ];
      return panel('الطاقم','أضيفي مساعداتكِ، وزّعي المواعيد، وتابعي أداء الفريق.',
        `<button class="btn btn-gold">+ دعوة عضوة</button>`,
        `<div class="cards3">${T.map(t=>`<div class="staffc"><div class="av big">${avc(t.n).replace('avx','avi')}</div><div class="sn">${t.n}</div><div class="sr">${t.role}</div><div class="sb"><span>مواعيد اليوم</span><b>${t.today}</b></div></div>`).join('')}</div>`);
    },
    inventory(){
      const I=[
        {n:'كريم أساس — درجات متعددة',q:24,min:10,st:'متوفر',stc:'green'},
        {n:'رموش صناعية',q:6,min:10,st:'منخفض',stc:'gold'},
        {n:'مثبّت مكياج (سبراي)',q:3,min:8,st:'يحتاج طلب',stc:'gold'},
        {n:'فُرَش مكياج — أطقم',q:15,min:5,st:'متوفر',stc:'green'},
      ];
      return panel('المخزون','تابعي مستلزماتكِ وتنبيهات النفاد قبل أن تفاجئكِ.',
        `<button class="btn btn-gold">+ صنف جديد</button>`,
        `<div class="thead4"><span>الصنف</span><span>المتوفر</span><span>الحد الأدنى</span><span>الحالة</span></div>`+
        I.map(i=>`<div class="trow4"><span class="n">${i.n}</span><span class="num2">${i.q}</span><span class="num2 mut">${i.min}</span><span class="badge ${i.stc}">${i.st}</span></div>`).join(''));
    },
    expenses(){
      return panel('المصاريف والربح','صورة واضحة لإيراداتكِ ومصاريفكِ وصافي ربحكِ.',
        `<button class="btn btn-gold">+ تسجيل مصروف</button>`,
        `<div class="pl">
          <div class="plc"><div class="pll">الإيرادات</div><div class="plv gold-fill">18,400</div><div class="plu">ر.س هذا الشهر</div></div>
          <div class="plop">−</div>
          <div class="plc"><div class="pll">المصاريف</div><div class="plv" style="color:var(--red)">4,150</div><div class="plu">ر.س هذا الشهر</div></div>
          <div class="plop">=</div>
          <div class="plc hi"><div class="pll">صافي الربح</div><div class="plv gold-fill">14,250</div><div class="plu">ر.س</div></div>
        </div>
        <div class="sec-label" style="margin-top:24px">آخر المصاريف <span class="ln"></span></div>
        ${[['مستلزمات مكياج','1,800','١ يونيو'],['إيجار الاستوديو','1,500','١ يونيو'],['تسويق وإعلانات','600','٥ يونيو'],['عمولة لوما','1,840','مستمر']].map((e,i)=>`<div class="trow"><div class="gi">${icon('wallet',18)}</div><div class="ti"><div class="n">${e[0]}</div><div class="s">${e[2]}</div></div><div class="amt" style="color:var(--red)">−${e[1]} ر.س</div></div>`).join('')}`);
    },
    contracts(){
      const C=[
        {n:'عقد مكياج عروس',used:42,st:'مفعّل',stc:'green'},
        {n:'عقد جلسة تعليمية',used:11,st:'مفعّل',stc:'green'},
        {n:'اتفاقية حجز جماعي',used:5,st:'مسودة',stc:'soft'},
      ];
      return panel('العقود الرقمية','عقود موثّقة بتوقيع رقمي تحمي حقوقكِ مع كل حجز.',
        `<button class="btn btn-gold">+ قالب عقد</button>`,
        C.map(c=>`<div class="trow"><div class="gi">${icon('shield',18)}</div><div class="ti"><div class="n">${c.n}</div><div class="s">استُخدم ${c.used} مرة</div></div><span class="badge ${c.stc}">${c.st}</span><button class="btn btn-ghost" style="padding:8px 16px">تحرير</button></div>`).join(''));
    },
    giftcards(){
      return panel('بطاقات الإهداء','اسمحي لعميلاتكِ بإهداء جلساتكِ لمن يحببن.',
        `<button class="btn btn-gold">+ تصميم بطاقة</button>`,
        `<div class="cards3">${[['#201f26','ذهبية كلاسيك'],['#31242a','وردية ناعمة'],['#1f2c25','زمردية']].map(g=>`<div class="giftc" style="background:linear-gradient(135deg,${g[0]},#0c0b0e)"><div class="gtop"><span>LUMA</span><span>◆</span></div><div class="gval">بطاقة إهداء</div><div class="gname">${g[1]}</div></div>`).join('')}</div>
        <div class="mini-stat" style="margin-top:18px"><span>بطاقات مُصدرة هذا الشهر · ١٤ بطاقة</span><b class="gold-fill">5,600 ر.س</b></div>`);
    },
    policy(){
      const R=[
        {t:'إلغاء قبل ٢٤ ساعة',d:'استرداد كامل للمبلغ',on:true},
        {t:'إلغاء خلال ٢٤ ساعة',d:'خصم ٥٠٪ من قيمة الحجز',on:true},
        {t:'عدم الحضور (No-show)',d:'خصم كامل بدون استرداد',on:true},
        {t:'طلب عربون مسبق',d:'٣٠٪ من قيمة الخدمة لتأكيد الحجز',on:true},
      ];
      return panel('سياسة الإلغاء','قواعد واضحة تحمي وقتكِ وتضمن جدية العميلات.','',
        R.map(r=>`<div class="trow"><div class="ti"><div class="n">${r.t}</div><div class="s">${r.d}</div></div><button class="toggle ${r.on?'on':'off'}" onclick="this.classList.toggle('on');this.classList.toggle('off')"><span class="k"></span></button></div>`).join(''));
    },
  };

  function panel(title,desc,action,body){
    return `<div class="tool-head"><div><div class="tt">${title}</div><div class="td">${desc}</div></div>${action||''}</div><div class="tool-body">${body}</div>`;
  }

  S.advanced = {
    render(){
      return `
<style>
  .adv-hero{position:relative;overflow:hidden;border:1px solid var(--line);border-radius:18px;background:radial-gradient(120% 100% at 85% 0%,rgba(156,124,58,0.16),var(--surface) 60%);padding:34px 32px;margin-bottom:22px;}
  .adv-hero .k{font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:0.18em;color:var(--gold);direction:ltr;}
  .adv-hero h2{font-family:'Cairo',sans-serif;font-weight:700;font-size:30px;color:var(--white);margin-top:8px;}
  .adv-hero .line{width:64px;height:2px;background:linear-gradient(90deg,var(--gold-light),transparent);margin-top:14px;border-radius:2px;}
  .adv-chips{display:flex;flex-wrap:wrap;gap:9px;margin-bottom:24px;}
  .adv-chip{display:flex;align-items:center;gap:9px;font-family:'Cairo',sans-serif;font-size:13.5px;color:var(--cream);background:var(--surface);border:1px solid var(--line);border-radius:30px;padding:10px 18px;cursor:pointer;transition:all .22s;}
  .adv-chip .i{color:var(--muted);display:flex;}
  .adv-chip:hover{border-color:var(--gold-deep);color:var(--gold-light);}
  .adv-chip:hover .i{color:var(--gold-pale);}
  .adv-chip.on{background:linear-gradient(120deg,rgba(156,124,58,0.22),rgba(156,124,58,0.06));border-color:var(--gold-deep);color:var(--gold-light);font-weight:600;}
  .adv-chip.on .i{color:var(--gold-light);}
  .tool-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:20px;flex-wrap:wrap;}
  .tool-head .tt{font-family:'Cairo',sans-serif;font-weight:600;font-size:21px;color:var(--white);}
  .tool-head .td{font-size:13.5px;color:var(--gold-pale);margin-top:4px;max-width:54ch;}
  .trow,.trow4{display:flex;align-items:center;gap:14px;background:var(--surface);border:1px solid var(--line);border-radius:13px;padding:14px 18px;margin-bottom:10px;}
  .trow .ti{flex:1;min-width:0;} .trow .ti .n{font-size:14.5px;color:var(--white);font-weight:500;} .trow .ti .s{font-size:12.5px;color:var(--muted);margin-top:1px;}
  .avi,.avx{width:38px;height:38px;border-radius:50%;background:var(--surface3);border:0.5px solid var(--gold-deep);display:flex;align-items:center;justify-content:center;font-family:'Bodoni Moda',serif;font-size:16px;color:var(--gold-light);flex-shrink:0;}
  .trow .gi{width:38px;height:38px;border-radius:10px;background:var(--surface3);border:0.5px solid var(--line);display:flex;align-items:center;justify-content:center;color:var(--gold-light);flex-shrink:0;}
  .trow .amt{font-family:'Bodoni Moda',serif;font-size:19px;color:var(--gold-light);direction:ltr;}
  .cards2{display:grid;grid-template-columns:1fr 1fr;gap:16px;} @media(max-width:820px){.cards2{grid-template-columns:1fr;}}
  .bigcard{background:linear-gradient(160deg,var(--surface2),var(--surface));border:1px solid var(--line);border-radius:16px;padding:22px;}
  .bigcard .bh{display:flex;align-items:flex-start;justify-content:space-between;}
  .bigcard .bn{font-family:'Cairo',sans-serif;font-weight:600;font-size:17px;color:var(--white);}
  .bigcard .bsub{font-size:12.5px;color:var(--gold-pale);margin-top:2px;}
  .bigcard .bprice{margin:14px 0;font-family:'Bodoni Moda',serif;color:var(--gold-light);direction:ltr;} .bigcard .bprice .num{font-size:34px;} .bigcard .bprice .u{font-family:Cairo;font-size:12px;color:var(--muted);}
  .bigcard .blist{list-style:none;display:flex;flex-direction:column;gap:9px;padding-top:14px;border-top:1px solid var(--line-soft);}
  .bigcard .blist li{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--cream);} .bigcard .blist .d{color:var(--gold);font-size:8px;}
  .mini-stat{display:flex;align-items:center;justify-content:space-between;background:var(--surface);border:1px solid var(--gold-deep);border-radius:13px;padding:16px 20px;margin-top:14px;}
  .mini-stat span{font-size:13.5px;color:var(--gold-pale);} .mini-stat b{font-family:'Bodoni Moda',serif;font-size:24px;direction:ltr;}
  .cards3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;} @media(max-width:820px){.cards3{grid-template-columns:1fr;}}
  .staffc{background:var(--surface);border:1px solid var(--line);border-radius:15px;padding:22px;text-align:center;}
  .staffc .av.big{width:60px;height:60px;font-size:26px;margin:0 auto;}
  .staffc .sn{font-size:15px;color:var(--white);font-weight:600;margin-top:12px;} .staffc .sr{font-size:12.5px;color:var(--gold-pale);margin-top:2px;}
  .staffc .sb{display:flex;align-items:center;justify-content:space-between;margin-top:16px;padding-top:14px;border-top:1px solid var(--line-soft);font-size:13px;color:var(--muted);} .staffc .sb b{color:var(--gold-light);font-family:'Bodoni Moda',serif;font-size:20px;}
  .thead4{display:grid;grid-template-columns:2.4fr 1fr 1fr 1.2fr;gap:14px;padding:0 18px 10px;font-size:11.5px;color:var(--gold);font-weight:600;}
  .trow4{display:grid;grid-template-columns:2.4fr 1fr 1fr 1.2fr;gap:14px;align-items:center;} .trow4 .n{font-size:14px;color:var(--white);} .num2{font-family:'Bodoni Moda',serif;font-size:20px;color:var(--white);direction:ltr;} .num2.mut{color:var(--muted);}
  .pl{display:grid;grid-template-columns:1fr auto 1fr auto 1fr;gap:14px;align-items:center;} @media(max-width:820px){.pl{grid-template-columns:1fr;} .pl .plop{display:none;}}
  .plc{background:var(--surface);border:1px solid var(--line);border-radius:15px;padding:22px;text-align:center;} .plc.hi{border-color:var(--gold-deep);}
  .plc .pll{font-size:13px;color:var(--gold-pale);} .plc .plv{font-family:'Bodoni Moda',serif;font-size:40px;direction:ltr;margin:6px 0;} .plc .plu{font-size:11px;color:var(--muted);}
  .plop{font-family:'Bodoni Moda',serif;font-size:26px;color:var(--gold-deep);text-align:center;}
  .giftc{border-radius:14px;padding:22px;border:1px solid var(--gold-deep);aspect-ratio:1.6;display:flex;flex-direction:column;justify-content:space-between;cursor:pointer;}
  .giftc .gtop{display:flex;justify-content:space-between;font-family:'Bodoni Moda',serif;letter-spacing:0.2em;color:var(--gold-light);direction:ltr;font-size:14px;}
  .giftc .gval{font-family:'Cairo',sans-serif;font-weight:600;font-size:17px;color:var(--white);} .giftc .gname{font-size:12px;color:var(--gold-pale);}
  .toggle{width:46px;height:27px;border-radius:20px;border:none;cursor:pointer;position:relative;transition:background .25s;flex-shrink:0;}
  .toggle.on{background:linear-gradient(120deg,#dbbd81,#9c8047);} .toggle.off{background:var(--surface3);}
  .toggle .k{position:absolute;top:3px;width:21px;height:21px;border-radius:50%;background:#fff;transition:right .25s,left .25s;}
  .toggle.on .k{left:3px;} .toggle.off .k{right:3px;}
</style>
<div class="adv-hero"><div class="k">PROFESSIONAL TOOLS · أدوات احترافية</div><h2>أدّيري عملكِ بالكامل</h2><div class="line"></div></div>
<div class="adv-chips">${TOOLCHIPS.map((t,i)=>`<button class="adv-chip ${i===0?'on':''}" onclick="__adv.go('${t[0]}',this)"><span class="i">${icon(t[2],16)}</span>${t[1]}</button>`).join('')}</div>
<div id="adv-body"></div>`;
    },
    init(){
      window.__adv = { go(t,el){ if(el){document.querySelectorAll('.adv-chip').forEach(c=>c.classList.remove('on'));el.classList.add('on');} document.getElementById('adv-body').innerHTML = (TOOLS[t]||(()=> ''))(); } };
      window.__adv.go('waitlist', document.querySelector('.adv-chip'));
    }
  };

  /* ════════ SYNC / INTEGRATIONS ════════ */
  const INTEG=[
    {ic:'calendar',n:'Google Calendar',d:'مزامنة المواعيد مع تقويمك الشخصي',on:true,c:'مزامن'},
    {ic:'affiliate',n:'واتساب للأعمال',d:'تأكيدات وتذكيرات تلقائية للعميلات',on:true,c:'مفعّل'},
    {ic:'globe',n:'انستقرام',d:'ربط حسابك وعرض أعمالك',on:true,c:'مربوط'},
    {ic:'wallet',n:'مدى · Moyasar',d:'استقبال المدفوعات والدفع المسبق',on:true,c:'نشط'},
    {ic:'chart',n:'تقارير ضريبية',d:'تصدير فواتير متوافقة مع هيئة الزكاة',on:false,c:''},
  ];
  const COMPLY=[
    {t:'توثيق الهوية (KYC)',d:'تم التحقق من هويتك',ok:true},
    {t:'السجل التجاري',d:'مفعّل ومجدّد',ok:true},
    {t:'العقود الرقمية',d:'مفعّلة مع توقيع موثّق',ok:true},
    {t:'سياسة الخصوصية (PDPL)',d:'متوافقة مع نظام حماية البيانات',ok:true},
  ];
  S.sync = {
    render(){
      return `
<style>
  .sy-grid{display:grid;grid-template-columns:1.3fr 1fr;gap:18px;align-items:start;} @media(max-width:1000px){.sy-grid{grid-template-columns:1fr;}}
  .intg{display:flex;align-items:center;gap:15px;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px 18px;margin-bottom:11px;}
  .intg .ic{width:46px;height:46px;border-radius:12px;background:var(--surface3);border:0.5px solid var(--line);display:flex;align-items:center;justify-content:center;color:var(--gold-light);flex-shrink:0;}
  .intg .ti{flex:1;} .intg .ti .n{font-size:15px;color:var(--white);font-weight:600;} .intg .ti .d{font-size:12.5px;color:var(--muted);margin-top:2px;}
  .comply{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:22px;}
  .crow{display:flex;align-items:flex-start;gap:13px;padding:14px 0;border-bottom:1px solid var(--line-soft);} .crow:last-child{border-bottom:none;}
  .crow .ck{width:24px;height:24px;border-radius:50%;background:var(--green-bg);border:0.5px solid var(--green);color:var(--green);display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0;}
  .crow .n{font-size:14px;color:var(--white);font-weight:500;} .crow .d{font-size:12.5px;color:var(--muted);margin-top:1px;}
  .toggle{width:46px;height:27px;border-radius:20px;border:none;cursor:pointer;position:relative;transition:background .25s;flex-shrink:0;}
  .toggle.on{background:linear-gradient(120deg,#dbbd81,#9c8047);} .toggle.off{background:var(--surface3);} .toggle .k{position:absolute;top:3px;width:21px;height:21px;border-radius:50%;background:#fff;transition:.25s;} .toggle.on .k{left:3px;} .toggle.off .k{right:3px;}
</style>
<div class="sy-grid">
  <div>
    <div class="sec-label">التكاملات والمزامنة <span class="ln"></span></div>
    ${INTEG.map(i=>`<div class="intg"><div class="ic">${icon(i.ic,21)}</div><div class="ti"><div class="n">${i.n}</div><div class="d">${i.d}</div></div>${i.on?`<span class="badge green">${i.c} ✓</span>`:'<button class="btn btn-ghost" style="padding:9px 18px">ربط</button>'}<button class="toggle ${i.on?'on':'off'}" onclick="this.classList.toggle('on');this.classList.toggle('off')"><span class="k"></span></button></div>`).join('')}
  </div>
  <div>
    <div class="sec-label">الاعتماد والجاهزية <span class="ln"></span></div>
    <div class="comply">
      <div style="display:flex;align-items:center;gap:12px;padding-bottom:16px;border-bottom:1px solid var(--line-soft);margin-bottom:6px"><div style="width:44px;height:44px;border-radius:12px;background:var(--green-bg);border:0.5px solid var(--green);display:flex;align-items:center;justify-content:center;color:var(--green)">${icon('shield',22)}</div><div><div style="font-size:15px;color:var(--white);font-weight:600">حسابك موثّق ومعتمد</div><div style="font-size:12.5px;color:var(--gold-pale)">جاهزة للعمل باحترافية كاملة</div></div></div>
      ${COMPLY.map(c=>`<div class="crow"><span class="ck">✓</span><div><div class="n">${c.t}</div><div class="d">${c.d}</div></div></div>`).join('')}
    </div>
    <div class="card" style="margin-top:16px"><div class="sec-label">تصدير البيانات <span class="ln"></span></div><div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn btn-ghost">كشف الحجوزات</button><button class="btn btn-ghost">التقرير المالي</button><button class="btn btn-ghost">قائمة العملاء</button></div></div>
  </div>
</div>`;
    }
  };
})();
