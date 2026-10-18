/* LUMA admin — Plans & Settings */
(function(){
  const A = window.LUMA_ADMIN = window.LUMA_ADMIN || {};

  /* ════════ PLANS ════════ */
  const PLANS=[
    {nm:'سَناء',mean:'الرفعة في البدايات',price:'199',com:'12%',subs:50,feats:['صفحة استوديو','حجز ذكي','دفع مسبق','معرض ٢٠ صورة','٤٠ حجزة/شهر'],hot:false},
    {nm:'وَهَج',mean:'الضوء الذي يملأ الفضاء',price:'399',com:'10%',subs:86,feats:['كل مميزات سَناء','واتساب تلقائي','كوبونات وعروض','معرض غير محدود','تحليلات متقدمة'],hot:true},
    {nm:'فَرِيد',mean:'لا مثيل له في صنعته',price:'799',com:'8%',subs:28,feats:['كل مميزات وَهَج','برنامج ولاء','حجوزات جماعية','مساعد AI كامل','مدير حساب مخصص'],hot:false},
  ];
  const OFFERS=[
    {t:'عرض التأسيس',d:'وَهَج بـ ٢٩٩ ر.س — لأول ١٠٠ مشتركة',meta:'مُفعّل · ٦٤ مقعد متبقٍ',active:true},
    {t:'الجمعة البيضاء',d:'خصم ٣٠٪ على الاشتراك السنوي لكل الباقات',meta:'مجدول · يبدأ ٢٨ نوفمبر',active:false},
  ];
  A.plans={ render(){ return `
<style>
  .pl-top{display:flex;align-items:center;justify-content:space-between;margin-bottom:22px;flex-wrap:wrap;gap:14px;}
  .pl-top .h{font-family:'IBM Plex Sans Arabic','Cairo',sans-serif;font-weight:600;font-size:20px;color:var(--white);} .pl-top .s{font-size:13px;color:var(--gold-pale);margin-top:3px;}
  .pl-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;}@media(max-width:980px){.pl-grid{grid-template-columns:1fr;}}
  .plan{position:relative;background:linear-gradient(165deg,var(--surface2),var(--surface));border:1px solid var(--line);border-radius:18px;padding:26px 24px;display:flex;flex-direction:column;}
  .plan.hot{border-color:var(--gold-deep);}
  .plan .tag{position:absolute;top:-11px;right:24px;background:linear-gradient(120deg,#dbbd81,#9c8047);color:#131217;font-size:11px;font-weight:600;padding:5px 14px;border-radius:20px;}
  .plan .nm{font-family:'IBM Plex Sans Arabic','Cairo',sans-serif;font-weight:700;font-size:30px;color:var(--white);}
  .plan .mean{font-family:'Bodoni Moda',serif;font-style:italic;font-size:15px;color:var(--gold-pale);direction:ltr;text-align:right;}
  .plan .price{display:flex;align-items:baseline;gap:6px;margin:16px 0 4px;}
  .plan .price .v{font-family:'Bodoni Moda',serif;font-size:48px;color:var(--gold-light);direction:ltr;} .plan .price .u{font-size:13px;color:var(--muted);}
  .plan .com{font-size:12.5px;color:var(--gold-pale);}
  .plan .subs{display:flex;align-items:center;justify-content:space-between;margin:18px 0;padding:14px 0;border-top:1px solid var(--line-soft);border-bottom:1px solid var(--line-soft);}
  .plan .subs .n{font-family:'Bodoni Moda',serif;font-size:30px;color:var(--white);direction:ltr;} .plan .subs .l{font-size:12.5px;color:var(--muted);}
  .plan ul{list-style:none;display:flex;flex-direction:column;gap:10px;flex:1;}
  .plan ul li{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--cream);} .plan ul li .c{color:var(--gold);font-size:12px;}
  .plan .ed{margin-top:18px;}
</style>
<div class="pl-top"><div><div class="h">باقات الاشتراك</div><div class="s">١٦٤ مشترك نشط · إيراد اشتراكات شهري ٤٠٬٢٠٠ ر.س</div></div><div style="display:flex;gap:10px"><button class="btn btn-ghost" onclick="LUX_planNew&&LUX_planNew()">+ باقة جديدة</button><button class="btn btn-gold" onclick="LUX_planPrices&&LUX_planPrices()">تعديل الأسعار</button></div></div>
<div class="pl-grid">
  ${PLANS.map((p,pi)=>`<div class="plan ${p.hot?'hot':''}">${p.hot?'<span class="tag">الأكثر اشتراكاً</span>':''}
    <div class="nm">${p.nm}</div><div class="mean">${p.mean}</div>
    <div class="price"><span class="v">${p.price}</span><span class="u">ر.س / شهر</span></div>
    <div class="com">عمولة الحجوزات: ${p.com}</div>
    <div class="subs"><div><div class="n">${p.subs}</div><div class="l">مشترك نشط</div></div><div style="text-align:left"><div class="n" style="color:var(--gold-light)">${(p.subs*p.price).toLocaleString('en')}</div><div class="l">ر.س / شهر</div></div></div>
    <ul>${p.feats.map(f=>`<li><span class="c">◆</span>${f}</li>`).join('')}</ul>
    <button class="btn btn-ghost ed" style="justify-content:center" onclick="LUX_planEdit&&LUX_planEdit(${pi})">تحرير الباقة</button>
  </div>`).join('')}
</div>
<div class="card" style="margin-top:20px">
  <div class="sec-label">العروض الترويجية <span class="ln"></span><span class="more" onclick="LUX_offerNew&&LUX_offerNew()">+ إضافة عرض</span></div>
  ${OFFERS.map((o,oi)=>`<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px;padding:14px 0;border-bottom:1px solid var(--line-soft)">
    <div style="display:flex;align-items:center;gap:14px"><div style="width:46px;height:46px;border-radius:12px;background:rgba(156,124,58,0.16);border:0.5px solid var(--gold-deep);display:flex;align-items:center;justify-content:center;color:var(--gold-light)">${icon('star',22)}</div><div><div style="font-size:15px;color:var(--white);font-weight:600">${o.t} <span class="badge ${o.active?'green':'gold'}" style="margin-right:6px">${o.active?'مُفعّل':'مجدول'}</span></div><div style="font-size:12.5px;color:var(--gold-pale);margin-top:2px">${o.d}</div><div style="font-size:11.5px;color:var(--muted);margin-top:1px">${o.meta}</div></div></div>
    <button class="btn btn-ghost" onclick="LUX_offerEdit&&LUX_offerEdit(${oi})">إدارة العرض</button>
  </div>`).join('')}
</div>`; }};

  /* ════════ SETTINGS ════════ */
  const TOG=[
    {t:'قبول طلبات الانضمام الجديدة',d:'السماح بتسجيل مزوّدات جدد',on:true},
    {t:'التوثيق الإلزامي (KYC)',d:'طلب توثيق الهوية قبل التفعيل',on:true},
    {t:'الموافقة اليدوية على المزوّدات',d:'مراجعة كل طلب قبل النشر',on:true},
    {t:'وضع الصيانة',d:'إيقاف المنصة مؤقتاً للزوّار',on:false},
  ];
  const TEAM=[
    {n:'مبارك المالكي',role:'مالك · صلاحية كاملة',c:'gold'},
    {n:'سهام حمدي',role:'مديرة تشغيل',c:'soft'},
    {n:'نوف الزهراني',role:'دعم ومراجعة',c:'soft'},
  ];
  A.settings={ render(){ return `
<style>
  .set-grid{display:grid;grid-template-columns:1.2fr 1fr;gap:18px;align-items:start;}@media(max-width:1000px){.set-grid{grid-template-columns:1fr;}}
  .srow{display:flex;align-items:center;gap:14px;padding:15px 0;border-bottom:1px solid var(--line-soft);}.srow:last-child{border-bottom:none;}
  .srow .ti{flex:1;}.srow .ti .n{font-size:14.5px;color:var(--white);font-weight:500;}.srow .ti .d{font-size:12.5px;color:var(--muted);margin-top:1px;}
  .toggle{width:46px;height:27px;border-radius:20px;border:none;cursor:pointer;position:relative;transition:background .25s;flex-shrink:0;}
  .toggle.on{background:linear-gradient(120deg,#dbbd81,#9c8047);}.toggle.off{background:var(--surface3);}
  .toggle .k{position:absolute;top:3px;width:21px;height:21px;border-radius:50%;background:#fff;transition:.25s;}.toggle.on .k{left:3px;}.toggle.off .k{right:3px;}
  .frow{display:flex;flex-direction:column;gap:7px;margin-bottom:16px;}.frow label{font-size:13px;color:var(--gold-pale);font-weight:500;}
  .inp{background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:12px 14px;color:var(--white);font-family:'IBM Plex Sans Arabic','Cairo',sans-serif;font-size:14px;outline:none;width:100%;}.inp:focus{border-color:var(--gold-deep);}
  .two{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
  .trow{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--line-soft);}.trow:last-child{border-bottom:none;}
  .trow .av{width:36px;height:36px;border-radius:10px;background:var(--surface3);border:0.5px solid var(--line);display:flex;align-items:center;justify-content:center;font-family:'Bodoni Moda',serif;color:var(--gold-light);font-size:15px;}
  .trow .info{flex:1;}.trow .info .n{font-size:14px;color:var(--white);font-weight:500;}.trow .info .r{font-size:12px;color:var(--muted);}
</style>
<div class="set-grid">
  <div>
    <div class="card" style="margin-bottom:18px"><div class="sec-label">إعدادات المنصة <span class="ln"></span></div>
      ${TOG.map(t=>`<div class="srow"><div class="ti"><div class="n">${t.t}</div><div class="d">${t.d}</div></div><button class="toggle ${t.on?'on':'off'}" onclick="this.classList.toggle('on');this.classList.toggle('off')"><span class="k"></span></button></div>`).join('')}
    </div>
    <div class="card"><div class="sec-label">عمولة المسوّقين الافتراضية <span class="ln"></span></div>
      <div class="frow"><label>النسبة الافتراضية للمسوّقات (%)</label><input class="inp" dir="ltr" style="text-align:right" value="10%"/></div>
      <div style="font-size:12px;color:var(--muted);margin:8px 0 12px;line-height:1.7">عمولات الباقات (سَناء / وَهَج / فَرِيد) تُعدَّل مباشرةً من <b style="color:var(--gold-pale)">صفحة كل باقة</b> في قسم «الباقات» — وعمولات المسوّقات تُدار من شاشة «العمولات».</div>
      <button class="btn btn-gold" style="margin-top:2px">حفظ الإعدادات</button>
    </div>
  </div>
  <div>
    <div class="card" style="margin-bottom:18px"><div class="sec-label">فريق الإدارة <span class="ln"></span><span class="more" onclick="LUX_teamInvite&&LUX_teamInvite()">+ دعوة</span></div>
      ${TEAM.map((t,ti)=>`<div class="trow"><div class="av">${t.n.charAt(0)}</div><div class="info"><div class="n">${t.n}</div><div class="r">${t.role}</div></div><button class="btn btn-ghost" style="padding:7px 14px" onclick="LUX_teamEdit&&LUX_teamEdit(${ti})">تحرير</button></div>`).join('')}
    </div>
    <div class="card"><div class="sec-label">معلومات المنصة <span class="ln"></span></div>
      <div class="frow"><label>اسم المنصة</label><input class="inp" value="LUMA"/></div>
      <div class="frow"><label>الجهة المالكة</label><input class="inp" value="قمة كود"/></div>
      <div class="frow"><label>بوابة الدفع</label><input class="inp" dir="ltr" style="text-align:right" value="Moyasar · mada + Apple Pay"/></div>
    </div>
  </div>
</div>`; }};

  /* ════════ PLAN EDITORS (professional) ════════ */
  function planBody(p){
    return `
    <div class="lux-lead">تحرير بيانات الباقة كما تظهر للمزوّدات في صفحة الأسعار.</div>
    <div class="lux-f"><label>اسم الباقة</label><input id="pe-nm" value="${p.nm}"/></div>
    <div class="lux-f"><label>المعنى (سطر تعريفي)</label><input id="pe-mean" value="${p.mean}"/></div>
    <div class="lux-two">
      <div class="lux-f"><label>السعر الشهري (ر.س)</label><input id="pe-price" dir="ltr" style="text-align:right" value="${p.price}"/></div>
      <div class="lux-f"><label>عمولة الحجوزات (%)</label><input id="pe-com" dir="ltr" style="text-align:right" value="${parseInt(p.com)}"/></div>
    </div>
    <div class="lux-f"><label>المميزات (ميزة في كل سطر)</label><textarea id="pe-feats" rows="6">${p.feats.join('\n')}</textarea></div>
    <div class="lux-pr" style="border-bottom:none;padding-top:2px"><button type="button" id="pe-hot" class="lux-ck ${p.hot?'on':''}">✓</button><div class="nm">تمييزها كـ «الأكثر اشتراكاً»</div></div>
    <div class="lux-foot" style="margin-top:8px"><button class="lux-btn lux-ghost" data-c style="flex:1">إلغاء</button><button class="lux-btn lux-gold" data-s style="flex:1.4">حفظ التعديلات</button></div>`;
  }
  window.LUX_planEdit=function(i){
    if(!window.LUX){return;}
    const p=PLANS[i];
    window.LUX.modal('تحرير باقة «'+p.nm+'»',planBody(p),{onMount(ov,close){
      let hot=p.hot;const hb=ov.querySelector('#pe-hot');hb.onclick=()=>{hot=!hot;hb.classList.toggle('on',hot);};
      ov.querySelector('[data-c]').onclick=close;
      ov.querySelector('[data-s]').onclick=()=>{
        const nm=ov.querySelector('#pe-nm').value.trim();if(!nm){window.LUX.toast('أدخلي اسم الباقة','err');return;}
        p.nm=nm;p.mean=ov.querySelector('#pe-mean').value.trim();
        p.price=(ov.querySelector('#pe-price').value.replace(/[^0-9]/g,''))||p.price;
        p.com=((ov.querySelector('#pe-com').value.replace(/[^0-9]/g,''))||parseInt(p.com))+'%';
        p.feats=ov.querySelector('#pe-feats').value.split('\n').map(s=>s.trim()).filter(Boolean);
        if(!p.hot&&hot)PLANS.forEach(x=>x.hot=false); p.hot=hot;
        close();window.ADMIN&&window.ADMIN.go('plans');window.LUX.toast('تم حفظ باقة «'+p.nm+'» ✓','ok');
      };
    }});
  };
  window.LUX_planPrices=function(){
    if(!window.LUX)return;
    const body=`<div class="lux-lead">تعديل سريع لأسعار وعمولات جميع الباقات دفعة واحدة.</div>
      ${PLANS.map((p,i)=>`<div class="lux-pr"><div style="flex:1"><div class="nm">${p.nm}</div><div class="bk" style="direction:rtl;text-align:right">${p.subs} مشترك</div></div>
        <div style="display:flex;gap:8px">
          <div style="display:flex;align-items:center;gap:4px;background:#0e0d11;border:1px solid var(--line,#1b1a21);border-radius:8px;padding:7px 8px"><input data-price="${i}" value="${p.price}" dir="ltr" style="width:50px;background:none;border:none;color:#f6f2ec;font-family:'IBM Plex Mono',monospace;text-align:center;outline:none"/><span style="color:#86818d;font-size:11px">ر.س</span></div>
          <div style="display:flex;align-items:center;gap:4px;background:#0e0d11;border:1px solid var(--line,#1b1a21);border-radius:8px;padding:7px 8px"><input data-com="${i}" value="${parseInt(p.com)}" dir="ltr" style="width:32px;background:none;border:none;color:var(--gold-light,#ccab64);font-family:'IBM Plex Mono',monospace;text-align:center;outline:none"/><span style="color:#86818d;font-size:11px">%</span></div>
        </div></div>`).join('')}
      <div class="lux-foot" style="margin-top:14px"><button class="lux-btn lux-ghost" data-c style="flex:1">إلغاء</button><button class="lux-btn lux-gold" data-s style="flex:1.4">حفظ الأسعار</button></div>`;
    window.LUX.modal('تعديل أسعار الباقات',body,{onMount(ov,close){
      ov.querySelector('[data-c]').onclick=close;
      ov.querySelector('[data-s]').onclick=()=>{
        PLANS.forEach((p,i)=>{const pr=ov.querySelector('[data-price="'+i+'"]').value.replace(/[^0-9]/g,'');const cm=ov.querySelector('[data-com="'+i+'"]').value.replace(/[^0-9]/g,'');if(pr)p.price=pr;if(cm)p.com=cm+'%';});
        close();window.ADMIN&&window.ADMIN.go('plans');window.LUX.toast('تم تحديث أسعار الباقات ✓','ok');
      };
    }});
  };
  window.LUX_planNew=function(){
    if(!window.LUX)return;
    PLANS.push({nm:'باقة جديدة',mean:'',price:'0',com:'10%',subs:0,feats:[],hot:false});
    window.LUX_planEdit(PLANS.length-1);
  };

  /* ════════ OFFERS ════════ */
  function offerBody(o){
    return `<div class="lux-lead">عرض ترويجي يظهر للمزوّدات في صفحة الباقات.</div>
      <div class="lux-f"><label>اسم العرض</label><input id="of-t" value="${o?o.t:''}" placeholder="مثال: عرض رمضان"/></div>
      <div class="lux-f"><label>تفاصيل العرض</label><input id="of-d" value="${o?o.d:''}" placeholder="مثال: خصم ٢٠٪ على الاشتراك السنوي"/></div>
      <div class="lux-f"><label>ملاحظة الحالة</label><input id="of-m" value="${o?o.meta:''}" placeholder="مثال: مُفعّل · ٥٠ مقعد متبقٍ"/></div>
      <div class="lux-pr" style="border-bottom:none;padding-top:2px"><button type="button" id="of-a" class="lux-ck ${(!o||o.active)?'on':''}">✓</button><div class="nm">تفعيل العرض الآن</div></div>
      <div class="lux-foot" style="margin-top:8px"><button class="lux-btn lux-ghost" data-c style="flex:1">إلغاء</button><button class="lux-btn lux-gold" data-s style="flex:1.4">${o?'حفظ العرض':'إضافة العرض'}</button></div>`;
  }
  function offerModal(title,o,onSave){
    window.LUX.modal(title,offerBody(o),{onMount(ov,close){
      let active=o?o.active:true;const ab=ov.querySelector('#of-a');ab.onclick=()=>{active=!active;ab.classList.toggle('on',active);};
      ov.querySelector('[data-c]').onclick=close;
      ov.querySelector('[data-s]').onclick=()=>{
        const t=ov.querySelector('#of-t').value.trim();if(!t){window.LUX.toast('أدخلي اسم العرض','err');return;}
        onSave({t,d:ov.querySelector('#of-d').value.trim(),meta:ov.querySelector('#of-m').value.trim()||(active?'مُفعّل':'مجدول'),active});
        close();window.ADMIN&&window.ADMIN.go('plans');window.LUX.toast('تم حفظ العرض ✓','ok');
      };
    }});
  }
  window.LUX_offerNew=function(){if(!window.LUX)return;offerModal('إضافة عرض جديد',null,o=>OFFERS.unshift(o));};
  window.LUX_offerEdit=function(i){if(!window.LUX)return;offerModal('إدارة العرض',OFFERS[i],o=>Object.assign(OFFERS[i],o));};

  /* ════════ TEAM & PERMISSIONS ════════ */
  const PERMS=['لوحة التحكّم','مزوّدو الخدمة','الحجوزات','المالية والمدفوعات','العمولات','المسوّقون','الباقات والعروض','التقارير','الإعدادات','فريق الإدارة'];
  const ROLES=['مالك · صلاحية كاملة','مديرة تشغيل','محاسِبة','دعم ومراجعة','مسوّقة'];
  function teamBody(t){
    const full=!t||/مالك/.test(t.role);
    const granted=full?PERMS:(t&&t._perms)||['لوحة التحكّم','الحجوزات','مزوّدو الخدمة'];
    return `<div class="lux-pr" style="border-bottom:1px solid var(--line,#1b1a21)"><span class="lux-av">${t?t.n.charAt(0):'+'}</span><div style="flex:1"><div class="nm">${t?t.n:'عضو جديد'}</div><div class="bk" style="direction:rtl;text-align:right">${t?t.role:'تعيين دور وصلاحيات'}</div></div></div>
      <div class="lux-two" style="margin-top:14px"><div class="lux-f"><label>الاسم</label><input id="tm-n" value="${t?t.n:''}"/></div><div class="lux-f"><label>البريد</label><input id="tm-e" dir="ltr" style="text-align:right" value="${t&&t.email?t.email:''}" placeholder="name@luma.sa"/></div></div>
      <div class="lux-f"><label>الدور</label><select id="tm-r">${ROLES.map(r=>`<option ${t&&t.role===r?'selected':''}>${r}</option>`).join('')}</select></div>
      <div class="lux-f"><label>الصلاحيات</label><div class="lux-chips" id="tm-p">${PERMS.map(p=>`<button type="button" class="lux-chip ${granted.indexOf(p)>-1?'on':''}" data-v="${p}">${p}</button>`).join('')}</div></div>
      <div class="lux-foot" style="margin-top:8px"><button class="lux-btn lux-ghost" data-c style="flex:1">إلغاء</button><button class="lux-btn lux-gold" data-s style="flex:1.4">${t?'حفظ الصلاحيات':'إرسال الدعوة'}</button></div>`;
  }
  function teamModal(title,t,save){
    window.LUX.modal(title,teamBody(t),{onMount(ov,close){
      ov.querySelectorAll('#tm-p .lux-chip').forEach(c=>c.onclick=()=>c.classList.toggle('on'));
      ov.querySelector('[data-c]').onclick=close;
      ov.querySelector('[data-s]').onclick=()=>{
        const n=ov.querySelector('#tm-n');if(!n.value.trim()){n.style.borderColor='#c0566a';n.focus();return;}
        const perms=[...ov.querySelectorAll('#tm-p .lux-chip.on')].map(c=>c.dataset.v);
        save({n:n.value.trim(),role:ov.querySelector('#tm-r').value,email:ov.querySelector('#tm-e').value.trim(),_perms:perms});
        close();window.ADMIN&&window.ADMIN.go('settings');
        window.LUX.toast((t?'تم تحديث صلاحيات ':'تم إرسال دعوة ')+n.value.trim()+' · '+perms.length+' صلاحية ✓','ok');
      };
    }});
  }
  window.LUX_teamEdit=function(i){if(!window.LUX)return;teamModal('تحرير عضو الفريق',TEAM[i],d=>Object.assign(TEAM[i],d));};
  window.LUX_teamInvite=function(){if(!window.LUX)return;teamModal('دعوة عضو إدارة',null,d=>{d.c='soft';TEAM.push(d);});};

  /* ════════ REPORTS ════════ */
  const REPGROUPS=[
    {g:'المالية',ic:'wallet',items:[
      {k:'تقرير الإيرادات الشهري',d:'اشتراكات + عمولات مبوّبة حسب الشهر'},
      {k:'كشف المدفوعات والتحويلات',d:'كل الحركات الواردة والصادرة'},
      {k:'تقرير العمولات',d:'عمولة المنصة وعمولات المسوّقات'},
      {k:'إقرار ضريبة القيمة المضافة (15%)',d:'الضريبة المستحقّة للفترة'},
      {k:'الأرباح المستحقّة للمزوّدات',d:'المبالغ القابلة للتحويل'},
      {k:'قائمة الدخل (P&L)',d:'الإيراد مقابل المصروف وصافي الربح'},
    ]},
    {g:'الحجوزات والخدمات',ic:'calendar',items:[
      {k:'تقرير الحجوزات',d:'مكتملة / ملغاة / قادمة حسب الفترة'},
      {k:'الخدمات الأكثر طلبًا',d:'ترتيب الخدمات حسب عدد الحجوزات'},
      {k:'معدّل الإتمام والإلغاء',d:'مؤشرات جودة الحجز'},
      {k:'أوقات الذروة',d:'توزيع الحجوزات على الأيام والساعات'},
    ]},
    {g:'المزوّدون',ic:'users',items:[
      {k:'تقرير أداء المزوّدات',d:'مبيعات وتقييمات كل مزوّدة'},
      {k:'النمو والتوثيق',d:'انضمام جديد وحالات التوثيق'},
      {k:'التوزيع الجغرافي',d:'المزوّدات حسب المدينة'},
      {k:'توزيع الاشتراكات على الباقات',d:'سَناء / وَهَج / فَرِيد'},
    ]},
    {g:'النمو والتسويق',ic:'pulse',items:[
      {k:'أداء المسوّقات',d:'الإحالات والتحويلات والعمولات'},
      {k:'اكتساب العميلات',d:'مصادر العميلات الجديدة'},
      {k:'الاحتفاظ والولاء',d:'تكرار الحجز وبرنامج الولاء'},
    ]},
  ];
  A.reports={ render(){ return `
<style>
  .rp-top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:20px;flex-wrap:wrap;}
  .rp-top .s{font-size:13.5px;color:var(--gold-pale);}
  .rp-grp{margin-bottom:24px;}
  .rp-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;}@media(max-width:1000px){.rp-cards{grid-template-columns:1fr 1fr;}}@media(max-width:680px){.rp-cards{grid-template-columns:1fr;}}
  .rp-card{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:18px;display:flex;flex-direction:column;gap:6px;transition:border-color .25s,transform .25s;}
  .rp-card:hover{border-color:var(--gold-deep);transform:translateY(-3px);}
  .rp-card .ic{width:40px;height:40px;border-radius:10px;background:rgba(156,124,58,0.14);border:0.5px solid var(--gold-deep);display:flex;align-items:center;justify-content:center;color:var(--gold-light);margin-bottom:6px;}
  .rp-card .t{font-size:14.5px;color:var(--white);font-weight:600;}
  .rp-card .d{font-size:12.5px;color:var(--muted);flex:1;line-height:1.6;}
  .rp-card .b{display:flex;gap:8px;margin-top:10px;}
  .rp-card .gen{flex:1;background:linear-gradient(120deg,#dbbd81,#9c8047);color:#131217;border:none;border-radius:8px;padding:9px;font-family:'IBM Plex Sans Arabic','Cairo',sans-serif;font-size:13px;font-weight:600;cursor:pointer;}
  .rp-card .csv{background:none;border:1px solid var(--line);color:var(--gold-pale);border-radius:8px;padding:9px 12px;font-family:'IBM Plex Sans Arabic','Cairo',sans-serif;font-size:12.5px;cursor:pointer;}.rp-card .csv:hover{border-color:var(--gold-deep);color:var(--gold-light);}
</style>
<div class="rp-top">
  <div class="s">مركز التقارير — وَلّدي أي تقرير حسب الفترة، وصدّريه CSV/PDF أو اعرضيه مباشرة.</div>
  <button class="btn btn-gold" onclick="LUX_reportGen&&LUX_reportGen('تقرير مخصّص')">${icon('report',15)} تقرير مخصّص</button>
</div>
${REPGROUPS.map(grp=>`<div class="rp-grp">
  <div class="sec-label">${grp.g} <span class="ln"></span></div>
  <div class="rp-cards">
    ${grp.items.map(it=>`<div class="rp-card"><div class="ic">${icon(grp.ic,18)}</div><div class="t">${it.k}</div><div class="d">${it.d}</div>
      <div class="b"><button class="gen" onclick="LUX_reportGen&&LUX_reportGen('${it.k}')">توليد</button><button class="csv" onclick="LUX_reportCSV&&LUX_reportCSV('${it.k}')" title="تصدير CSV مباشر">CSV</button></div></div>`).join('')}
  </div></div>`).join('')}`; }};

  function repData(){
    const months=['يناير','فبراير','مارس','أبريل','مايو','يونيو'];
    const head=['الشهر','اشتراكات (ر.س)','عمولات (ر.س)','حجوزات','الإجمالي (ر.س)'];
    const rows=months.map((m,i)=>{const sub=20000+i*3200,com=4000+i*900,bk=180+i*40;return [m,sub,com,bk,sub+com];});
    return {head,rows};
  }
  function downloadCSV(name){
    const {head,rows}=repData();
    const lines=[head.join(',')].concat(rows.map(r=>r.join(',')));
    const blob=new Blob(['﻿'+lines.join('\n')],{type:'text/csv;charset=utf-8;'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=('luma-'+name+'.csv').replace(/\s+/g,'-');a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1500);
  }
  window.LUX_reportCSV=function(name){if(!window.LUX)return;downloadCSV(name);window.LUX.toast('تم تصدير «'+name+'» (CSV) ✓','ok');};
  window.LUX_reportGen=function(name){
    if(!window.LUX)return;
    const body=`<div class="lux-lead">إعداد التقرير: <b style="color:#f6f2ec">${name}</b></div>
      <div class="lux-f"><label>الفترة الزمنية</label><select id="rp-p"><option>هذا الشهر</option><option>آخر ٣٠ يومًا</option><option>الربع الحالي</option><option>هذه السنة</option><option>كل الوقت</option></select></div>
      <div class="lux-f"><label>الصيغة</label><div class="lux-chips" id="rp-f"><button type="button" class="lux-chip on" data-v="csv">CSV / إكسل</button><button type="button" class="lux-chip" data-v="pdf">PDF</button><button type="button" class="lux-chip" data-v="view">معاينة</button></div></div>
      <div class="lux-foot" style="margin-top:8px"><button class="lux-btn lux-ghost" data-c style="flex:1">إلغاء</button><button class="lux-btn lux-gold" data-s style="flex:1.4">توليد التقرير</button></div>`;
    window.LUX.modal('توليد تقرير',body,{onMount(ov,close){
      let fmt='csv';ov.querySelectorAll('#rp-f .lux-chip').forEach(c=>c.onclick=()=>{fmt=c.dataset.v;ov.querySelectorAll('#rp-f .lux-chip').forEach(x=>x.classList.toggle('on',x===c));});
      ov.querySelector('[data-c]').onclick=close;
      ov.querySelector('[data-s]').onclick=()=>{
        const period=ov.querySelector('#rp-p').value;
        if(fmt==='view'){
          const {head,rows}=repData();
          const tbl=`<div class="lux-lead">${name} · ${period}</div><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">
            <tr>${head.map(h=>`<th style="text-align:right;color:var(--gold-light,#ccab64);padding:9px;border-bottom:1px solid var(--line,#1b1a21);font-weight:600">${h}</th>`).join('')}</tr>
            ${rows.map(r=>`<tr>${r.map((c,ci)=>`<td style="padding:9px;border-bottom:1px solid rgba(255,255,255,.05);color:${ci===0?'#f6f2ec':'#e6ce95'};direction:${ci===0?'rtl':'ltr'};text-align:${ci===0?'right':'left'}">${typeof c==='number'?c.toLocaleString('en'):c}</td>`).join('')}</tr>`).join('')}
          </table></div><button class="lux-btn lux-gold" data-x style="margin-top:14px;width:100%">تصدير CSV</button>`;
          ov.querySelector('.lux-b').innerHTML=tbl;
          ov.querySelector('[data-x]').onclick=()=>{downloadCSV(name);window.LUX.toast('تم التصدير ✓','ok');};
          return;
        }
        downloadCSV(name);
        close();window.LUX.toast('تم توليد «'+name+'» ('+(fmt==='pdf'?'PDF':'CSV')+') · '+period+' ✓','ok');
      };
    }});
  };
})();
