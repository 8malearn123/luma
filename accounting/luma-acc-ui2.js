/* ═══════════ لوما · شاشات المحاسبة التكميلية ═══════════
   الصناديق والبنوك · الجهات · التسوية البنكية · الأصول · الدورية ·
   الأرصدة الافتتاحية · الصلاحيات. تُضاف كتبويبات لشاشة المحاسبة نفسها. */
(function(){
  if(!window.LumaAcc||!window.ACCUI||typeof SCREENS==='undefined')return;
  const {Money,COA,Journal,Ledger,Mapping,Parties,Cash,Opening,Recon,Assets,Recurring,Perm}=LumaAcc;
  const F=h=>Money.fmt(h);
  const esc=v=>String(v==null?'':v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const go=()=>SALON.go('accounting');
  const err=e=>LUX.toast(e.message||String(e),'err');

  /* أدوات عرض مشتركة مع الشاشة الأولى */
  const money=(v,cls)=>`<span class="num" dir="ltr" style="font-family:var(--luma-font-display);${cls||''}">${F(v)}</span>`;
  const td=(v,i,st)=>`<td style="text-align:${i?'left':'right'};padding:11px 20px;${st||''}">${v}</td>`;
  function tableCard(title,head,rows,foot,extra){
    return `<div class="card" style="padding:0;overflow:hidden">
      <div style="padding:16px 20px;border-bottom:1px solid var(--line);display:flex;align-items:center;gap:12px;flex-wrap:wrap">
        <div class="sec-label" style="margin:0;flex:1">${title} <span class="ln"></span></div>${extra||''}</div>
      <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12.5px;min-width:560px">
        <thead><tr>${head.map((h,i)=>`<th style="text-align:${i?'left':'right'};padding:11px 20px;background:var(--surface2);color:var(--gold);font-weight:500;font-size:11px;white-space:nowrap">${h}</th>`).join('')}</tr></thead>
        <tbody>${rows||`<tr><td colspan="${head.length}" style="padding:26px;text-align:center;color:var(--muted)">لا بيانات</td></tr>`}</tbody>
        ${foot?`<tfoot>${foot}</tfoot>`:''}</table></div></div>`;
  }
  ACCUI._tableCard=tableCard; ACCUI._money=money; ACCUI._td=td;

  const accOptions=sel=>COA.all().filter(a=>!a.group&&a.active)
    .map(a=>`<option value="${a.code}" ${a.code===sel?'selected':''}>${a.code} — ${esc(a.name)}</option>`).join('');

  Object.assign(ACCUI,{
    /* ── صندوق أو حساب بنكي ── */
    addCash(){
      LUX.modal('صندوق أو حساب بنكي جديد',`
        <div class="lux-lead">يُنشأ له حساب مستقل في دليل الحسابات، ورصيده يُقرأ من الدفتر دائماً.</div>
        <div class="lux-f"><label>النوع</label><select name="ck"><option value="cash">صندوق نقدي</option><option value="bank">حساب بنكي</option></select></div>
        <div class="lux-f"><label>الاسم <span style="color:var(--red)">*</span></label><input name="cn" placeholder="مثال: صندوق فرع الروضة"/></div>
        <div class="lux-f"><label>البنك (للحسابات البنكية)</label><input name="cb" placeholder="مثال: الراجحي"/></div>
        <div class="lux-f"><label>الآيبان</label><input name="ci" dir="ltr" style="text-align:right" placeholder="SA…"/></div>
        <button class="lux-btn lux-gold" data-ok style="width:100%">إضافة</button>`,
      {onMount(ov,close){ov.querySelector('[data-ok]').onclick=()=>{
        const g=n=>(ov.querySelector('[name='+n+']')||{}).value||'';
        if(!g('cn').trim()){ov.querySelector('[name=cn]').style.borderColor='var(--red)';return;}
        try{Cash.add({kind:g('ck'),name:g('cn').trim(),bank:g('cb').trim(),iban:g('ci').trim()});
          close();go();LUX.toast('أُضيف الحساب ✓','ok');}catch(e){err(e);}
      };}});
    },
    transfer(){
      const opts=Cash.all().filter(c=>c.active).map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
      if(Cash.all().length<2)return LUX.toast('يلزم حسابان على الأقل للتحويل','err');
      LUX.modal('تحويل بين الحسابات',`
        <div class="lux-f"><label>من</label><select name="tf">${opts}</select></div>
        <div class="lux-f"><label>إلى</label><select name="tt">${opts}</select></div>
        <div class="lux-f"><label>المبلغ <span style="color:var(--red)">*</span></label><input name="ta" type="number" step="0.01" dir="ltr" style="text-align:right"/></div>
        <div class="lux-f"><label>رسوم التحويل (اختياري)</label><input name="tfee" type="number" step="0.01" dir="ltr" style="text-align:right" placeholder="0"/></div>
        <button class="lux-btn lux-gold" data-ok style="width:100%">ترحيل التحويل</button>`,
      {onMount(ov,close){ov.querySelector('[data-ok]').onclick=()=>{
        const g=n=>(ov.querySelector('[name='+n+']')||{}).value;
        try{Cash.transfer(g('tf'),g('tt'),parseFloat(g('ta'))||0,{fee:parseFloat(g('tfee'))||0});
          close();go();LUX.toast('رُحّل التحويل ✓','ok');}catch(e){err(e);}
      };}});
    },

    /* ── الجهات ── */
    addParty(kind){
      LUX.modal(kind==='supplier'?'مورد جديد':'عميلة جديدة',`
        <div class="lux-f"><label>الاسم <span style="color:var(--red)">*</span></label><input name="pn"/></div>
        <div class="lux-f"><label>الجوال</label><input name="pp" dir="ltr" style="text-align:right" placeholder="05xxxxxxxx"/></div>
        <div class="lux-f"><label>الرقم الضريبي</label><input name="pv" dir="ltr" style="text-align:right"/></div>
        <div class="lux-f"><label>مهلة السداد (يوم)</label><input name="pt" type="number" dir="ltr" style="text-align:right" value="0"/></div>
        <button class="lux-btn lux-gold" data-ok style="width:100%">إضافة</button>`,
      {onMount(ov,close){ov.querySelector('[data-ok]').onclick=()=>{
        const g=n=>(ov.querySelector('[name='+n+']')||{}).value||'';
        if(!g('pn').trim()){ov.querySelector('[name=pn]').style.borderColor='var(--red)';return;}
        try{Parties.add({kind,name:g('pn').trim(),phone:g('pp').trim(),vatNo:g('pv').trim(),terms:g('pt')});
          close();go();LUX.toast('أُضيفت الجهة ✓','ok');}catch(e){err(e);}
      };}});
    },
    partyStatement(id){
      const p=Parties.get(id);if(!p)return;
      const st=Parties.statement(id);
      LUX.modal('كشف حساب — '+esc(p.name),`
        <div class="lux-lead">${p.kind==='supplier'?'مورد':'عميلة'}${p.phone?' · <span dir="ltr">'+esc(p.phone)+'</span>':''}</div>
        <div class="lux-row"><span class="k">الرصيد الحالي</span><span class="v">${F(st.closing)} ر.س</span></div>
        <div style="margin-top:12px;border:1px solid var(--line);border-radius:8px;overflow:hidden;max-height:50vh;overflow-y:auto">
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;padding:10px 12px;background:var(--surface2);font-size:11px;color:var(--gold)">
            <span>التاريخ</span><span>مدين</span><span>دائن</span><span>الرصيد</span></div>
          ${st.rows.length?st.rows.map(r=>`<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;padding:10px 12px;border-top:1px solid var(--line-soft);font-size:12px">
            <span dir="ltr">${r.date}<div style="font-size:10.5px;color:var(--muted)">${esc(r.desc)}</div></span>
            <span dir="ltr">${r.debit?F(r.debit):'—'}</span><span dir="ltr">${r.credit?F(r.credit):'—'}</span>
            <span dir="ltr" style="color:var(--gold-light)">${F(r.balance)}</span></div>`).join('')
            :'<div style="padding:20px;text-align:center;color:var(--muted)">لا حركة</div>'}
        </div>`);
    },

    /* ── الأرصدة الافتتاحية ── */
    openingBalances(){
      const row=i=>`<div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:8px;margin-bottom:8px">
        <select data-a="${i}">${accOptions()}</select>
        <input data-d="${i}" type="number" step="0.01" placeholder="مدين" dir="ltr" style="text-align:right"/>
        <input data-c="${i}" type="number" step="0.01" placeholder="دائن" dir="ltr" style="text-align:right"/></div>`;
      LUX.modal('الأرصدة الافتتاحية',`
        <div class="lux-lead">أرصدة أول المدة لكل حساب. الفرق يُحمَّل تلقائياً على رأس المال حتى يتوازن القيد.</div>
        <div class="lux-f"><label>تاريخ الافتتاح</label><input id="obDate" type="date" value="${new Date().toISOString().slice(0,10)}"/></div>
        <div id="obRows">${row(0)}${row(1)}${row(2)}</div>
        <button class="lux-btn lux-ghost" data-add style="width:100%;padding:9px">+ سطر</button>
        <div class="lux-row" style="margin-top:10px"><span class="k">الفرق (إلى رأس المال)</span><span class="v" id="obDiff" dir="ltr">0.00</span></div>
        <button class="lux-btn lux-gold" data-ok style="width:100%;margin-top:10px">ترحيل القيد الافتتاحي</button>`,
      {onMount(ov,close){
        let n=3;
        const recalc=()=>{let d=0,c=0;for(let i=0;i<n;i++){
          d+=parseFloat((ov.querySelector('[data-d="'+i+'"]')||{}).value)||0;
          c+=parseFloat((ov.querySelector('[data-c="'+i+'"]')||{}).value)||0;}
          ov.querySelector('#obDiff').textContent=(d-c).toFixed(2);};
        ov.addEventListener('input',recalc);
        ov.querySelector('[data-add]').onclick=()=>{ov.querySelector('#obRows').insertAdjacentHTML('beforeend',row(n++));};
        ov.querySelector('[data-ok]').onclick=()=>{
          const rows=[];for(let i=0;i<n;i++){const a=ov.querySelector('[data-a="'+i+'"]');if(!a)continue;
            rows.push({account:a.value,debit:parseFloat((ov.querySelector('[data-d="'+i+'"]')||{}).value)||0,
                       credit:parseFloat((ov.querySelector('[data-c="'+i+'"]')||{}).value)||0});}
          try{Opening.post(ov.querySelector('#obDate').value,rows);close();go();LUX.toast('رُحّلت الأرصدة الافتتاحية ✓','ok');}
          catch(e){err(e);}
        };
      }});
    },

    /* ── التسوية البنكية ── */
    startRecon(){
      const opts=Cash.all().filter(c=>c.active).map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
      if(!opts)return LUX.toast('أضيفي حساباً بنكياً أولاً','err');
      LUX.modal('تسوية بنكية جديدة',`
        <div class="lux-lead">قارني رصيد الدفتر برصيد كشف البنك. الفروقات تُعالَج بقيود لا بتعديل يدوي على الرصيد.</div>
        <div class="lux-f"><label>الحساب</label><select id="rcA">${opts}</select></div>
        <div class="lux-f"><label>تاريخ الكشف</label><input id="rcD" type="date" value="${new Date().toISOString().slice(0,10)}"/></div>
        <div class="lux-f"><label>رصيد كشف البنك <span style="color:var(--red)">*</span></label><input id="rcB" type="number" step="0.01" dir="ltr" style="text-align:right"/></div>
        <button class="lux-btn lux-gold" data-ok style="width:100%">بدء التسوية</button>`,
      {onMount(ov,close){ov.querySelector('[data-ok]').onclick=()=>{
        try{const r=Recon.open(ov.querySelector('#rcA').value,ov.querySelector('#rcD').value,
              parseFloat(ov.querySelector('#rcB').value)||0);
          close();ACCUI.recon=r.id;ACCUI.go('recon');}catch(e){err(e);}
      };}});
    },
    reconToggle(key){try{Recon.toggle(ACCUI.recon,key);go();}catch(e){err(e);}},
    reconFee(){
      LUX.modal('رسوم بنكية',`
        <div class="lux-lead">تُرحَّل قيداً على مصروف الرسوم البنكية وتُطابَق تلقائياً.</div>
        <div class="lux-f"><label>المبلغ <span style="color:var(--red)">*</span></label><input id="fA" type="number" step="0.01" dir="ltr" style="text-align:right"/></div>
        <div class="lux-f"><label>البيان</label><input id="fD" placeholder="رسوم إدارة حساب"/></div>
        <button class="lux-btn lux-gold" data-ok style="width:100%">ترحيل الرسوم</button>`,
      {onMount(ov,close){ov.querySelector('[data-ok]').onclick=()=>{
        try{Recon.addFee(ACCUI.recon,parseFloat(ov.querySelector('#fA').value)||0,
              (ov.querySelector('#fD').value||'').trim());close();go();LUX.toast('رُحّلت الرسوم ✓','ok');}
        catch(e){err(e);}
      };}});
    },
    reconClose(){
      try{Recon.close(ACCUI.recon,'إقفال تسوية');go();LUX.toast('أُقفلت التسوية ✓','ok');}catch(e){err(e);}
    },

    /* ── الأصول الثابتة ── */
    addAsset(){
      LUX.modal('أصل ثابت جديد',`
        <div class="lux-lead">يُرحَّل قيد الاقتناء فوراً، ويُحتسب الإهلاك شهرياً من تشغيل واحد.</div>
        <div class="lux-f"><label>اسم الأصل <span style="color:var(--red)">*</span></label><input name="an" placeholder="مثال: كراسي تصفيف"/></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="lux-f"><label>التكلفة <span style="color:var(--red)">*</span></label><input name="ac" type="number" step="0.01" dir="ltr" style="text-align:right"/></div>
          <div class="lux-f"><label>القيمة التخريدية</label><input name="as" type="number" step="0.01" dir="ltr" style="text-align:right" value="0"/></div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="lux-f"><label>تاريخ الشراء</label><input name="ad" type="date" value="${new Date().toISOString().slice(0,10)}"/></div>
          <div class="lux-f"><label>العمر الإنتاجي (سنة) <span style="color:var(--red)">*</span></label><input name="al" type="number" dir="ltr" style="text-align:right" value="5"/></div>
        </div>
        <div class="lux-f"><label>طريقة الإهلاك</label><select name="am"><option value="straight">القسط الثابت</option><option value="declining">القسط المتناقص</option></select></div>
        <button class="lux-btn lux-gold" data-ok style="width:100%">تسجيل الأصل</button>`,
      {onMount(ov,close){ov.querySelector('[data-ok]').onclick=()=>{
        const g=n=>(ov.querySelector('[name='+n+']')||{}).value||'';
        try{Assets.add({name:g('an').trim(),cost:g('ac'),salvage:g('as'),acquiredAt:g('ad'),
              life:g('al'),method:g('am')});close();go();LUX.toast('سُجّل الأصل ورُحّل قيد الاقتناء ✓','ok');}
        catch(e){err(e);}
      };}});
    },
    runDep(){
      try{const je=Assets.runDepreciation();go();LUX.toast('رُحّل إهلاك الشهر — '+je.id+' ✓','ok');}catch(e){err(e);}
    },
    disposeAsset(id){
      const a=Assets.get(id);if(!a)return;
      LUX.modal('استبعاد أو بيع — '+esc(a.name),`
        <div class="lux-lead">القيمة الدفترية الحالية ${F(Assets.nbv(id))} ر.س. الفرق عن العائد يُسجَّل ربحاً أو خسارة.</div>
        <div class="lux-f"><label>عائد البيع (صفر للاستبعاد)</label><input id="dp" type="number" step="0.01" dir="ltr" style="text-align:right" value="0"/></div>
        <div class="lux-f"><label>السبب</label><input id="dr" placeholder="مثال: بيع بعد التجديد"/></div>
        <button class="lux-btn lux-gold" data-ok style="width:100%">تأكيد</button>`,
      {onMount(ov,close){ov.querySelector('[data-ok]').onclick=()=>{
        try{Assets.dispose(id,{proceeds:parseFloat(ov.querySelector('#dp').value)||0,
              reason:(ov.querySelector('#dr').value||'').trim()});close();go();LUX.toast('رُحّل الاستبعاد ✓','ok');}
        catch(e){err(e);}
      };}});
    },

    /* ── القيود الدورية ── */
    addRecurring(){
      const row=i=>`<div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:8px;margin-bottom:8px">
        <select data-a="${i}">${accOptions()}</select>
        <input data-d="${i}" type="number" step="0.01" placeholder="مدين" dir="ltr" style="text-align:right"/>
        <input data-c="${i}" type="number" step="0.01" placeholder="دائن" dir="ltr" style="text-align:right"/></div>`;
      LUX.modal('قيد دوري جديد',`
        <div class="lux-lead">للمصروفات المستحقة والمقدمة وما يتكرر بجدول. لا يُرحَّل لفترة مرتين.</div>
        <div class="lux-f"><label>الاسم <span style="color:var(--red)">*</span></label><input id="rn" placeholder="مثال: استحقاق إيجار شهري"/></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="lux-f"><label>النوع</label><select id="rk"><option value="accrual">مصروف مستحق</option><option value="prepayment">مصروف مقدم</option><option value="other">أخرى</option></select></div>
          <div class="lux-f"><label>التكرار</label><select id="rf"><option value="monthly">شهري</option><option value="quarterly">ربع سنوي</option><option value="yearly">سنوي</option></select></div>
        </div>
        <div style="font-size:12px;color:var(--gold);margin:12px 0 6px">قالب السطور</div>
        <div id="rRows">${row(0)}${row(1)}</div>
        <button class="lux-btn lux-ghost" data-add style="width:100%;padding:9px">+ سطر</button>
        <button class="lux-btn lux-gold" data-ok style="width:100%;margin-top:10px">حفظ القالب</button>`,
      {onMount(ov,close){
        let n=2;
        ov.querySelector('[data-add]').onclick=()=>{ov.querySelector('#rRows').insertAdjacentHTML('beforeend',row(n++));};
        ov.querySelector('[data-ok]').onclick=()=>{
          const lines=[];for(let i=0;i<n;i++){const a=ov.querySelector('[data-a="'+i+'"]');if(!a)continue;
            const d=parseFloat((ov.querySelector('[data-d="'+i+'"]')||{}).value)||0;
            const c=parseFloat((ov.querySelector('[data-c="'+i+'"]')||{}).value)||0;
            if(d||c)lines.push({account:a.value,debit:d,credit:c});}
          try{Recurring.add({name:(ov.querySelector('#rn').value||'').trim(),
                kind:ov.querySelector('#rk').value,freq:ov.querySelector('#rf').value,lines});
            close();go();LUX.toast('حُفظ القالب ✓','ok');}catch(e){err(e);}
        };
      }});
    },
    runRecurring(id){try{const je=Recurring.run(id);go();LUX.toast('رُحّل '+je.id+' ✓','ok');}catch(e){err(e);}},
    toggleRecurring(id,on){try{Recurring.setActive(id,on,'تبديل من الشاشة');go();}catch(e){err(e);}},

    /* ── الصلاحيات ── */
    setRole(r){try{Perm.setRole(r,'تبديل الدور');go();LUX.toast('الدور الآن: '+Perm.roles()[r].name,'ok');}catch(e){err(e);}},
  });

  ACCUI.recon=ACCUI.recon||'';

  /* ─────────── محتوى التبويبات الجديدة ─────────── */
  ACCUI.renderTab=function(t){
    if(t==='cash'){
      const rows=Cash.all().map(c=>`<tr style="border-top:1px solid var(--line-soft)">
        ${td(esc(c.name)+(c.bank?`<div style="font-size:11px;color:var(--muted)">${esc(c.bank)}${c.iban?' · <span dir="ltr">'+esc(c.iban)+'</span>':''}</div>`:''),0)}
        ${td(c.kind==='bank'?'حساب بنكي':'صندوق نقدي',1)}
        ${td('<span dir="ltr" style="color:var(--muted)">'+c.account+'</span>',1)}
        ${td(money(Cash.balance(c.id),'color:var(--gold-light)'),1)}
        ${td('<button class="btn btn-ghost" style="padding:6px 12px;font-size:11px" onclick="ACCUI.openAccount(\''+c.account+'\')">الأستاذ</button>',1)}</tr>`).join('');
      return tableCard('الصناديق والحسابات البنكية',['الحساب','النوع','رقم الحساب','الرصيد',''],rows,null,
        `<button class="btn btn-ghost" style="padding:7px 14px;font-size:12px" onclick="ACCUI.transfer()">تحويل</button>
         <button class="btn btn-gold" style="padding:7px 14px;font-size:12px" onclick="ACCUI.addCash()">+ حساب</button>`);
    }

    if(t==='parties'){
      const mk=(kind,title)=>{
        const rows=Parties.all(kind).map(p=>`<tr style="border-top:1px solid var(--line-soft);cursor:pointer" onclick="ACCUI.partyStatement('${p.id}')">
          ${td(esc(p.name)+(p.phone?`<div style="font-size:11px;color:var(--muted)" dir="ltr">${esc(p.phone)}</div>`:''),0)}
          ${td('<span dir="ltr" style="color:var(--muted)">'+esc(p.id)+'</span>',1)}
          ${td(money(Parties.balance(p.id),'color:var(--gold-light)'),1)}</tr>`).join('');
        return tableCard(title,['الاسم','المعرّف','الرصيد'],rows,null,
          `<button class="btn btn-gold" style="padding:7px 14px;font-size:12px" onclick="ACCUI.addParty('${kind}')">+ إضافة</button>`);
      };
      const ag=k=>{const a=LumaAcc.Reports.aging(k);
        return tableCard('أعمار '+(k==='customer'?'العملاء':'الموردين'),['الجهة'].concat(a.labels),
          a.rows.map(r=>`<tr style="border-top:1px solid var(--line-soft)">${td(esc(r.name),0)}
            ${r.buckets.map(b=>td(b?money(b):'—',1)).join('')}</tr>`).join(''),
          `<tr><td style="padding:12px 20px;font-weight:600;color:var(--gold-light)">الإجمالي</td>
            ${a.totals.map(b=>`<td style="padding:12px 20px;text-align:left">${money(b,'color:var(--gold-light)')}</td>`).join('')}</tr>`);
      };
      return `<div style="display:grid;gap:18px">${mk('customer','العملاء')}${ag('customer')}${mk('supplier','الموردون')}${ag('supplier')}</div>`;
    }

    if(t==='recon'){
      const open=Recon.all().filter(r=>r.status==='open');
      if(!ACCUI.recon&&open.length)ACCUI.recon=open[0].id;
      if(!ACCUI.recon||!Recon.get(ACCUI.recon)){
        const rows=Recon.all().map(r=>`<tr style="border-top:1px solid var(--line-soft)">
          ${td('<span dir="ltr">'+r.id+'</span>',0)}${td('<span dir="ltr">'+r.date+'</span>',1)}
          ${td(money(r.statementBalance),1)}${td('<span class="badge '+(r.status==='closed'?'green':'gold')+'">'+(r.status==='closed'?'مقفلة':'مفتوحة')+'</span>',1)}</tr>`).join('');
        return tableCard('التسوية البنكية',['رقم','التاريخ','رصيد الكشف','الحالة'],rows,null,
          `<button class="btn btn-gold" style="padding:7px 14px;font-size:12px" onclick="ACCUI.startRecon()">+ تسوية جديدة</button>`);
      }
      const st=Recon.status(ACCUI.recon);
      const line=(x,on)=>`<tr style="border-top:1px solid var(--line-soft)">
        ${td('<span dir="ltr">'+x.date+'</span>',0)}
        ${td('<span dir="ltr" style="color:var(--gold-light)">'+x.je+'</span>',1)}
        ${td(esc(x.desc),1)}${td(money(x.amount),1)}
        ${td(st.recon.status==='open'?`<button class="btn ${on?'btn-gold':'btn-ghost'}" style="padding:5px 12px;font-size:11px" onclick="ACCUI.reconToggle('${x.key}')">${on?'مطابَق ✓':'مطابقة'}</button>`:(on?'✓':'—'),1)}</tr>`;
      return `<div class="card" style="margin-bottom:16px;display:grid;grid-template-columns:repeat(4,1fr);gap:14px">
          ${[['رصيد الدفتر',st.book],['رصيد الكشف',st.statement],['المطابق',st.matchedSum],['الفرق',st.difference]]
            .map((k,i)=>`<div><div style="font-size:12px;color:var(--gold-pale)">${k[0]}</div>
            ${money(k[1],'font-size:22px;color:'+(i===3?(st.clean?'var(--green)':'var(--red)'):'var(--white)'))}</div>`).join('')}
        </div>
        <div style="display:flex;gap:9px;margin-bottom:14px;flex-wrap:wrap">
          <button class="btn btn-ghost" onclick="ACCUI.reconFee()">+ رسوم بنكية</button>
          ${st.recon.status==='open'?`<button class="btn btn-gold" onclick="ACCUI.reconClose()">إقفال التسوية</button>`:'<span class="badge green">مقفلة</span>'}
        </div>
        ${tableCard('حركات مطابَقة',['التاريخ','القيد','البيان','المبلغ',''],st.matched.map(x=>line(x,true)).join(''))}
        <div style="height:16px"></div>
        ${tableCard('حركات معلّقة — لم تظهر في الكشف',['التاريخ','القيد','البيان','المبلغ',''],st.pending.map(x=>line(x,false)).join(''))}`;
    }

    if(t==='assets'){
      const rows=Assets.all().map(a=>`<tr style="border-top:1px solid var(--line-soft)">
        ${td(esc(a.name)+`<div style="font-size:11px;color:var(--muted)">${Assets.METHODS[a.method]} · ${a.life} سنوات</div>`,0)}
        ${td('<span dir="ltr">'+a.acquiredAt+'</span>',1)}
        ${td(money(a.cost),1)}${td(money(a.depreciated),1)}
        ${td(money(Assets.nbv(a.id),'color:var(--gold-light)'),1)}
        ${td('<span class="badge '+(a.status==='active'?'green':'soft')+'">'+
          (a.status==='active'?'نشط':a.status==='disposed'?'مستبعد':'مُهلَك بالكامل')+'</span>',1)}
        ${td(a.status!=='disposed'?'<button class="btn btn-ghost" style="padding:6px 12px;font-size:11px" onclick="ACCUI.disposeAsset(\''+a.id+'\')">استبعاد</button>':'—',1)}</tr>`).join('');
      return tableCard('الأصول الثابتة',['الأصل','تاريخ الشراء','التكلفة','مجمع الإهلاك','القيمة الدفترية','الحالة',''],rows,null,
        `<button class="btn btn-ghost" style="padding:7px 14px;font-size:12px" onclick="ACCUI.runDep()">تشغيل إهلاك الشهر</button>
         <button class="btn btn-gold" style="padding:7px 14px;font-size:12px" onclick="ACCUI.addAsset()">+ أصل</button>`);
    }

    if(t==='recurring'){
      const rows=Recurring.all().map(r=>`<tr style="border-top:1px solid var(--line-soft)">
        ${td(esc(r.name),0)}
        ${td({accrual:'مصروف مستحق',prepayment:'مصروف مقدم',other:'أخرى'}[r.kind]||'—',1)}
        ${td(Recurring.FREQ[r.freq],1)}
        ${td(money(r.lines.reduce((t,l)=>t+Money.from(l.debit||0),0)),1)}
        ${td('<span class="badge '+(r.active?'green':'soft')+'">'+(r.active?'نشط':'موقوف')+'</span>',1)}
        ${td(`<button class="btn btn-ghost" style="padding:6px 12px;font-size:11px" onclick="ACCUI.runRecurring('${r.id}')">ترحيل الآن</button>
              <button class="btn btn-ghost" style="padding:6px 12px;font-size:11px" onclick="ACCUI.toggleRecurring('${r.id}',${!r.active})">${r.active?'إيقاف':'تفعيل'}</button>`,1)}</tr>`).join('');
      return tableCard('القيود الدورية — المستحقات والمقدمات',['الاسم','النوع','التكرار','المبلغ','الحالة',''],rows,null,
        `<button class="btn btn-gold" style="padding:7px 14px;font-size:12px" onclick="ACCUI.addRecurring()">+ قالب</button>`);
    }

    if(t==='perm'){
      const roles=Perm.roles(),cur=Perm.role();
      const rows=Object.entries(roles).map(([id,r])=>`<tr style="border-top:1px solid var(--line-soft)">
        ${td(esc(r.name)+(id===cur?' <span class="badge gold" style="font-size:9.5px">الدور الحالي</span>':''),0)}
        ${td(r.perms.length+' صلاحية',1)}
        ${td(id===cur?'—':'<button class="btn btn-ghost" style="padding:6px 12px;font-size:11px" onclick="ACCUI.setRole(\''+id+'\')">التبديل لهذا الدور</button>',1)}</tr>`).join('');
      const mine=Perm.list();
      return `<div class="card" style="margin-bottom:16px;font-size:12.5px;color:var(--muted);line-height:1.9">
          الصلاحيات مفروضة عند حدود النطاق لا في الواجهة فقط: إخفاء زر لا يمنع استدعاء الدالة.
          <b style="color:var(--gold-pale)">لكن الفرض الحقيقي مستحيل في المتصفح</b> — من يملك أدوات المطوّر يملك كل شيء.
          النظير الحقيقي سياسات الخادم (RLS) في مخطط قاعدة البيانات.</div>
        ${tableCard('الأدوار',['الدور','الصلاحيات',''],rows)}
        <div style="height:16px"></div>
        ${tableCard('صلاحياتك الحالية',['الصلاحية','الحالة'],
          Perm.ALL.map(p=>`<tr style="border-top:1px solid var(--line-soft)">
            ${td(esc(Perm.PERMS[p]),0)}
            ${td('<span class="badge '+(mine.indexOf(p)>=0?'green':'soft')+'">'+(mine.indexOf(p)>=0?'مسموح':'ممنوع')+'</span>',1)}</tr>`).join(''))}`;
    }
    return null;
  };
})();
