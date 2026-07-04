/* LUMA admin — Payments, Commissions, Marketers */
(function(){
  const A = window.LUMA_ADMIN = window.LUMA_ADMIN || {};
  const avc = n=>`<span class="avx">${n.charAt(0)}</span>`;

  /* ════════ PAYMENTS ════════ */
  const TX=[
    {n:'دانة الشهري',t:'اشتراك وَهَج',m:'mada',a:399,dir:'in',st:'مكتمل',stc:'green',when:'اليوم · 2:14 م'},
    {n:'رهف العتيبي',t:'تحويل أرباح',m:'تحويل بنكي',a:17150,dir:'out',st:'قيد التنفيذ',stc:'gold',when:'اليوم · 1:00 م'},
    {n:'سارة الغامدي',t:'عمولة حجز',m:'Apple Pay',a:48,dir:'in',st:'مكتمل',stc:'green',when:'اليوم · 11:30 ص'},
    {n:'لمياء الزهراني',t:'اشتراك فَرِيد',m:'mada',a:799,dir:'in',st:'مكتمل',stc:'green',when:'أمس'},
    {n:'نورة القحطاني',t:'تحويل أرباح',m:'تحويل بنكي',a:9300,dir:'out',st:'مكتمل',stc:'green',when:'أمس'},
    {n:'غادة الفيفي',t:'اشتراك وَهَج',m:'Apple Pay',a:399,dir:'in',st:'مكتمل',stc:'green',when:'قبل يومين'},
    {n:'أمل السبيعي',t:'استرداد إلغاء',m:'mada',a:350,dir:'out',st:'مكتمل',stc:'green',when:'قبل يومين'},
  ];
  const PSEG=[['all','الكل',0],['in','واردة',0],['out','تحويلات',0],['pending','معلّقة',0]];
  const txKey=t=>t.st!=='مكتمل'?'pending':t.dir; // in / out / pending
  window.__fxfilter=function(k,btn){
    btn.parentElement.querySelectorAll('button').forEach(b=>b.classList.remove('on'));btn.classList.add('on');
    const table=btn.closest('.f-top').parentElement.querySelector('.ftable');
    table.querySelectorAll('.ftr').forEach(r=>{
      const show = k==='all' || r.dataset.dir===k || (k==='pending'&&r.dataset.pending==='1');
      r.style.display=show?'':'none';
    });
    let vis=[...table.querySelectorAll('.ftr')].some(r=>r.style.display!=='none');
    let em=table.querySelector('.f-empty');
    if(!vis){if(!em){em=document.createElement('div');em.className='f-empty';em.style.cssText='padding:34px;text-align:center;color:var(--muted);font-size:14px';em.textContent='لا توجد حركات بهذا التصنيف في العيّنة الظاهرة.';table.appendChild(em);}}
    else if(em){em.remove();}
  };
  A.payments={ render(){ return `
<style>
  .f-top{display:flex;align-items:center;gap:12px;margin-bottom:20px;flex-wrap:wrap;}
  .f-seg{display:flex;gap:6px;background:var(--surface);border:1px solid var(--line);border-radius:11px;padding:5px;}
  .f-seg button{font-family:'Cairo',sans-serif;font-size:13px;color:var(--muted);background:none;border:none;padding:8px 16px;border-radius:7px;cursor:pointer;}
  .f-seg button.on{background:linear-gradient(120deg,rgba(156,124,58,0.2),rgba(156,124,58,0.06));color:var(--gold-light);}
  .f-kpi{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:22px;}@media(max-width:1100px){.f-kpi{grid-template-columns:1fr 1fr;}}
  .ftable{background:var(--surface);border:1px solid var(--line);border-radius:16px;overflow:hidden;}
  .fth,.ftr{display:grid;grid-template-columns:1.6fr 1.3fr 1fr 1fr 1fr;gap:12px;align-items:center;padding:14px 20px;}
  .fth{background:var(--surface2);border-bottom:1px solid var(--line);font-size:11.5px;color:var(--gold);font-weight:600;}
  .ftr{border-bottom:1px solid var(--line-soft);transition:background .2s;}.ftr:last-child{border-bottom:none;}.ftr:hover{background:var(--surface2);}
  .ftr .who{display:flex;align-items:center;gap:11px;}.ftr .who .n{font-size:13.5px;color:var(--white);font-weight:500;}.ftr .who .t{font-size:11.5px;color:var(--muted);}
  .avx{width:36px;height:36px;border-radius:50%;background:var(--surface3);border:0.5px solid var(--gold-deep);display:flex;align-items:center;justify-content:center;font-family:'Bodoni Moda',serif;color:var(--gold-light);font-size:15px;flex-shrink:0;}
  .ftr .m{font-size:12.5px;color:var(--cream);direction:ltr;text-align:right;} .ftr .when{font-size:11.5px;color:var(--muted);}
  .ftr .amt{font-family:'Bodoni Moda',serif;font-size:18px;direction:ltr;}.ftr .amt.in{color:var(--green);}.ftr .amt.out{color:var(--gold-light);}
  @media(max-width:1080px){.fth{display:none;}.ftr{grid-template-columns:1fr auto;}.ftr .hide{display:none;}}
</style>
<div class="f-top">
  <div class="f-seg">${PSEG.map((s,i)=>`<button class="${i===0?'on':''}" onclick="__fxfilter('${s[0]}',this)">${s[1]}</button>`).join('')}</div>
  <div style="margin-right:auto;display:flex;gap:10px"><button class="btn btn-ghost">${icon('wallet',15)} كشف الحساب</button><button class="btn btn-gold">تنفيذ التحويلات</button></div>
</div>
<div class="f-kpi">
  <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('wallet',19)}</div><div class="delta up">▲ 18%</div></div><div class="val">471<span class="u">ألف</span></div><div class="k">إجمالي المعالَج (ر.س)</div></div>
  <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('commission',19)}</div></div><div class="val">58,900<span class="u">ر.س</span></div><div class="k">إيراد المنصة</div></div>
  <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('users',19)}</div></div><div class="val">353<span class="u">ألف</span></div><div class="k">تحويلات للمزوّدين (ر.س)</div></div>
  <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('calendar',19)}</div><div class="delta up">12</div></div><div class="val">84,200<span class="u">ر.س</span></div><div class="k">تحويلات مجدولة اليوم</div></div>
</div>
<div class="ftable">
  <div class="fth"><span>الطرف</span><span>الطريقة</span><span>الوقت</span><span>الحالة</span><span>المبلغ</span></div>
  ${TX.map(t=>`<div class="ftr" data-dir="${t.dir}" data-pending="${t.st!=='مكتمل'?'1':'0'}"><div class="who">${avc(t.n)}<div><div class="n">${t.n}</div><div class="t">${t.t}</div></div></div><span class="m hide">${t.m}</span><span class="when hide">${t.when}</span><span class="hide"><span class="badge ${t.stc}">${t.st}</span></span><span class="amt ${t.dir}">${t.dir==='in'?'+':'−'}${t.a.toLocaleString('en')} ر.س</span></div>`).join('')}
</div>`; }};

  /* ════════ COMMISSIONS ════════ */
  const MKCOM=[
    {n:'سارة المرزوقي',h:'@sara.beauty',sales:44000,rate:10},
    {n:'هيا الناصر',h:'@haya.style',sales:28000,rate:10},
    {n:'مها العتيبي',h:'@maha.makeup',sales:16000,rate:10},
    {n:'لين الشمري',h:'@leen.glam',sales:8000,rate:12},
    {n:'نوف القحطاني',h:'@nouf.looks',sales:6500,rate:10},
  ];
  const comOf=m=>Math.round(m.sales*m.rate/100);
  A.commissions={ render(){
    const total=MKCOM.reduce((s,m)=>s+comOf(m),0);
    const avg=(MKCOM.reduce((s,m)=>s+m.rate,0)/MKCOM.length).toFixed(1);
    const top=MKCOM.slice().sort((a,b)=>comOf(b)-comOf(a))[0];
    return `
<style>
  .mc-kpi{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:22px;}@media(max-width:760px){.mc-kpi{grid-template-columns:1fr;}}
  .mctable{background:var(--surface);border:1px solid var(--line);border-radius:16px;overflow:hidden;}
  .mcth,.mctr{display:grid;grid-template-columns:2fr 1.3fr 0.8fr 1.2fr 1fr;gap:12px;align-items:center;padding:14px 20px;}
  .mcth{background:var(--surface2);border-bottom:1px solid var(--line);font-size:11.5px;color:var(--gold);font-weight:600;}
  .mctr{border-bottom:1px solid var(--line-soft);}.mctr:last-child{border-bottom:none;}.mctr:hover{background:var(--surface2);}
  .mctr .who{display:flex;align-items:center;gap:11px;}.mctr .who .n{font-size:13.5px;color:var(--white);font-weight:500;}.mctr .who .h{font-size:11.5px;color:var(--gold-pale);direction:ltr;text-align:right;}
  .avx{width:36px;height:36px;border-radius:50%;background:var(--surface3);border:0.5px solid var(--gold-deep);display:flex;align-items:center;justify-content:center;font-family:'Bodoni Moda',serif;color:var(--gold-light);font-size:14px;}
  .mctr .gmv{font-family:'Bodoni Moda',serif;font-size:17px;color:var(--white);direction:ltr;} .mctr .rt{font-family:'IBM Plex Mono',monospace;font-size:14px;color:var(--gold-pale);direction:ltr;} .mctr .com{font-family:'Bodoni Moda',serif;font-size:18px;color:var(--gold-light);direction:ltr;}
  .mctr .ed{background:none;border:1px solid var(--line);color:var(--gold-pale);border-radius:8px;padding:7px 12px;font-family:'Cairo',sans-serif;font-size:12.5px;cursor:pointer;justify-self:start;}.mctr .ed:hover{border-color:var(--gold-deep);color:var(--gold-light);}
  @media(max-width:1080px){.mcth{display:none;}.mctr{grid-template-columns:1fr auto;}.mctr .hide{display:none;}}
</style>
<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px;flex-wrap:wrap">
  <div style="font-size:13.5px;color:var(--gold-pale);max-width:62ch">عمولات <b style="color:var(--white)">المسوّقات</b> على المبيعات التي يجلبنها للمنصة. <span style="color:var(--muted)">(عمولات الباقات تُعدّل مباشرةً من صفحة كل باقة في قسم الباقات.)</span></div>
  <button class="btn btn-gold" onclick="LUX_mkDefault&&LUX_mkDefault()">${icon('commission',15)} النسبة الافتراضية</button>
</div>
<div class="mc-kpi">
  <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('commission',19)}</div><div class="delta up">▲ 14%</div></div><div class="val">${total.toLocaleString('en')}<span class="u">ر.س</span></div><div class="k">عمولات المسوّقات هذا الشهر</div></div>
  <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('trend',19)}</div></div><div class="val">${avg}<span class="u">%</span></div><div class="k">متوسط نسبة عمولة المسوّقات</div></div>
  <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('star',19)}</div></div><div class="val">${top.n}</div><div class="k">أعلى مسوّقة عمولة</div></div>
</div>
<div class="mctable">
  <div class="mcth"><span>المسوّقة</span><span>المبيعات المُحالة</span><span>النسبة</span><span>العمولة المستحقة</span><span></span></div>
  ${MKCOM.map((m,i)=>`<div class="mctr"><div class="who">${avc(m.n)}<div><div class="n">${m.n}</div><div class="h">${m.h}</div></div></div><span class="gmv hide">${m.sales.toLocaleString('en')} ر.س</span><span class="rt hide">${m.rate}%</span><span class="com hide">${comOf(m).toLocaleString('en')} ر.س</span><button class="ed" onclick="LUX_mkRate&&LUX_mkRate(${i})">تعديل النسبة</button></div>`).join('')}
</div>`; }};

  /* ════════ MARKETERS ════════ */
  const MK=[
    {n:'سارة المرزوقي',h:'@sara.beauty',ref:14,conv:11,earned:'4,400',st:'نشط',stc:'green'},
    {n:'هيا الناصر',h:'@haya.style',ref:9,conv:7,earned:'2,800',st:'نشط',stc:'green'},
    {n:'مها العتيبي',h:'@maha.makeup',ref:6,conv:4,earned:'1,600',st:'نشط',stc:'green'},
    {n:'لين الشمري',h:'@leen.glam',ref:4,conv:2,earned:'800',st:'جديد',stc:'gold'},
  ];
  A.marketers={ render(){ return `
<style>
  .m-kpi{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:22px;}@media(max-width:760px){.m-kpi{grid-template-columns:1fr;}}
  .mtable{background:var(--surface);border:1px solid var(--line);border-radius:16px;overflow:hidden;}
  .mth,.mtr{display:grid;grid-template-columns:0.4fr 2fr 1fr 1fr 1.1fr 1fr;gap:12px;align-items:center;padding:14px 20px;}
  .mth{background:var(--surface2);border-bottom:1px solid var(--line);font-size:11.5px;color:var(--gold);font-weight:600;}
  .mtr{border-bottom:1px solid var(--line-soft);}.mtr:last-child{border-bottom:none;}.mtr:hover{background:var(--surface2);}
  .mtr .rk{font-family:'Bodoni Moda',serif;font-size:20px;color:var(--gold-deep);direction:ltr;}
  .mtr .who{display:flex;align-items:center;gap:11px;}.mtr .who .n{font-size:13.5px;color:var(--white);font-weight:500;}.mtr .who .h{font-size:11.5px;color:var(--gold-pale);direction:ltr;text-align:right;}
  .avx{width:36px;height:36px;border-radius:50%;background:var(--surface3);border:0.5px solid var(--gold-deep);display:flex;align-items:center;justify-content:center;font-family:'Bodoni Moda',serif;color:var(--gold-light);font-size:15px;}
  .mtr .num{font-family:'Bodoni Moda',serif;font-size:18px;color:var(--white);direction:ltr;} .mtr .earn{font-family:'Bodoni Moda',serif;font-size:18px;color:var(--gold-light);direction:ltr;}
  @media(max-width:1080px){.mth{display:none;}.mtr{grid-template-columns:auto 1fr auto;}.mtr .hide{display:none;}}
</style>
<div class="m-kpi">
  <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('pulse',19)}</div><div class="delta up">▲ 5</div></div><div class="val">34</div><div class="k">مسوّق نشط</div></div>
  <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('users',19)}</div></div><div class="val">128</div><div class="k">إحالة هذا الشهر</div></div>
  <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('wallet',19)}</div></div><div class="val">18,600<span class="u">ر.س</span></div><div class="k">عمولات مدفوعة للمسوّقين</div></div>
</div>
<div class="sec-label">لوحة الصدارة <span class="ln"></span><span class="more">+ دعوة مسوّق</span></div>
<div class="mtable">
  <div class="mth"><span>#</span><span>المسوّق</span><span>الإحالات</span><span>تحويلات</span><span>العمولة</span><span>الحالة</span></div>
  ${MK.map((m,i)=>`<div class="mtr"><span class="rk">${i+1}</span><div class="who">${avc(m.n)}<div><div class="n">${m.n}</div><div class="h">${m.h}</div></div></div><span class="num hide">${m.ref}</span><span class="num hide">${m.conv}</span><span class="earn hide">${m.earned} ر.س</span><span class="hide"><span class="badge ${m.stc}">${m.st}</span></span></div>`).join('')}
</div>`; }};

  /* ════════ MARKETER COMMISSION EDITORS ════════ */
  window.LUX_mkRate=function(i){
    if(!window.LUX)return;const m=MKCOM[i];
    const body=`<div class="lux-pr" style="border-bottom:1px solid var(--line,#1b1a21)"><span class="lux-av">${m.n.charAt(0)}</span><div style="flex:1"><div class="nm">${m.n}</div><div class="bk">${m.h}</div></div></div>
      <div class="lux-lead" style="margin-top:14px">نسبة العمولة التي تأخذها <b style="color:#f6f2ec">${m.n}</b> من المبيعات التي تجلبها.</div>
      <div class="lux-f"><label>نسبة العمولة (%)</label><div style="display:flex;align-items:center;gap:12px"><input type="range" min="0" max="25" step="0.5" value="${m.rate}" id="mkr" style="flex:1"/><div style="display:flex;align-items:center;gap:4px;background:#0e0d11;border:1px solid var(--line,#1b1a21);border-radius:8px;padding:8px 10px;min-width:64px;justify-content:center"><input id="mkn" value="${m.rate}" dir="ltr" style="width:34px;background:none;border:none;color:var(--gold-light,#ccab64);font-family:'IBM Plex Mono',monospace;text-align:center;outline:none"/><span style="color:#86818d">%</span></div></div></div>
      <div class="lux-row"><span class="k">العمولة على مبيعات ${m.sales.toLocaleString('en')} ر.س</span><span class="v" id="mkc" style="color:var(--gold-light,#ccab64)">—</span></div>
      <div class="lux-foot" style="margin-top:10px"><button class="lux-btn lux-ghost" data-c style="flex:1">إلغاء</button><button class="lux-btn lux-gold" data-s style="flex:1.4">حفظ</button></div>`;
    window.LUX.modal('تعديل عمولة المسوّقة',body,{onMount(ov,close){
      const r=ov.querySelector('#mkr'),n=ov.querySelector('#mkn'),c=ov.querySelector('#mkc');
      const up=()=>c.textContent=Math.round(m.sales*(parseFloat(n.value)||0)/100).toLocaleString('en')+' ر.س';
      r.oninput=()=>{n.value=r.value;up();};n.oninput=()=>{r.value=n.value;up();};up();
      ov.querySelector('[data-c]').onclick=close;
      ov.querySelector('[data-s]').onclick=()=>{m.rate=Math.max(0,Math.min(25,parseFloat(n.value)||0));close();window.ADMIN&&window.ADMIN.go('commissions');window.LUX.toast('تم تحديث عمولة '+m.n+' إلى '+m.rate+'% ✓','ok');};
    }});
  };
  window.LUX_mkDefault=function(){
    if(!window.LUX)return;
    const body=`<div class="lux-lead">طبّقي نسبة عمولة موحّدة على جميع المسوّقات (يمكن تخصيص كل واحدة لاحقًا من سطرها).</div>
      <div class="lux-f"><label>النسبة الافتراضية للمسوّقات (%)</label><input id="mkd" value="10" dir="ltr" style="text-align:right"/></div>
      <div class="lux-foot"><button class="lux-btn lux-ghost" data-c style="flex:1">إلغاء</button><button class="lux-btn lux-gold" data-s style="flex:1.4">تطبيق على الجميع</button></div>`;
    window.LUX.modal('النسبة الافتراضية للمسوّقات',body,{onMount(ov,close){
      ov.querySelector('[data-c]').onclick=close;
      ov.querySelector('[data-s]').onclick=()=>{const v=Math.max(0,Math.min(25,parseFloat(ov.querySelector('#mkd').value)||10));MKCOM.forEach(m=>m.rate=v);close();window.ADMIN&&window.ADMIN.go('commissions');window.LUX.toast('تم تطبيق '+v+'% على جميع المسوّقات ✓','ok');};
    }});
  };

  /* ════════ PAYOUTS (تنفيذ التحويلات — يحدّث جدول المدفوعات) ════════ */
  const PAYDUE=[
    {n:'رهف العتيبي',bank:'الراجحي ····2291',amount:17150},
    {n:'لمياء الزهراني',bank:'الأهلي ····8842',amount:12300},
    {n:'دانة الشهري',bank:'الإنماء ····5570',amount:9840},
    {n:'نورة القحطاني',bank:'الراجحي ····3380',amount:9300},
    {n:'ريم العنزي',bank:'بنك البلاد ····1120',amount:6420},
    {n:'سارة الغامدي',bank:'الراجحي ····7765',amount:5400},
  ];
  window.LUX_payouts=function(){
    if(!window.LUX)return;
    const due=PAYDUE.filter(p=>!p.done).map(p=>({...p,sel:true}));
    if(!due.length){window.LUX.toast('لا توجد تحويلات مستحقّة حاليًا ✓','ok');return;}
    const fmt=n=>n.toLocaleString('en');
    const selTotal=()=>due.filter(p=>p.sel).reduce((s,p)=>s+p.amount,0);
    const selCount=()=>due.filter(p=>p.sel).length;
    const rows=()=>due.map((p,i)=>`<div class="lux-pr"><button type="button" class="lux-ck on" data-ck="${i}">✓</button><div><div class="nm">${p.n}</div><div class="bk">${p.bank}</div></div><div class="amt">${fmt(p.amount)} ر.س</div></div>`).join('');
    const body=`<div class="lux-lead">يوجد <b style="color:#f6f2ec">${due.length} تحويلًا</b> مستحقًا للمزوّدين. عند التنفيذ تتحوّل حالتها في جدول المدفوعات إلى «مكتمل».</div>
      <div class="lux-pr" style="border-bottom:1px solid var(--line,#1b1a21)"><button type="button" class="lux-ck on" id="luxAll">✓</button><div class="nm">تحديد الكل</div></div>
      <div id="luxRows">${rows()}</div>
      <div class="lux-row" style="margin-top:8px"><span class="k">الإجمالي المحدد</span><span class="v" id="luxSum" style="color:var(--gold-light,#ccab64);font-family:'Bodoni Moda',serif;font-size:20px">${fmt(selTotal())} ر.س</span></div>
      <div class="lux-foot" style="margin-top:14px"><button class="lux-btn lux-ghost" data-cancel style="flex:1">إلغاء</button><button class="lux-btn lux-gold" data-go style="flex:1.4">تنفيذ <span id="luxGoN">${selCount()}</span> تحويل</button></div>`;
    window.LUX.modal('تنفيذ التحويلات للمزوّدين',body,{onMount(ov,close){
      const sumEl=ov.querySelector('#luxSum'),goN=ov.querySelector('#luxGoN'),allBtn=ov.querySelector('#luxAll');
      const refresh=()=>{sumEl.textContent=fmt(selTotal())+' ر.س';goN.textContent=selCount();allBtn.classList.toggle('on',selCount()===due.length);};
      ov.querySelectorAll('[data-ck]').forEach(b=>b.onclick=()=>{const i=+b.dataset.ck;due[i].sel=!due[i].sel;b.classList.toggle('on',due[i].sel);refresh();});
      allBtn.onclick=()=>{const all=selCount()!==due.length;due.forEach(p=>p.sel=all);ov.querySelectorAll('[data-ck]').forEach(b=>b.classList.toggle('on',all));refresh();};
      ov.querySelector('[data-cancel]').onclick=close;
      ov.querySelector('[data-go]').onclick=()=>{
        const chosen=due.filter(p=>p.sel);
        if(!chosen.length){window.LUX.toast('اختاري تحويلًا واحدًا على الأقل','err');return;}
        const total=chosen.reduce((s,p)=>s+p.amount,0),cnt=chosen.length;
        const b=ov.querySelector('.lux-b');
        b.innerHTML=`<div style="text-align:center;padding:14px 0"><div class="lux-spin"></div><div style="color:#f6f2ec;font-size:15px;font-weight:500">جارٍ تنفيذ ${cnt} تحويل…</div><div style="color:#86818d;font-size:12.5px;margin-top:6px">يتم التحقق عبر بوابة الدفع</div></div>`;
        setTimeout(()=>{
          chosen.forEach(p=>{
            const ex=TX.find(t=>t.dir==='out'&&t.st!=='مكتمل'&&t.n===p.n);
            if(ex){ex.st='مكتمل';ex.stc='green';ex.when='الآن';}
            else{TX.unshift({n:p.n,t:'تحويل أرباح',m:'تحويل بنكي',a:p.amount,dir:'out',st:'مكتمل',stc:'green',when:'الآن'});}
            const src=PAYDUE.find(x=>x.n===p.n);if(src)src.done=true;
          });
          const ref='PAYOUT-'+Math.floor(100000+Math.random()*900000);
          b.innerHTML=`<div style="text-align:center"><div class="lux-ok">✓</div><h3 style="color:#f6f2ec;font-size:20px;font-weight:600;margin:0">تم تنفيذ التحويلات ✨</h3><div style="color:var(--gold-pale,#e6ce95);font-size:13.5px;margin-top:8px">حُوّل <b style="color:#f6f2ec">${fmt(total)} ر.س</b> إلى <b style="color:#f6f2ec">${cnt}</b> مزوّدة، وتم تحديث حالتها إلى «مكتمل».</div></div>
            <div class="lux-row" style="margin-top:18px"><span class="k">رقم الدفعة</span><span class="v" style="font-family:'IBM Plex Mono',monospace;color:var(--gold-light,#ccab64)">${ref}</span></div>
            ${chosen.map(p=>`<div class="lux-pr done"><span style="color:#6fa86a;font-size:15px">✓</span><div><div class="nm">${p.n}</div><div class="bk">${p.bank}</div></div><div class="amt">${fmt(p.amount)} ر.س</div></div>`).join('')}
            <button class="lux-btn lux-gold" data-done style="margin-top:16px">عرض المدفوعات المحدّثة</button>`;
          b.querySelector('[data-done]').onclick=()=>{close();window.ADMIN&&window.ADMIN.go('payments');};
          window.LUX.toast('تم تنفيذ '+cnt+' تحويل بقيمة '+fmt(total)+' ر.س ✓','ok');
        },1100);
      };
    }});
  };
})();
