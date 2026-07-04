/* LUMA admin — Analytics, Providers, Bookings */
(function(){
  const A = window.LUMA_ADMIN = window.LUMA_ADMIN || {};
  const avc = n=>`<span class="avx">${n.charAt(0)}</span>`;

  function area(data,max,opts={}){
    const W=opts.w||640,H=opts.h||220,pad={t:18,r:12,b:30,l:34},iw=W-pad.l-pad.r,ih=H-pad.t-pad.b,step=iw/(data.length-1);
    const pts=data.map((d,i)=>[pad.l+i*step,pad.t+ih-(d.v/max)*ih]);
    const line=pts.map((p,i)=>`${i?'L':'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
    const ar=`${line} L${pad.l+iw} ${pad.t+ih} L${pad.l} ${pad.t+ih} Z`;
    let grid='';for(let g=0;g<=4;g++){const y=pad.t+ih-(g/4)*ih;grid+=`<line x1="${pad.l}" y1="${y}" x2="${W-pad.r}" y2="${y}" stroke="#26242d" stroke-width="1" stroke-dasharray="2 4"/><text x="${pad.l-7}" y="${y+4}" fill="#58545f" font-size="9.5" font-family="IBM Plex Mono" text-anchor="end">${((g/4)*max).toFixed(0)}</text>`;}
    const dots=pts.map((p,i)=>`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="${i===pts.length-1?4:2.4}" fill="${i===pts.length-1?'#dbbd81':'#9c8047'}"/>`).join('');
    const labels=data.map((d,i)=>`<text x="${(pad.l+i*step).toFixed(1)}" y="${H-12}" fill="#86818d" font-size="10" font-family="Cairo" text-anchor="middle">${d.m}</text>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="overflow:visible"><defs><linearGradient id="aag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9c8047" stop-opacity="0.32"/><stop offset="1" stop-color="#9c8047" stop-opacity="0"/></linearGradient></defs>${grid}<path d="${ar}" fill="url(#aag)"/><path d="${line}" fill="none" stroke="#ccab64" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>${dots}${labels}</svg>`;
  }
  function stars(r,sz=12){let s='';for(let i=1;i<=5;i++)s+=`<span style="color:${i<=r?'#ccab64':'#26242d'};font-size:${sz}px">★</span>`;return s;}

  /* ════════ ANALYTICS ════════ */
  const GMV=[{m:'مارس',v:23},{m:'أبريل',v:29},{m:'مايو',v:34},{m:'يونيو',v:42},{m:'يوليو',v:51},{m:'أغسطس',v:58},{m:'سبتمبر',v:62}];
  const GROW=[{m:'مارس',v:96},{m:'أبريل',v:112},{m:'مايو',v:124},{m:'يونيو',v:138},{m:'يوليو',v:149},{m:'أغسطس',v:158},{m:'سبتمبر',v:164}];
  const CATS=[['مكياج',38,'#dbbd81'],['عناية بالبشرة',24,'#ccab64'],['شعر',18,'#9c8047'],['تصوير',12,'#846a38'],['أظافر',8,'#5a4624']];
  const CITIES=[['جدة',42],['الرياض',31],['جازان',14],['الدمام',8],['مكة',5]];
  A.analytics={ render(){ return `
<style>
  .an-kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:22px;}@media(max-width:1100px){.an-kpi{grid-template-columns:1fr 1fr;}}
  .an-row{display:grid;grid-template-columns:1.5fr 1fr;gap:18px;align-items:start;}@media(max-width:1000px){.an-row{grid-template-columns:1fr;}}
  .an-row2{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:18px;align-items:start;}@media(max-width:1000px){.an-row2{grid-template-columns:1fr;}}
  .brow{display:flex;align-items:center;gap:12px;padding:10px 0;}
  .brow .nm{font-size:13.5px;color:var(--cream);width:108px;}
  .brow .bar{flex:1;height:9px;background:var(--surface3);border-radius:10px;overflow:hidden;}
  .brow .bar span{display:block;height:100%;border-radius:10px;}
  .brow .pc{font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--gold-pale);width:38px;text-align:left;direction:ltr;}
  .ttl{font-family:'Cairo',sans-serif;font-weight:600;font-size:17px;color:var(--white);} .tsub{font-size:12.5px;color:var(--muted);}
</style>
<div class="an-kpi">
  <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('wallet',19)}</div><div class="delta up">▲ 18%</div></div><div class="val">62<span class="u">ألف</span></div><div class="k">GMV هذا الشهر (ر.س)</div></div>
  <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('users',19)}</div><div class="delta up">▲ 71%</div></div><div class="val">91<span class="u">%</span></div><div class="k">معدّل احتفاظ المزوّدين</div></div>
  <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('commission',19)}</div></div><div class="val">2,516<span class="u">ر.س</span></div><div class="k">متوسط GMV لكل مزوّد</div></div>
  <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('trend',19)}</div><div class="delta up">▲ 4%</div></div><div class="val">23<span class="u">%</span></div><div class="k">تحويل التجربة للاشتراك</div></div>
