/* LUMA dashboard — Daily Work screens: bookings, clients, reviews */
(function(){
  const S = window.LUMA_SCREENS = window.LUMA_SCREENS || {};
  const stars = (r,sz=13)=>{let s='';for(let i=1;i<=5;i++)s+=`<span style="color:${i<=r?'#ccab64':'#26242d'};font-size:${sz}px">★</span>`;return s;};
  const av = (n)=>`<span class="av-c">${n.charAt(0)}</span>`;

  /* ════════ BOOKINGS ════════ */
  const BK = {
    today:[
      {t:'10:00 ص', n:'سارة الأحمدي', s:'مكياج سهرة', dur:'60 د', p:350, st:'مؤكد', stc:'green'},
      {t:'1:00 م', n:'نوف العتيبي', s:'مكياج عروس كامل', dur:'120 د', p:850, st:'مؤكد', stc:'green'},
      {t:'4:30 م', n:'ريم الزهراني', s:'مكياج ناعم', dur:'45 د', p:250, st:'بانتظار الدفع', stc:'gold'},
      {t:'7:00 م', n:'دانة السالم', s:'جلسة تعليمية', dur:'90 د', p:500, st:'مؤكد', stc:'green'},
    ],
    tomorrow:[
      {t:'11:00 ص', n:'جواهر الشهري', s:'مكياج سهرة', dur:'60 د', p:350, st:'مؤكد', stc:'green'},
      {t:'2:00 م', n:'عبير القحطاني', s:'مكياج عروس كامل', dur:'120 د', p:850, st:'بانتظار الدفع', stc:'gold'},
      {t:'5:30 م', n:'لطيفة المطيري', s:'مكياج ناعم', dur:'45 د', p:250, st:'مؤكد', stc:'green'},
    ],
    week:[
      {t:'الأربعاء · 12:00 م', n:'منيرة الدوسري', s:'مكياج عروس', dur:'120 د', p:850, st:'مؤكد', stc:'green'},
      {t:'الخميس · 6:00 م', n:'أسماء الحربي', s:'مكياج سهرة', dur:'60 د', p:350, st:'مؤكد', stc:'green'},
    ],
  };
  const TABS = [['all','الكل',12],['confirmed','مؤكد',9],['pending','بانتظار الدفع',2],['done','مكتمل',1]];

  function bkRow(b){
    return `<div class="bk-row">
      <div class="bk-time"><span class="t">${b.t}</span><span class="d">${b.dur}</span></div>
      <div class="bk-line"></div>
      <div class="bk-av">${av(b.n)}</div>
      <div class="bk-who"><div class="n">${b.n}</div><div class="s">${b.s}</div></div>
      <div class="bk-price"><span class="num">${b.p}</span> ر.س</div>
      <span class="badge ${b.stc}">${b.st}</span>
      <button class="bk-more">⋯</button>
    </div>`;
  }
  function bkGroup(title, list){
    return `<div class="bk-group"><div class="bk-gh">${title} <span class="c">${list.length}</span></div>${list.map(bkRow).join('')}</div>`;
  }
  function miniCal(){
    const days=['أحد','إثن','ثلا','أرب','خمي','جمع','سبت'];
    let cells='';
    const offset=2; // month starts
    for(let i=0;i<offset;i++)cells+='<span></span>';
    for(let d=1;d<=30;d++){
      const has=[3,7,12,18,21,24,28].includes(d);
      const today=d===21;
      cells+=`<span class="${today?'today':''} ${has?'has':''}">${d}</span>`;
    }
    return `<div class="cal">
      <div class="cal-h"><button>‹</button><b>يونيو ٢٠٢٦</b><button>›</button></div>
      <div class="cal-w">${days.map(d=>`<span>${d}</span>`).join('')}</div>
      <div class="cal-g">${cells}</div>
    </div>`;
  }

  S.bookings = { render(){ return `
<style>
  .bk-top{display:flex;align-items:center;gap:12px;margin-bottom:22px;flex-wrap:wrap;}
  .bk-tabs{display:flex;gap:6px;background:var(--surface);border:1px solid var(--line);border-radius:11px;padding:5px;}
  .bk-tabs button{font-family:'IBM Plex Sans Arabic','Cairo',sans-serif;font-size:13px;color:var(--muted);background:none;border:none;padding:8px 16px;border-radius:7px;cursor:pointer;transition:all .2s;display:flex;align-items:center;gap:7px;}
  .bk-tabs button .c{font-size:11px;background:var(--surface3);padding:1px 7px;border-radius:20px;color:var(--muted);}
  .bk-tabs button.on{background:linear-gradient(120deg,rgba(156,124,58,0.2),rgba(156,124,58,0.06));color:var(--gold-light);}
  .bk-tabs button.on .c{background:var(--gold-deep);color:#131217;}
  .bk-layout{display:grid;grid-template-columns:1fr 300px;gap:20px;align-items:start;}
  @media(max-width:1100px){.bk-layout{grid-template-columns:1fr;}}
  .bk-group{margin-bottom:8px;}
  .bk-gh{font-size:13px;font-weight:600;color:var(--gold-pale);padding:16px 4px 12px;display:flex;align-items:center;gap:9px;}
  .bk-gh .c{font-size:11px;background:var(--surface3);color:var(--muted);border-radius:20px;padding:2px 9px;}
  .bk-row{display:flex;align-items:center;gap:15px;background:var(--surface);border:1px solid var(--line);border-radius:13px;padding:13px 16px;margin-bottom:9px;transition:border-color .25s,transform .25s;}
  .bk-row:hover{border-color:var(--gold-deep);transform:translateX(-3px);}
  .bk-time{text-align:center;min-width:70px;}
  .bk-time .t{display:block;font-family:'IBM Plex Mono',monospace;font-size:13px;color:var(--gold-light);direction:ltr;}
  .bk-time .d{font-size:11px;color:var(--muted-deep);}
  .bk-line{width:1px;height:36px;background:var(--line);}
  .av-c{width:38px;height:38px;border-radius:50%;background:linear-gradient(140deg,#201f26,#18171d);border:0.5px solid var(--gold-deep);display:flex;align-items:center;justify-content:center;font-family:'Bodoni Moda',serif;font-size:17px;color:var(--gold-light);flex-shrink:0;}
  .bk-who{flex:1;min-width:0;}
  .bk-who .n{font-size:14.5px;color:var(--white);font-weight:500;}
  .bk-who .s{font-size:12.5px;color:var(--muted);margin-top:1px;}
  .bk-price{font-size:13px;color:var(--gold-pale);} .bk-price .num{font-size:19px;color:var(--white);}
  .bk-more{background:none;border:none;color:var(--muted);font-size:20px;cursor:pointer;padding:0 4px;transition:color .2s;}
  .bk-more:hover{color:var(--gold-light);}
  .cal{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:18px;position:sticky;top:90px;}
  .cal-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;}
  .cal-h b{font-size:14px;color:var(--white);font-weight:600;}
  .cal-h button{width:28px;height:28px;border-radius:8px;border:1px solid var(--line);background:var(--surface2);color:var(--gold-pale);cursor:pointer;}
  .cal-w{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:6px;}
  .cal-w span{text-align:center;font-size:10px;color:var(--muted-deep);padding:4px 0;}
  .cal-g{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;}
  .cal-g span{aspect-ratio:1;display:flex;align-items:center;justify-content:center;font-size:12.5px;color:var(--cream);border-radius:8px;cursor:pointer;position:relative;direction:ltr;}
  .cal-g span:hover{background:var(--surface3);}
  .cal-g span.has::after{content:'';position:absolute;bottom:4px;width:4px;height:4px;border-radius:50%;background:var(--gold-light);}
  .cal-g span.today{background:linear-gradient(120deg,#dbbd81,#9c8047);color:#131217;font-weight:600;}
  .cal-sum{margin-top:16px;padding-top:16px;border-top:1px solid var(--line-soft);}
  .cal-sum .r{display:flex;justify-content:space-between;padding:7px 0;font-size:13px;}
  .cal-sum .r .k{color:var(--muted);} .cal-sum .r .v{color:var(--white);font-weight:500;}
  .cal-sum .r .v.gold{color:var(--gold-light);}
</style>
<div class="bk-top">
  <div class="bk-tabs">${TABS.map((t,i)=>`<button class="${i===0?'on':''}" onclick="this.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('on'));this.classList.add('on')">${t[1]} <span class="c">${t[2]}</span></button>`).join('')}</div>
  <div style="margin-right:auto;display:flex;gap:10px">
    <button class="btn btn-ghost">${icon('calendar',15)} عرض الشهر</button>
    <button class="btn btn-gold">+ حجز جديد</button>
  </div>
</div>
<div class="bk-layout">
  <div>
    ${bkGroup('اليوم · الأحد ٢١ يونيو', BK.today)}
    ${bkGroup('غداً · الإثنين ٢٢ يونيو', BK.tomorrow)}
    ${bkGroup('بقية الأسبوع', BK.week)}
  </div>
  <div>
    ${miniCal()}
    <div class="cal" style="position:static;margin-top:16px">
      <div class="sec-label" style="margin-bottom:12px">ملخص اليوم <span class="ln"></span></div>
      <div class="cal-sum" style="margin:0;padding:0;border:none">
        <div class="r"><span class="k">إجمالي المواعيد</span><span class="v">٤</span></div>
        <div class="r"><span class="k">مؤكدة</span><span class="v">٣</span></div>
        <div class="r"><span class="k">بانتظار الدفع</span><span class="v">١</span></div>
        <div class="r"><span class="k">دخل اليوم المتوقع</span><span class="v gold">1,950 ر.س</span></div>
      </div>
    </div>
  </div>
</div>`; }};

  /* ════════ CLIENTS ════════ */
  const CLIENTS = [
    {n:'نوف العتيبي', tag:'VIP', tagc:'gold', visits:14, spent:9200, last:'قبل ٣ أيام', rating:5},
    {n:'سارة الأحمدي', tag:'متكررة', tagc:'green', visits:8, spent:4100, last:'اليوم', rating:5},
    {n:'دانة السالم', tag:'متكررة', tagc:'green', visits:6, spent:3300, last:'قبل أسبوع', rating:4},
    {n:'ريم الزهراني', tag:'جديدة', tagc:'soft', visits:1, spent:250, last:'اليوم', rating:0},
    {n:'جواهر الشهري', tag:'متكررة', tagc:'green', visits:5, spent:2800, last:'قبل ٥ أيام', rating:5},
    {n:'لطيفة المطيري', tag:'VIP', tagc:'gold', visits:11, spent:7600, last:'قبل يومين', rating:5},
    {n:'عبير القحطاني', tag:'جديدة', tagc:'soft', visits:2, spent:1200, last:'قبل أسبوعين', rating:4},
    {n:'منيرة الدوسري', tag:'متكررة', tagc:'green', visits:7, spent:5900, last:'غداً', rating:5},
  ];
  const SEG=[['all','الكل',8],['vip','VIP',2],['repeat','متكررات',4],['new','جديدات',2]];

  S.clients = { render(){ return `
<style>
  .cl-top{display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-wrap:wrap;}
  .cl-seg{display:flex;gap:6px;background:var(--surface);border:1px solid var(--line);border-radius:11px;padding:5px;}
  .cl-seg button{font-family:'IBM Plex Sans Arabic','Cairo',sans-serif;font-size:13px;color:var(--muted);background:none;border:none;padding:8px 16px;border-radius:7px;cursor:pointer;display:flex;gap:7px;align-items:center;}
  .cl-seg button .c{font-size:11px;background:var(--surface3);padding:1px 7px;border-radius:20px;}
  .cl-seg button.on{background:linear-gradient(120deg,rgba(156,124,58,0.2),rgba(156,124,58,0.06));color:var(--gold-light);}
  .cl-seg button.on .c{background:var(--gold-deep);color:#131217;}
  .cl-kpi{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:22px;}
  @media(max-width:760px){.cl-kpi{grid-template-columns:1fr;}}
  .cl-table{background:var(--surface);border:1px solid var(--line);border-radius:16px;overflow:hidden;}
  .cl-th,.cl-tr{display:grid;grid-template-columns:2fr 1fr 1fr 1fr 1.1fr 40px;gap:14px;align-items:center;padding:15px 22px;}
  .cl-th{background:var(--surface2);border-bottom:1px solid var(--line);font-size:11.5px;color:var(--gold);font-weight:600;letter-spacing:0.02em;}
  .cl-tr{border-bottom:1px solid var(--line-soft);transition:background .2s;cursor:pointer;}
  .cl-tr:last-child{border-bottom:none;}
  .cl-tr:hover{background:var(--surface2);}
  .cl-name{display:flex;align-items:center;gap:12px;}
  .cl-name .nm{font-size:14.5px;color:var(--white);font-weight:500;}
  .cl-cell{font-size:13.5px;color:var(--cream);}
  .cl-cell .num{font-size:16px;color:var(--white);}
  .cl-more{background:none;border:none;color:var(--muted);font-size:18px;cursor:pointer;}
  @media(max-width:900px){.cl-th{display:none;}.cl-tr{grid-template-columns:1fr auto;gap:8px;}.cl-tr .hide{display:none;}}
</style>
<div class="cl-top">
  <div class="cl-seg">${SEG.map((s,i)=>`<button class="${i===0?'on':''}" onclick="this.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('on'));this.classList.add('on')">${s[1]} <span class="c">${s[2]}</span></button>`).join('')}</div>
  <div style="margin-right:auto;display:flex;gap:10px">
    <button class="btn btn-ghost">${icon('chart',15)} تصدير</button>
    <button class="btn btn-gold">+ عميلة جديدة</button>
  </div>
</div>
<div class="cl-kpi">
  <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('users',19)}</div></div><div class="val">156</div><div class="k">إجمالي العملاء</div></div>
  <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('loyalty',19)}</div><div class="delta up">▲ 68%</div></div><div class="val">106</div><div class="k">عميلات متكررات</div></div>
  <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('wallet',19)}</div></div><div class="val">512<span class="u">ر.س</span></div><div class="k">متوسط إنفاق العميلة</div></div>
</div>
<div class="cl-table">
  <div class="cl-th"><span>العميلة</span><span>الزيارات</span><span>إجمالي الإنفاق</span><span>آخر زيارة</span><span>تقييمها</span><span></span></div>
  ${CLIENTS.map(c=>`<div class="cl-tr">
    <div class="cl-name">${av(c.n)}<div><div class="nm">${c.n}</div><span class="badge ${c.tagc}" style="margin-top:4px">${c.tag}</span></div></div>
    <div class="cl-cell hide"><span class="num">${c.visits}</span> زيارة</div>
    <div class="cl-cell hide"><span class="num">${c.spent.toLocaleString('en')}</span> ر.س</div>
    <div class="cl-cell hide">${c.last}</div>
    <div class="cl-cell hide">${c.rating?stars(c.rating,12):'<span style="color:var(--muted-deep)">—</span>'}</div>
    <button class="cl-more">⋯</button>
  </div>`).join('')}
</div>`; }};

  /* ════════ REVIEWS ════════ */
  const DIST=[[5,178],[4,28],[3,5],[2,1],[1,1]];
  const TOTAL=213;
  const RV=[
    {n:'منى العتيبي', r:5, s:'مكياج عروس كامل', txt:'احترافية عالية ونتيجة مبهرة فاقت توقعاتي، التزام تام بالوقت وذوق راقٍ في كل تفصيل. تستحق كل ريال.', ago:'قبل يومين', replied:false},
    {n:'هند المالكي', r:5, s:'مكياج سهرة', txt:'في الموعد بالضبط، ولمسة راقية تدوم طوال الليل. أنصح بها بشدة لكل عروس.', ago:'قبل ٤ أيام', replied:true, reply:'سعدت بكِ يا هند، في انتظارك دائماً 🤍'},
    {n:'لمى السبيعي', r:4, s:'مكياج ناعم', txt:'تجربة ممتازة بشكل عام وأجواء مريحة جداً. النتيجة جميلة ومناسبة للنهار.', ago:'قبل أسبوع', replied:false},
    {n:'أسماء الحربي', r:5, s:'جلسة تعليمية', txt:'استفدت كثيراً من الجلسة، شرح واضح وصبر جميل. الآن أطبّق ما تعلمته بثقة.', ago:'قبل أسبوعين', replied:true, reply:'فخورة فيكِ يا أسماء ✨'},
  ];

  S.reviews = { render(){ return `
<style>
  .rv-layout{display:grid;grid-template-columns:320px 1fr;gap:22px;align-items:start;}
  @media(max-width:1000px){.rv-layout{grid-template-columns:1fr;}}
  .rv-summary{background:linear-gradient(160deg,var(--surface2),var(--surface));border:1px solid var(--line);border-radius:18px;padding:28px 24px;text-align:center;position:sticky;top:90px;}
  .rv-big{font-family:'Bodoni Moda',serif;font-weight:500;font-size:68px;color:var(--white);direction:ltr;line-height:1;}
  .rv-summary .stars{font-size:18px;margin:8px 0 4px;}
  .rv-summary .cnt{font-size:13px;color:var(--muted);}
  .rv-dist{margin-top:22px;display:flex;flex-direction:column;gap:9px;}
  .rv-dist .d{display:flex;align-items:center;gap:10px;font-size:12px;}
  .rv-dist .d .lb{color:var(--gold-pale);width:26px;direction:ltr;text-align:right;}
  .rv-dist .d .bar{flex:1;height:7px;background:var(--surface3);border-radius:10px;overflow:hidden;}
  .rv-dist .d .bar span{display:block;height:100%;background:linear-gradient(90deg,#9c8047,#dbbd81);border-radius:10px;}
  .rv-dist .d .n{color:var(--muted);width:30px;direction:ltr;text-align:left;}
  .rv-filter{display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap;}
  .rv-filter button{font-family:'IBM Plex Sans Arabic','Cairo',sans-serif;font-size:12.5px;color:var(--muted);background:var(--surface);border:1px solid var(--line);border-radius:20px;padding:7px 15px;cursor:pointer;transition:all .2s;}
  .rv-filter button.on{background:rgba(156,124,58,0.14);border-color:var(--gold-deep);color:var(--gold-light);}
  .rv-card{background:var(--surface);border:1px solid var(--line);border-radius:15px;padding:20px 22px;margin-bottom:14px;}
  .rv-hd{display:flex;align-items:center;justify-content:space-between;}
  .rv-hd .who{display:flex;align-items:center;gap:12px;}
  .rv-hd .who .nm{font-size:15px;color:var(--white);font-weight:600;}
  .rv-hd .who .sv{font-size:12px;color:var(--muted);margin-top:1px;}
  .rv-body{font-size:14px;color:var(--cream);line-height:1.85;margin:14px 0;font-weight:300;}
  .rv-foot{display:flex;align-items:center;justify-content:space-between;}
  .rv-foot .ago{font-size:11.5px;color:var(--muted-deep);}
  .rv-reply-btn{font-size:12.5px;color:var(--gold-light);border:0.5px solid var(--gold-deep);border-radius:20px;padding:7px 16px;cursor:pointer;transition:all .25s;background:none;}
  .rv-reply-btn:hover{background:var(--gold-light);color:#131217;}
  .rv-reply{margin-top:14px;background:var(--surface2);border-right:2px solid var(--gold);border-radius:8px;padding:12px 15px;}
  .rv-reply .lb{font-size:11px;color:var(--gold);margin-bottom:4px;}
  .rv-reply .tx{font-size:13px;color:var(--cream);}
</style>
<div class="rv-layout">
  <div class="rv-summary">
    <div class="rv-big">4.9</div>
    <div class="stars">${stars(5,18)}</div>
    <div class="cnt">من ٢١٣ تقييماً</div>
    <div class="rv-dist">
      ${DIST.map(d=>`<div class="d"><span class="lb">${d[0]} ★</span><div class="bar"><span style="width:${(d[1]/TOTAL*100).toFixed(0)}%"></span></div><span class="n">${d[1]}</span></div>`).join('')}
    </div>
    <div style="margin-top:22px;padding-top:18px;border-top:1px solid var(--line-soft);display:flex;justify-content:space-between;font-size:13px"><span style="color:var(--muted)">معدّل الرد</span><span style="color:var(--gold-light);font-weight:600">٨٢٪</span></div>
  </div>
  <div>
    <div class="rv-filter">
      <button class="on">الكل</button><button>٥ نجوم</button><button>٤ نجوم</button><button>بانتظار الرد</button>
    </div>
    ${RV.map(r=>`<div class="rv-card">
      <div class="rv-hd"><div class="who">${av(r.n)}<div><div class="nm">${r.n}</div><div class="sv">${r.s}</div></div></div><div>${stars(r.r,15)}</div></div>
      <div class="rv-body">${r.txt}</div>
      <div class="rv-foot"><span class="ago">${r.ago}</span>${r.replied?'<span class="badge soft">تم الرد ✓</span>':'<button class="rv-reply-btn">الردّ على التقييم</button>'}</div>
      ${r.replied?`<div class="rv-reply"><div class="lb">ردّك</div><div class="tx">${r.reply}</div></div>`:''}
    </div>`).join('')}
  </div>
</div>`; }};
})();