</div>
<div class="an-row">
  <div class="card"><div style="display:flex;justify-content:space-between;margin-bottom:12px"><div><div class="ttl">إجمالي المبيعات (GMV)</div><div class="tsub">آخر ٧ أشهر · بالألف ر.س</div></div><span class="badge gold">+170% نمو</span></div>${area(GMV,70)}</div>
  <div class="card"><div class="sec-label">الحجوزات حسب الفئة <span class="ln"></span></div>${CATS.map(c=>`<div class="brow"><span class="nm">${c[0]}</span><div class="bar"><span style="width:${c[1]/38*100}%;background:${c[2]}"></span></div><span class="pc">${c[1]}%</span></div>`).join('')}</div>
</div>
<div class="an-row2">
  <div class="card"><div style="display:flex;justify-content:space-between;margin-bottom:12px"><div><div class="ttl">نمو المزوّدين</div><div class="tsub">إجمالي تراكمي</div></div><span class="badge gold">164 مزوّد</span></div>${area(GROW,180,{h:200})}</div>
  <div class="card"><div class="sec-label">التوزيع الجغرافي <span class="ln"></span></div>${CITIES.map(c=>`<div class="brow"><span class="nm">${c[0]}</span><div class="bar"><span style="width:${c[1]/42*100}%;background:linear-gradient(90deg,#9c8047,#dbbd81)"></span></div><span class="pc">${c[1]}%</span></div>`).join('')}</div>
</div>`; }};

  /* ════════ PROVIDERS ════════ */
  const PROV=[
    {n:'رهف العتيبي',c:'مكياج · جدة',tier:'وَهَج',bk:213,gmv:'74,200',r:4.9,st:'موثّقة',stc:'green'},
    {n:'لمياء الزهراني',c:'بشرة · الرياض',tier:'فَرِيد',bk:98,gmv:'46,800',r:5.0,st:'موثّقة',stc:'green'},
    {n:'نورة القحطاني',c:'شعر · جازان',tier:'سَناء',bk:156,gmv:'34,300',r:4.8,st:'موثّقة',stc:'green'},
    {n:'دانة الشهري',c:'مكياج · الرياض',tier:'وَهَج',bk:187,gmv:'62,100',r:4.7,st:'موثّقة',stc:'green'},
    {n:'غادة الفيفي',c:'تصوير · جازان',tier:'وَهَج',bk:52,gmv:'28,600',r:4.9,st:'بانتظار التوثيق',stc:'gold'},
    {n:'ريم العنزي',c:'رموش · الدمام',tier:'فَرِيد',bk:121,gmv:'22,900',r:5.0,st:'موثّقة',stc:'green'},
    {n:'هند المالكي',c:'بشرة · جازان',tier:'سَناء',bk:64,gmv:'15,400',r:4.6,st:'بانتظار التوثيق',stc:'gold'},
    {n:'أمل السبيعي',c:'مكياج · الدمام',tier:'وَهَج',bk:134,gmv:'50,900',r:4.7,st:'موقوفة',stc:'red'},
  ];
  const PSEG=[['all','الكل',164],['verified','موثّقة',151],['pending','بانتظار التوثيق',7],['suspended','موقوفة',6]];
  const PK={'موثّقة':'verified','بانتظار التوثيق':'pending','موقوفة':'suspended'};
  window.__pfilter=function(k,btn){
    btn.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('on'));btn.classList.add('on');
    const table=btn.closest('.p-top').parentElement.querySelector('.ptable');
    table.querySelectorAll('.ptr').forEach(r=>{r.style.display=(k==='all'||r.dataset.k===k)?'':'none';});
    let vis=[...table.querySelectorAll('.ptr')].some(r=>r.style.display!=='none');
    let em=table.querySelector('.p-empty');
    if(!vis){if(!em){em=document.createElement('div');em.className='p-empty';em.style.cssText='padding:34px;text-align:center;color:var(--muted);font-size:14px';em.textContent='لا توجد مزوّدات بهذه الحالة في العيّنة الظاهرة.';table.appendChild(em);}}
    else if(em){em.remove();}
  };
  A.providers={ render(){ return `
<style>
  .p-top{display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-wrap:wrap;}
  .p-seg{display:flex;gap:6px;background:var(--surface);border:1px solid var(--line);border-radius:11px;padding:5px;}
  .p-seg button{font-family:'Cairo',sans-serif;font-size:13px;color:var(--muted);background:none;border:none;padding:8px 16px;border-radius:7px;cursor:pointer;display:flex;gap:7px;align-items:center;}
  .p-seg button .c{font-size:11px;background:var(--surface3);padding:1px 7px;border-radius:20px;}
  .p-seg button.on{background:linear-gradient(120deg,rgba(156,124,58,0.2),rgba(156,124,58,0.06));color:var(--gold-light);}
  .p-seg button.on .c{background:var(--gold-deep);color:#131217;}
  .p-kpi{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:22px;}@media(max-width:760px){.p-kpi{grid-template-columns:1fr;}}
  .ptable{background:var(--surface);border:1px solid var(--line);border-radius:16px;overflow:hidden;}
  .pth,.ptr{display:grid;grid-template-columns:2.2fr 1fr 1fr 1.2fr 1fr 1.1fr 40px;gap:12px;align-items:center;padding:14px 20px;}
  .pth{background:var(--surface2);border-bottom:1px solid var(--line);font-size:11.5px;color:var(--gold);font-weight:600;}
  .ptr{border-bottom:1px solid var(--line-soft);transition:background .2s;cursor:pointer;}.ptr:last-child{border-bottom:none;}.ptr:hover{background:var(--surface2);}
  .pname{display:flex;align-items:center;gap:11px;}.pname .nm{font-size:14px;color:var(--white);font-weight:500;}.pname .s{font-size:11.5px;color:var(--muted);}
  .avx{width:36px;height:36px;border-radius:50%;background:var(--surface3);border:0.5px solid var(--gold-deep);display:flex;align-items:center;justify-content:center;font-family:'Bodoni Moda',serif;color:var(--gold-light);font-size:15px;flex-shrink:0;}
  .pcell{font-size:13px;color:var(--cream);} .pcell .num{font-family:'Bodoni Moda',serif;font-size:17px;color:var(--white);direction:ltr;}
  .pmore{background:none;border:none;color:var(--muted);font-size:18px;cursor:pointer;}
  @media(max-width:1080px){.pth{display:none;}.ptr{grid-template-columns:1fr auto;}.ptr .hide{display:none;}}
</style>
<div class="p-top">
  <div class="p-seg">${PSEG.map((s,i)=>`<button class="${i===0?'on':''}" onclick="__pfilter('${s[0]}',this)">${s[1]} <span class="c">${s[2]}</span></button>`).join('')}</div>
  <div style="margin-right:auto;display:flex;gap:10px"><button class="btn btn-ghost">${icon('trend',15)} تصدير</button><button class="btn btn-gold">+ دعوة مزوّد</button></div>
</div>
<div class="p-kpi">
  <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('users',19)}</div><div class="delta up">▲ 12</div></div><div class="val">164</div><div class="k">إجمالي المزوّدين</div></div>
  <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('check',19)}</div></div><div class="val">151</div><div class="k">مزوّدة موثّقة</div></div>
  <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('star',19)}</div></div><div class="val">4.8<span class="u">/5</span></div><div class="k">متوسط التقييم العام</div></div>
</div>
<div class="ptable">
  <div class="pth"><span>المزوّدة</span><span>الباقة</span><span>الحجوزات</span><span>المبيعات</span><span>التقييم</span><span>الحالة</span><span></span></div>
  ${PROV.map((p,i)=>`<div class="ptr" data-k="${PK[p.st]}"><div class="pname">${avc(p.n)}<div><div class="nm">${p.n}</div><div class="s">${p.c}</div></div></div>
    <div class="pcell hide"><span class="badge soft">${p.tier}</span></div>
    <div class="pcell hide"><span class="num">${p.bk}</span></div>
    <div class="pcell hide"><span class="num">${p.gmv}</span> <span style="font-size:10px;color:var(--muted)">ر.س</span></div>
    <div class="pcell hide">${stars(Math.round(p.r))} <span style="font-size:11px;color:var(--muted)">${p.r}</span></div>
    <div class="pcell hide"><span class="badge ${p.stc}">${p.st}</span></div>
    <button class="pmore" onclick="LUX_provStatus&&LUX_provStatus(${i},event)">⋯</button></div>`).join('')}
</div>`; }};

  /* ════════ BOOKINGS (platform-wide) ════════ */
  const BKS=[
    {cl:'نوف العتيبي',pr:'رهف العتيبي',s:'مكياج عروس',a:850,com:85,st:'مكتمل',stc:'green',when:'اليوم'},
    {cl:'سارة الأحمدي',pr:'دانة الشهري',s:'مكياج سهرة',a:350,com:35,st:'مكتمل',stc:'green',when:'اليوم'},
    {cl:'ريم الزهراني',pr:'لمياء الزهراني',s:'هيدرافيشل',a:480,com:38,st:'قادم',stc:'gold',when:'غداً'},
    {cl:'دانة السالم',pr:'نورة القحطاني',s:'صبغة كاملة',a:550,com:66,st:'مكتمل',stc:'green',when:'أمس'},
    {cl:'منيرة الدوسري',pr:'ريم العنزي',s:'رموش حجم روسي',a:190,com:15,st:'ملغى',stc:'red',when:'أمس'},
    {cl:'جواهر الشهري',pr:'غادة الفيفي',s:'جلسة تصوير',a:600,com:60,st:'مكتمل',stc:'green',when:'قبل يومين'},
  ];
  const BSEG=[['all','الكل',1847],['done','مكتمل',1623],['up','قادم',182],['cancel','ملغى',42]];
  const BK_K={'مكتمل':'done','قادم':'up','ملغى':'cancel'};
  window.__bfilter=function(k,btn){
    btn.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('on'));btn.classList.add('on');
    const table=btn.closest('.b-top').parentElement.querySelector('.btable');
    table.querySelectorAll('.btr').forEach(r=>{r.style.display=(k==='all'||r.dataset.k===k)?'':'none';});
    let vis=[...table.querySelectorAll('.btr')].some(r=>r.style.display!=='none');
    let em=table.querySelector('.b-empty');
    if(!vis){if(!em){em=document.createElement('div');em.className='b-empty';em.style.cssText='padding:34px;text-align:center;color:var(--muted);font-size:14px';em.textContent='لا توجد حجوزات بهذه الحالة في العيّنة الظاهرة.';table.appendChild(em);}}
    else if(em){em.remove();}
  };
  A.bookings={ render(){ return `
<style>
  .b-top{display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-wrap:wrap;}
  .b-seg{display:flex;gap:6px;background:var(--surface);border:1px solid var(--line);border-radius:11px;padding:5px;}
  .b-seg button{font-family:'Cairo',sans-serif;font-size:13px;color:var(--muted);background:none;border:none;padding:8px 16px;border-radius:7px;cursor:pointer;display:flex;gap:7px;align-items:center;}
  .b-seg button .c{font-size:11px;background:var(--surface3);padding:1px 7px;border-radius:20px;}
  .b-seg button.on{background:linear-gradient(120deg,rgba(156,124,58,0.2),rgba(156,124,58,0.06));color:var(--gold-light);}.b-seg button.on .c{background:var(--gold-deep);color:#131217;}
  .b-kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:22px;}@media(max-width:1100px){.b-kpi{grid-template-columns:1fr 1fr;}}
  .btable{background:var(--surface);border:1px solid var(--line);border-radius:16px;overflow:hidden;}
  .bth,.btr{display:grid;grid-template-columns:1.3fr 1.3fr 1.2fr 1fr 0.9fr 1fr;gap:12px;align-items:center;padding:14px 20px;}
  .bth{background:var(--surface2);border-bottom:1px solid var(--line);font-size:11.5px;color:var(--gold);font-weight:600;}
  .btr{border-bottom:1px solid var(--line-soft);transition:background .2s;}.btr:last-child{border-bottom:none;}.btr:hover{background:var(--surface2);}
  .btr .cl{font-size:13.5px;color:var(--white);font-weight:500;} .btr .pr{font-size:13px;color:var(--gold-pale);} .btr .s{font-size:13px;color:var(--cream);}
  .btr .amt{font-family:'Bodoni Moda',serif;font-size:17px;color:var(--white);direction:ltr;} .btr .com{font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--gold-light);direction:ltr;}
  @media(max-width:1080px){.bth{display:none;}.btr{grid-template-columns:1fr 1fr auto;}.btr .hide{display:none;}}
</style>
<div class="b-top">
  <div class="b-seg">${BSEG.map((s,i)=>`<button class="${i===0?'on':''}" onclick="__bfilter('${s[0]}',this)">${s[1]} <span class="c">${s[2].toLocaleString('en')}</span></button>`).join('')}</div>
  <div style="margin-right:auto"><button class="btn btn-ghost">${icon('calendar',15)} تصدير الكشف</button></div>
</div>
<div class="b-kpi">
  <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('calendar',19)}</div><div class="delta up">▲ 9%</div></div><div class="val">1,847</div><div class="k">إجمالي الحجوزات</div></div>
  <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('check',19)}</div></div><div class="val">88<span class="u">%</span></div><div class="k">نسبة الإتمام</div></div>
  <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('wallet',19)}</div></div><div class="val">412<span class="u">ألف</span></div><div class="k">قيمة الحجوزات (ر.س)</div></div>
  <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('trend',19)}</div><div class="delta down">▼ 1%</div></div><div class="val">2.3<span class="u">%</span></div><div class="k">نسبة الإلغاء</div></div>
</div>
<div class="btable">
  <div class="bth"><span>العميلة</span><span>المزوّدة</span><span>الخدمة</span><span>القيمة</span><span>العمولة</span><span>الحالة</span></div>
  ${BKS.map((b,i)=>`<div class="btr" data-k="${BK_K[b.st]}"><span class="cl">${b.cl}</span><span class="pr hide">${b.pr}</span><span class="s hide">${b.s}</span><span class="amt hide">${b.a} ر.س</span><span class="com hide">+${b.com}</span><span><span class="badge ${b.stc}">${b.st}</span></span></div>`).join('')}
</div>`; }};

  /* ════════ PROVIDER STATUS CONTROL ════════ */
  window.LUX_provStatus=function(i,ev){
    if(ev&&ev.stopPropagation)ev.stopPropagation();
    if(!window.LUX)return;
    const p=PROV[i];
    const STS=[['موثّقة','green','تظهر في المتجر وتستقبل الحجوزات'],['بانتظار التوثيق','gold','لا تظهر حتى تُوثّق هويتها'],['موقوفة','red','مخفية ومحظورة من استقبال الحجوزات']];
    const body=`
      <div class="lux-pr" style="border-bottom:1px solid var(--line,#1b1a21)"><span class="lux-av">${p.n.charAt(0)}</span><div style="flex:1"><div class="nm">${p.n}</div><div class="bk" style="direction:rtl;text-align:right">${p.c} · باقة ${p.tier} · ${p.bk} حجز</div></div><span class="badge ${p.stc}">${p.st}</span></div>
      <div class="lux-lead" style="margin-top:14px">اختاري حالة المزوّدة — تُطبَّق فورًا على ظهورها واستقبالها للحجوزات.</div>
      <div id="pst">${STS.map(s=>`<div class="lux-pr lux-opt" data-st="${s[0]}"><span class="lux-radio ${p.st===s[0]?'on':''}"></span><div style="flex:1"><div class="nm">${s[0]}</div><div class="bk" style="direction:rtl;text-align:right">${s[2]}</div></div></div>`).join('')}</div>
      <div class="lux-f" id="rsn" style="display:none;margin-top:6px"><label>سبب الإيقاف (يُرسل للمزوّدة)</label><textarea rows="2" placeholder="مثال: مخالفة شروط الخدمة…"></textarea></div>
      <div class="lux-foot" style="margin-top:8px"><button class="lux-btn lux-ghost" data-c style="flex:1">إلغاء</button><button class="lux-btn lux-gold" data-s style="flex:1.4">حفظ الحالة</button></div>`;
    window.LUX.modal('إدارة حالة: '+p.n,body,{onMount(ov,close){
      let sel=p.st;
      const sync=()=>{ov.querySelectorAll('#pst .lux-pr').forEach(r=>r.querySelector('.lux-radio').classList.toggle('on',r.dataset.st===sel));ov.querySelector('#rsn').style.display=sel==='موقوفة'?'':'none';};
      ov.querySelectorAll('#pst .lux-pr').forEach(r=>r.onclick=()=>{sel=r.dataset.st;sync();});sync();
      ov.querySelector('[data-c]').onclick=close;
      ov.querySelector('[data-s]').onclick=()=>{const map={'موثّقة':'green','بانتظار التوثيق':'gold','موقوفة':'red'};p.st=sel;p.stc=map[sel];close();window.ADMIN&&window.ADMIN.go('providers');window.LUX.toast('تم تحديث حالة '+p.n+' إلى «'+sel+'» ✓',sel==='موقوفة'?'err':'ok');};
    }});
  };
})();
