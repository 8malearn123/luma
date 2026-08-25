/* لوما · داشبورد الصالون — المحاسبة
   إدخال فواتير المشتريات والمصروفات (رواتب، إيجار، مرافق…) بشكل مبسّط،
   ثم بيان واضح: المبيعات كم، وأين تذهب، ومن يشتري، ومن نشتري منه. */

const ACC_PUR_KEY='luma_acc_purchases', ACC_EXP_KEY='luma_acc_expenses', ACC_REV_KEY='luma_acc_revenue';
const ACC_VAT=0.15;
const accMonthNow=()=>new Date().toISOString().slice(0,7);
const accToday=()=>new Date().toISOString().slice(0,10);
const accMonthName=m=>{const [y,mm]=String(m).split('-');
  return ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'][(+mm||1)-1]+' '+y;};
const accNum=v=>Math.round(+v||0);
const accFmt=v=>accNum(v).toLocaleString('en');

/* تصنيفات المشتريات والمصروفات — قابلة للتوسعة من نموذج الإدخال */
const ACC_PUR_CATS=['مستحضرات وخامات','منتجات للبيع','أدوات ومعدات','مستلزمات تشغيل','ضيافة','أخرى'];
const ACC_EXP_CATS=['رواتب وأجور','إيجار','كهرباء وماء','إنترنت واتصالات','تسويق وإعلان','صيانة ونظافة','رسوم حكومية واشتراكات','نقل ومواصلات','أخرى'];
const ACC_PAYS=['نقداً','شبكة/مدى','تحويل بنكي','آجل (على الحساب)'];

/* بذرة تجريبية تعكس شهراً واقعياً لصالون */
let ACC_PUR=LumaStore.get(ACC_PUR_KEY,null);
if(!ACC_PUR){
  const m=accMonthNow();
  ACC_PUR=[
    {id:1,date:m+'-03',supplier:'مؤسسة الجمال للتوريدات',inv:'PO-4417',cat:'مستحضرات وخامات',net:3200,pay:'تحويل بنكي',status:'paid',buyer:'لمى المالكي',note:'صبغات ومستحضرات شعر'},
    {id:2,date:m+'-07',supplier:'دار العناية',inv:'PO-4423',cat:'منتجات للبيع',net:4100,pay:'شبكة/مدى',status:'paid',buyer:'أمل',note:'سيروم وزيوت للبيع بالتجزئة'},
    {id:3,date:m+'-12',supplier:'تجهيزات الصالونات',inv:'PO-4431',cat:'أدوات ومعدات',net:1850,pay:'آجل (على الحساب)',status:'due',buyer:'لمى المالكي',note:'مجفف شعر احترافي ×2'},
    {id:4,date:m+'-15',supplier:'سوق المستلزمات',inv:'PO-4440',cat:'مستلزمات تشغيل',net:640,pay:'نقداً',status:'paid',buyer:'سارة',note:'مناشف وقفازات ومناديل'},
  ];
  LumaStore.set(ACC_PUR_KEY,ACC_PUR);
}
let ACC_EXP=LumaStore.get(ACC_EXP_KEY,null);
if(!ACC_EXP){
  const m=accMonthNow();
  ACC_EXP=[
    {id:1,date:m+'-01',cat:'إيجار',amount:9000,pay:'تحويل بنكي',status:'paid',recur:1,note:'إيجار المحل — شهري',by:'لمى المالكي'},
    {id:2,date:m+'-05',cat:'كهرباء وماء',amount:1450,pay:'شبكة/مدى',status:'paid',recur:1,note:'فاتورة الشهر',by:'لمى المالكي'},
    {id:3,date:m+'-06',cat:'تسويق وإعلان',amount:1200,pay:'شبكة/مدى',status:'paid',recur:0,note:'حملة سناب شات',by:'لمى المالكي'},
    {id:4,date:m+'-10',cat:'صيانة ونظافة',amount:520,pay:'نقداً',status:'paid',recur:0,note:'صيانة كراسي',by:'سارة'},
    {id:5,date:m+'-20',cat:'رسوم حكومية واشتراكات',amount:380,pay:'تحويل بنكي',status:'due',recur:0,note:'اشتراك نظام المحاسبة',by:'لمى المالكي'},
  ];
  LumaStore.set(ACC_EXP_KEY,ACC_EXP);
}
/* إيرادات الشهر المسجّلة — تُضاف إليها كل دفعة تُقبض من لوحة الحجوزات */
let ACC_REV=LumaStore.get(ACC_REV_KEY,null);
if(!ACC_REV){
  const m=accMonthNow();
  ACC_REV=[{id:1,month:m,cat:'خدمات',amount:41200},{id:2,month:m,cat:'منتجات',amount:8800},{id:3,month:m,cat:'اشتراكات',amount:2400}];
  LumaStore.set(ACC_REV_KEY,ACC_REV);
}
const accSavePur=()=>LumaStore.set(ACC_PUR_KEY,ACC_PUR);
const accSaveExp=()=>LumaStore.set(ACC_EXP_KEY,ACC_EXP);

const accInMonth=(d,m)=>String(d||'').slice(0,7)===m;
const accPurTotal=p=>accNum((p.net||0)*(1+ACC_VAT));
/* المبيعات: المسجّل يدوياً + كل فاتورة قُبضت فعلياً من الكاشير */
function accSales(m){
  const rows=ACC_REV.filter(r=>r.month===m).map(r=>({cat:r.cat,amount:r.amount}));
  const paid=Object.values((typeof paidAll==='function')?paidAll():{}).filter(p=>accInMonth(p.date,m));
  const live=paid.reduce((t,p)=>t+(p.total||0),0);
  if(live)rows.push({cat:'فواتير مقبوضة اليوم',amount:accNum(live)});
  return rows;
}
function accSummary(m){
  const sales=accSales(m).reduce((t,r)=>t+r.amount,0);
  const pur=ACC_PUR.filter(p=>accInMonth(p.date,m));
  const exp=ACC_EXP.filter(e=>accInMonth(e.date,m));
  const purT=pur.reduce((t,p)=>t+accPurTotal(p),0);
  const expT=exp.reduce((t,e)=>t+accNum(e.amount),0);
  const due=pur.filter(p=>p.status==='due').reduce((t,p)=>t+accPurTotal(p),0)
           +exp.filter(e=>e.status==='due').reduce((t,e)=>t+accNum(e.amount),0);
  return {sales,pur,exp,purT,expT,out:purT+expT,net:sales-purT-expT,due};
}
/* أين تذهب المبيعات: كل بنود الصرف مجمّعة بتصنيفها */
function accOutBreakdown(m){
  const map={};
  ACC_PUR.filter(p=>accInMonth(p.date,m)).forEach(p=>{map[p.cat]=(map[p.cat]||0)+accPurTotal(p);});
  ACC_EXP.filter(e=>accInMonth(e.date,m)).forEach(e=>{map[e.cat]=(map[e.cat]||0)+accNum(e.amount);});
  return Object.entries(map).sort((a,b)=>b[1]-a[1]);
}
const accGroup=(list,key,val)=>{const m={};list.forEach(x=>{m[x[key]||'—']=(m[x[key]||'—']||0)+val(x);});
  return Object.entries(m).sort((a,b)=>b[1]-a[1]);};
/* أشهر متاحة في السجلات */
function accMonths(){
  const s=new Set([accMonthNow()]);
  ACC_PUR.forEach(p=>s.add(String(p.date).slice(0,7)));
  ACC_EXP.forEach(e=>s.add(String(e.date).slice(0,7)));
  ACC_REV.forEach(r=>s.add(r.month));
  return [...s].sort().reverse();
}
function accCSV(name,rows){
  const csv=rows.map(r=>r.map(c=>'"'+String(c==null?'':c).replace(/"/g,'""')+'"').join(',')).join('\r\n');
  const blob=new Blob(['﻿'+csv],{type:'text/csv;charset=utf-8;'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1500);
}

const ACC={
  tab:'overview', month:accMonthNow(),
  go(t){this.tab=t;SALON.go('accounting');},
  setMonth(m){this.month=m;SALON.go('accounting');},

  /* ── فاتورة مشتريات ── */
  purForm(id){
    const p=id?ACC_PUR.find(x=>x.id===id):null;
    const buyers=['لمى المالكي',...STAFF.map(s=>s.n)];
    LUX.modal(p?'تعديل فاتورة مشتريات':'فاتورة مشتريات جديدة',`
      <div class="lux-lead">سجّلي ما اشتراه الصالون: من أي مورّد، ومن اشترى، وكم كلّف — ليظهر في «أين تذهب المبيعات».</div>
      <div class="lux-two">
        <div class="lux-f"><label>المورّد</label><input name="supplier" value="${p?p.supplier:''}" placeholder="مثال: مؤسسة الجمال للتوريدات"/></div>
        <div class="lux-f"><label>رقم الفاتورة</label><input name="inv" dir="ltr" style="text-align:right" value="${p?p.inv:''}" placeholder="PO-0001"/></div>
      </div>
      <div class="lux-two">
        <div class="lux-f"><label>التاريخ</label><input type="date" name="date" value="${p?p.date:accToday()}"/></div>
        <div class="lux-f"><label>التصنيف</label><select name="cat">${ACC_PUR_CATS.map(c=>`<option ${p&&p.cat===c?'selected':''}>${c}</option>`).join('')}</select></div>
      </div>
      <div class="lux-two">
        <div class="lux-f"><label>المبلغ قبل الضريبة (ر.س)</label><input name="net" type="number" min="0" step="0.01" dir="ltr" style="text-align:right" value="${p?p.net:''}"/></div>
        <div class="lux-f"><label>من اشترى</label><select name="buyer">${buyers.map(b=>`<option ${p&&p.buyer===b?'selected':''}>${b}</option>`).join('')}</select></div>
      </div>
      <div class="lux-two">
        <div class="lux-f"><label>طريقة الدفع</label><select name="pay">${ACC_PAYS.map(c=>`<option ${p&&p.pay===c?'selected':''}>${c}</option>`).join('')}</select></div>
        <div class="lux-f"><label>الحالة</label><select name="status">
          <option value="paid" ${p&&p.status==='paid'?'selected':''}>مدفوعة</option>
          <option value="due" ${p&&p.status==='due'?'selected':''}>مستحقة على الصالون</option></select></div>
      </div>
      <div class="lux-f"><label>البيان (اختياري)</label><input name="note" value="${p?(p.note||''):''}" placeholder="ماذا اشتُري بالضبط"/></div>
      <div data-calc style="background:var(--surface3);border:1px solid var(--line);border-radius:10px;padding:11px 13px;font-size:12.5px;line-height:1.9"></div>
      <div class="lux-foot" style="margin-top:14px">
        ${p?'<button class="lux-btn lux-ghost" data-del style="flex:1;border-color:#7c4a55;color:#e29aa6">حذف</button>':''}
        <button class="lux-btn lux-gold" data-ok style="flex:1.6">${p?'حفظ التعديلات':'حفظ الفاتورة'}</button></div>`,{onMount(ov,close){
      const g=n=>ov.querySelector('[name='+n+']');
      const calc=()=>{const net=+g('net').value||0;
        ov.querySelector('[data-calc]').innerHTML=
          `<div>الصافي: <b class="num">${accFmt(net)}</b> ر.س · ضريبة ١٥٪: <b class="num">${accFmt(net*ACC_VAT)}</b> ر.س</div>
           <div>الإجمالي المستحق: <b style="color:var(--gold-light)" class="num">${accFmt(net*(1+ACC_VAT))}</b> ر.س</div>`;};
      g('net').oninput=calc;calc();
      const del=ov.querySelector('[data-del]');
      if(del)del.onclick=()=>{ACC_PUR=ACC_PUR.filter(x=>x.id!==id);accSavePur();close();SALON.go('accounting');LUX.toast('حُذفت الفاتورة','err');};
      ov.querySelector('[data-ok]').onclick=()=>{
        const net=+g('net').value||0;
        if(!g('supplier').value.trim()){LUX.toast('اكتبي اسم المورّد','err');return;}
        if(net<=0){LUX.toast('أدخلي مبلغاً صحيحاً','err');return;}
        const rec={id:p?p.id:Date.now(),date:g('date').value||accToday(),supplier:g('supplier').value.trim(),
          inv:g('inv').value.trim(),cat:g('cat').value,net,pay:g('pay').value,status:g('status').value,
          buyer:g('buyer').value,note:g('note').value.trim()};
        if(p)Object.assign(p,rec);else ACC_PUR.unshift(rec);
        accSavePur();close();ACC.tab='purchases';SALON.go('accounting');
        LUX.toast(p?'حُدّثت الفاتورة ✓':'سُجّلت فاتورة «'+rec.supplier+'» بـ '+accFmt(accPurTotal(rec))+' ر.س ✓','ok');
      };
    }});
  },

  /* ── مصروف تشغيلي ── */
  expForm(id){
    const e=id?ACC_EXP.find(x=>x.id===id):null;
    const by=['لمى المالكي',...STAFF.map(s=>s.n)];
    LUX.modal(e?'تعديل مصروف':'مصروف جديد',`
      <div class="lux-lead">المصاريف الثابتة والمتغيّرة: رواتب، إيجار، مرافق، تسويق، صيانة…</div>
      <div class="lux-two">
        <div class="lux-f"><label>نوع المصروف</label><select name="cat">${ACC_EXP_CATS.map(c=>`<option ${e&&e.cat===c?'selected':''}>${c}</option>`).join('')}</select></div>
        <div class="lux-f"><label>المبلغ (ر.س)</label><input name="amount" type="number" min="0" step="0.01" dir="ltr" style="text-align:right" value="${e?e.amount:''}"/></div>
      </div>
      <div class="lux-two">
        <div class="lux-f"><label>التاريخ</label><input type="date" name="date" value="${e?e.date:accToday()}"/></div>
        <div class="lux-f"><label>طريقة الدفع</label><select name="pay">${ACC_PAYS.map(c=>`<option ${e&&e.pay===c?'selected':''}>${c}</option>`).join('')}</select></div>
      </div>
      <div class="lux-two">
        <div class="lux-f"><label>الحالة</label><select name="status">
          <option value="paid" ${e&&e.status==='paid'?'selected':''}>مدفوع</option>
          <option value="due" ${e&&e.status==='due'?'selected':''}>مستحق</option></select></div>
        <div class="lux-f"><label>التكرار</label><select name="recur">
          <option value="0" ${e&&e.recur?'':'selected'}>مرة واحدة</option>
          <option value="1" ${e&&e.recur?'selected':''}>شهري متكرر</option></select></div>
      </div>
      <div class="lux-two">
        <div class="lux-f"><label>من صرفه</label><select name="by">${by.map(b=>`<option ${e&&e.by===b?'selected':''}>${b}</option>`).join('')}</select></div>
        <div class="lux-f"><label>البيان (اختياري)</label><input name="note" value="${e?(e.note||''):''}"/></div>
      </div>
      <div class="lux-foot" style="margin-top:14px">
        ${e?'<button class="lux-btn lux-ghost" data-del style="flex:1;border-color:#7c4a55;color:#e29aa6">حذف</button>':''}
        <button class="lux-btn lux-gold" data-ok style="flex:1.6">${e?'حفظ التعديلات':'حفظ المصروف'}</button></div>`,{onMount(ov,close){
      const g=n=>ov.querySelector('[name='+n+']');
      const del=ov.querySelector('[data-del]');
      if(del)del.onclick=()=>{ACC_EXP=ACC_EXP.filter(x=>x.id!==id);accSaveExp();close();SALON.go('accounting');LUX.toast('حُذف المصروف','err');};
      ov.querySelector('[data-ok]').onclick=()=>{
        const amount=+g('amount').value||0;
        if(amount<=0){LUX.toast('أدخلي مبلغاً صحيحاً','err');return;}
        const rec={id:e?e.id:Date.now(),date:g('date').value||accToday(),cat:g('cat').value,amount,
          pay:g('pay').value,status:g('status').value,recur:+g('recur').value,by:g('by').value,note:g('note').value.trim()};
        if(e)Object.assign(e,rec);else ACC_EXP.unshift(rec);
        accSaveExp();close();ACC.tab='expenses';SALON.go('accounting');
        LUX.toast(e?'حُدّث المصروف ✓':'سُجّل مصروف «'+rec.cat+'» بـ '+accFmt(amount)+' ر.س ✓','ok');
      };
    }});
  },

  /* رواتب الشهر من الموارد البشرية → مصروف واحد */
  importPayroll(){
    if(typeof hrLedger!=='function'||typeof STAFF==='undefined'){LUX.toast('تعذّر قراءة الرواتب','err');return;}
    const total=STAFF.reduce((t,s)=>t+(hrLedger(s.id).net||0),0);
    const m=ACC.month;
    const exists=ACC_EXP.find(e=>e.cat==='رواتب وأجور'&&accInMonth(e.date,m));
    LUX.confirm('استيراد رواتب '+accMonthName(m)+' من الموارد البشرية بإجمالي '+accFmt(total)+' ر.س'+(exists?' (سيُحدَّث القيد الموجود)':'')+'؟',()=>{
      if(exists){exists.amount=accNum(total);exists.note='مستورد من الموارد البشرية — '+STAFF.length+' موظفات';}
      else ACC_EXP.unshift({id:Date.now(),date:m+'-28',cat:'رواتب وأجور',amount:accNum(total),pay:'تحويل بنكي',
        status:'due',recur:1,by:'لمى المالكي',note:'مستورد من الموارد البشرية — '+STAFF.length+' موظفات'});
      accSaveExp();ACC.tab='expenses';SALON.go('accounting');
      LUX.toast('استُوردت الرواتب ✓ '+accFmt(total)+' ر.س','ok');
    });
  },

  export(){
    const m=ACC.month, S=accSummary(m);
    const rows=[['دفتر المحاسبة — '+accMonthName(m)],[],
      ['الملخّص'],['المبيعات',accNum(S.sales)],['المشتريات (شامل الضريبة)',accNum(S.purT)],
      ['المصروفات',accNum(S.expT)],['صافي الربح',accNum(S.net)],['مستحق على الصالون',accNum(S.due)],[],
      ['فواتير المشتريات'],['التاريخ','المورّد','رقم الفاتورة','التصنيف','من اشترى','قبل الضريبة','الضريبة','الإجمالي','الدفع','الحالة','البيان']];
    S.pur.forEach(p=>rows.push([p.date,p.supplier,p.inv,p.cat,p.buyer,accNum(p.net),accNum(p.net*ACC_VAT),accPurTotal(p),p.pay,p.status==='paid'?'مدفوعة':'مستحقة',p.note||'']));
    rows.push([],['المصروفات'],['التاريخ','النوع','المبلغ','الدفع','الحالة','التكرار','من صرفه','البيان']);
    S.exp.forEach(e=>rows.push([e.date,e.cat,accNum(e.amount),e.pay,e.status==='paid'?'مدفوع':'مستحق',e.recur?'شهري':'مرة واحدة',e.by||'',e.note||'']));
    rows.push([],['أين تذهب المبيعات'],['البند','المبلغ','٪ من المبيعات']);
    accOutBreakdown(m).forEach(([c,v])=>rows.push([c,accNum(v),S.sales?Math.round(v/S.sales*100)+'%':'—']));
    accCSV('luma-accounting-'+m+'.csv',rows);
    LUX.toast('صُدّر دفتر '+accMonthName(m)+' (CSV) ✓','ok');
  },
};
window.ACC=ACC;

SCREENS.accounting=()=>{
  const m=ACC.month, S=accSummary(m), sales=accSales(m);
  const tabs=[['overview','نظرة محاسبية'],['purchases','فواتير المشتريات'],['expenses','المصروفات']];
  const pct=v=>S.sales?Math.round(v/S.sales*100):0;
  const head=`
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:12px">
    <div><div style="font-weight:600;font-size:19px;color:var(--white)">محاسبة الصالون</div>
      <div style="font-size:13px;color:var(--gold-pale);margin-top:2px">مبيعات الشهر، ومشترياته ومصاريفه — لتعرفي أين يذهب كل ريال ومن صرفه</div></div>
    <div style="display:flex;gap:9px;flex-wrap:wrap;align-items:center">
      <select onchange="ACC.setMonth(this.value)" style="background:var(--bg);border:1px solid var(--line);border-radius:9px;padding:9px 12px;color:var(--white);font-family:inherit;font-size:13px">
        ${accMonths().map(x=>`<option value="${x}" ${x===m?'selected':''}>${accMonthName(x)}</option>`).join('')}</select>
      <button class="btn btn-ghost" onclick="ACC.export()">⤓ تصدير الدفتر</button>
      <button class="btn btn-ghost" onclick="ACC.expForm()">+ مصروف</button>
      <button class="btn btn-gold" onclick="ACC.purForm()">+ فاتورة مشتريات</button>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:20px">
    <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('wallet',19)}</div></div><div class="val">${accFmt(S.sales)}<span class="u">ر.س</span></div><div class="k">المبيعات — دخل الشهر</div></div>
    <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('bag',19)}</div></div><div class="val" style="color:#e29aa6">${accFmt(S.purT)}<span class="u">ر.س</span></div><div class="k">المشتريات (${S.pur.length} فاتورة) · ${pct(S.purT)}٪</div></div>
    <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('invoice',19)}</div></div><div class="val" style="color:#e29aa6">${accFmt(S.expT)}<span class="u">ر.س</span></div><div class="k">المصروفات (${S.exp.length} قيد) · ${pct(S.expT)}٪</div></div>
    <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('chart',19)}</div></div><div class="val" style="color:${S.net>=0?'#9fce99':'#e29aa6'}">${accFmt(S.net)}<span class="u">ر.س</span></div><div class="k">صافي الربح · ${pct(S.net)}٪ من المبيعات</div></div>
  </div>
  <div style="display:flex;gap:8px;border-bottom:1px solid var(--line);margin-bottom:20px;overflow-x:auto">
    ${tabs.map(([k,lb])=>`<button onclick="ACC.go('${k}')" style="background:none;border:none;cursor:pointer;font-family:inherit;font-size:14px;font-weight:600;padding:10px 16px;white-space:nowrap;border-bottom:2px solid ${ACC.tab===k?'var(--gold-light)':'transparent'};color:${ACC.tab===k?'var(--gold-light)':'var(--muted)'}">${lb}${k==='purchases'?` · ${S.pur.length}`:''}${k==='expenses'?` · ${S.exp.length}`:''}</button>`).join('')}
  </div>`;

  if(ACC.tab==='purchases'){
    const byBuyer=accGroup(S.pur,'buyer',accPurTotal), bySup=accGroup(S.pur,'supplier',accPurTotal);
    return head+`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:18px">
      <div class="card"><div class="sec-label">من يشتري؟ <span class="ln"></span></div>
        ${byBuyer.length?byBuyer.map(([n,v])=>`<div style="display:flex;align-items:center;gap:12px;padding:9px 0">
          <span style="font-size:13px;color:var(--cream);width:96px">${n}</span>
          <div style="flex:1;height:9px;background:var(--surface3);border-radius:10px;overflow:hidden"><span style="display:block;height:100%;width:${byBuyer[0][1]?v/byBuyer[0][1]*100:0}%;background:linear-gradient(90deg,#9c8047,#dbbd81);border-radius:10px"></span></div>
          <span class="num" style="font-size:15px;color:var(--white);width:74px;text-align:left">${accFmt(v)}</span></div>`).join(''):'<div style="color:var(--muted);font-size:12.5px">لا مشتريات هذا الشهر.</div>'}</div>
      <div class="card"><div class="sec-label">من نشتري منه؟ <span class="ln"></span></div>
        ${bySup.length?bySup.map(([n,v])=>`<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line-soft)">
          <span style="font-size:13px;color:var(--white)">${n}</span><span class="num" style="font-size:15px;color:var(--gold-light)">${accFmt(v)} <span style="font-size:10px;color:var(--muted)">ر.س</span></span></div>`).join(''):'<div style="color:var(--muted);font-size:12.5px">—</div>'}</div>
    </div>
    <div class="card" style="overflow-x:auto;padding:0">
      <table style="width:100%;min-width:980px;border-collapse:collapse;font-size:12.5px">
        <thead><tr style="background:var(--surface2);color:var(--gold)">
          ${['التاريخ','المورّد','رقم الفاتورة','التصنيف','من اشترى','قبل الضريبة','الإجمالي','الدفع','الحالة',''].map(h=>`<th style="padding:11px 13px;text-align:right;white-space:nowrap">${h}</th>`).join('')}
        </tr></thead>
        <tbody>${S.pur.length?S.pur.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(p=>`
          <tr style="border-top:1px solid var(--line-soft)">
            <td style="padding:10px 13px;color:var(--cream)" dir="ltr">${p.date}</td>
            <td style="padding:10px 13px;color:var(--white);font-weight:600">${p.supplier}${p.note?`<div style="font-size:10.5px;color:var(--muted);font-weight:400">${p.note}</div>`:''}</td>
            <td style="padding:10px 13px;color:var(--gold-pale)" dir="ltr">${p.inv||'—'}</td>
            <td style="padding:10px 13px"><span class="badge soft" style="font-size:10.5px">${p.cat}</span></td>
            <td style="padding:10px 13px;color:var(--cream)">${p.buyer||'—'}</td>
            <td style="padding:10px 13px" class="num">${accFmt(p.net)}</td>
            <td style="padding:10px 13px;color:var(--gold-light)" class="num">${accFmt(accPurTotal(p))}</td>
            <td style="padding:10px 13px;color:var(--muted);font-size:11.5px">${p.pay}</td>
            <td style="padding:10px 13px"><span class="badge ${p.status==='paid'?'green':'gold'}" style="font-size:10.5px">${p.status==='paid'?'مدفوعة':'مستحقة'}</span></td>
            <td style="padding:8px"><button class="btn btn-ghost" style="padding:6px 13px;font-size:11.5px" onclick="ACC.purForm(${p.id})">تعديل</button></td>
          </tr>`).join(''):'<tr><td colspan="10" style="padding:26px;text-align:center;color:var(--muted)">لا فواتير مشتريات هذا الشهر — سجّلي أول فاتورة من «+ فاتورة مشتريات».</td></tr>'}</tbody>
      </table>
    </div>`;
  }

  if(ACC.tab==='expenses'){
    const byCat=accGroup(S.exp,'cat',e=>accNum(e.amount));
    const fixed=S.exp.filter(e=>e.recur).reduce((t,e)=>t+accNum(e.amount),0);
    return head+`
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:18px">
      <div class="card"><div class="sec-label">المصاريف حسب النوع <span class="ln"></span></div>
        ${byCat.length?byCat.map(([n,v])=>`<div style="display:flex;align-items:center;gap:12px;padding:9px 0">
          <span style="font-size:13px;color:var(--cream);width:140px">${n}</span>
          <div style="flex:1;height:9px;background:var(--surface3);border-radius:10px;overflow:hidden"><span style="display:block;height:100%;width:${byCat[0][1]?v/byCat[0][1]*100:0}%;background:linear-gradient(90deg,#7c4a55,#c0566a);border-radius:10px"></span></div>
          <span class="num" style="font-size:15px;color:var(--white);width:74px;text-align:left">${accFmt(v)}</span></div>`).join(''):'<div style="color:var(--muted);font-size:12.5px">لا مصروفات هذا الشهر.</div>'}</div>
      <div class="card"><div class="sec-label">التزامات ثابتة ومستحقات <span class="ln"></span></div>
        <div class="lux-row" style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line-soft)"><span style="color:var(--cream);font-size:13px">مصاريف شهرية متكرّرة</span><span class="num" style="color:var(--gold-light);font-size:16px">${accFmt(fixed)} ر.س</span></div>
        <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line-soft)"><span style="color:var(--cream);font-size:13px">مستحق على الصالون (مشتريات + مصاريف)</span><span class="num" style="color:#e29aa6;font-size:16px">${accFmt(S.due)} ر.س</span></div>
        <div style="display:flex;justify-content:space-between;padding:10px 0"><span style="color:var(--cream);font-size:13px">نسبة المصاريف من المبيعات</span><span class="num" style="color:var(--white);font-size:16px">${pct(S.expT)}٪</span></div>
        <button class="btn btn-ghost" style="width:100%;margin-top:12px" onclick="ACC.importPayroll()">استيراد رواتب الشهر من الموارد البشرية</button></div>
    </div>
    <div class="card" style="overflow-x:auto;padding:0">
      <table style="width:100%;min-width:860px;border-collapse:collapse;font-size:12.5px">
        <thead><tr style="background:var(--surface2);color:var(--gold)">
          ${['التاريخ','نوع المصروف','المبلغ','الدفع','الحالة','التكرار','من صرفه',''].map(h=>`<th style="padding:11px 13px;text-align:right;white-space:nowrap">${h}</th>`).join('')}
        </tr></thead>
        <tbody>${S.exp.length?S.exp.slice().sort((a,b)=>b.date.localeCompare(a.date)).map(e=>`
          <tr style="border-top:1px solid var(--line-soft)">
            <td style="padding:10px 13px;color:var(--cream)" dir="ltr">${e.date}</td>
            <td style="padding:10px 13px;color:var(--white);font-weight:600">${e.cat}${e.note?`<div style="font-size:10.5px;color:var(--muted);font-weight:400">${e.note}</div>`:''}</td>
            <td style="padding:10px 13px;color:#e29aa6" class="num">${accFmt(e.amount)}</td>
            <td style="padding:10px 13px;color:var(--muted);font-size:11.5px">${e.pay}</td>
            <td style="padding:10px 13px"><span class="badge ${e.status==='paid'?'green':'gold'}" style="font-size:10.5px">${e.status==='paid'?'مدفوع':'مستحق'}</span></td>
            <td style="padding:10px 13px;color:var(--cream);font-size:11.5px">${e.recur?'شهري متكرر':'مرة واحدة'}</td>
            <td style="padding:10px 13px;color:var(--cream)">${e.by||'—'}</td>
            <td style="padding:8px"><button class="btn btn-ghost" style="padding:6px 13px;font-size:11.5px" onclick="ACC.expForm(${e.id})">تعديل</button></td>
          </tr>`).join(''):'<tr><td colspan="8" style="padding:26px;text-align:center;color:var(--muted)">لا مصروفات هذا الشهر — سجّلي أول مصروف من «+ مصروف».</td></tr>'}</tbody>
      </table>
    </div>`;
  }

  /* نظرة محاسبية: من أين يدخل المال وأين يذهب */
  const out=accOutBreakdown(m), mx=out.length?out[0][1]:0;
  const mxIn=sales.length?Math.max(...sales.map(r=>r.amount)):0;
  return head+`
  <div style="display:grid;grid-template-columns:1fr auto 1fr auto 1fr;gap:14px;align-items:center;margin-bottom:22px">
    <div class="card" style="text-align:center"><div style="font-size:13px;color:var(--gold-pale)">المبيعات</div><div class="num gold-fill" style="font-size:34px;margin:6px 0">${accFmt(S.sales)}</div><div style="font-size:11px;color:var(--muted)">ر.س — ${accMonthName(m)}</div></div>
    <div style="font-family:'Bodoni Moda',serif;font-size:24px;color:var(--gold-deep);text-align:center">−</div>
    <div class="card" style="text-align:center"><div style="font-size:13px;color:var(--gold-pale)">مشتريات + مصاريف</div><div class="num" style="font-size:34px;color:var(--red);margin:6px 0">${accFmt(S.out)}</div><div style="font-size:11px;color:var(--muted)">${S.pur.length} فاتورة · ${S.exp.length} قيد</div></div>
    <div style="font-family:'Bodoni Moda',serif;font-size:24px;color:var(--gold-deep);text-align:center">=</div>
    <div class="card" style="text-align:center;border-color:var(--gold-deep)"><div style="font-size:13px;color:var(--gold-pale)">صافي الربح</div><div class="num gold-fill" style="font-size:34px;margin:6px 0">${accFmt(S.net)}</div><div style="font-size:11px;color:var(--muted)">${pct(S.net)}٪ من المبيعات</div></div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1.3fr;gap:18px;align-items:start">
    <div class="card"><div class="sec-label">من أين تأتي المبيعات <span class="ln"></span></div>
      ${sales.map(r=>`<div style="display:flex;align-items:center;gap:12px;padding:9px 0">
        <span style="font-size:13px;color:var(--cream);width:110px">${r.cat}</span>
        <div style="flex:1;height:9px;background:var(--surface3);border-radius:10px;overflow:hidden"><span style="display:block;height:100%;width:${mxIn?r.amount/mxIn*100:0}%;background:linear-gradient(90deg,#4d7a49,#9fce99);border-radius:10px"></span></div>
        <span class="num" style="font-size:15px;color:var(--white);width:70px;text-align:left">${accFmt(r.amount)}</span></div>`).join('')}
      <div style="display:flex;justify-content:space-between;padding-top:12px;margin-top:8px;border-top:1px solid var(--line-soft)">
        <span style="font-size:13px;color:var(--gold-pale)">الإجمالي</span><span class="num" style="font-size:18px;color:var(--gold-light)">${accFmt(S.sales)} ر.س</span></div></div>
    <div class="card"><div class="sec-label">أين تذهب المبيعات <span class="ln"></span><span style="font-size:11px;color:var(--muted)">كل بند صرف ونسبته من المبيعات</span></div>
      ${out.length?out.map(([c,v])=>`<div style="display:flex;align-items:center;gap:12px;padding:9px 0">
        <span style="font-size:13px;color:var(--cream);width:150px">${c}</span>
        <div style="flex:1;height:9px;background:var(--surface3);border-radius:10px;overflow:hidden"><span style="display:block;height:100%;width:${mx?v/mx*100:0}%;background:linear-gradient(90deg,#7c4a55,#c0566a);border-radius:10px"></span></div>
        <span class="num" style="font-size:15px;color:var(--white);width:70px;text-align:left">${accFmt(v)}</span>
        <span style="font-size:11.5px;color:var(--muted);width:38px;text-align:left">${pct(v)}٪</span></div>`).join(''):'<div style="color:var(--muted);font-size:12.5px;padding:8px 0">لا مصروفات ولا مشتريات مسجّلة هذا الشهر.</div>'}
      <div style="display:flex;justify-content:space-between;padding-top:12px;margin-top:8px;border-top:1px solid var(--line-soft)">
        <span style="font-size:13px;color:var(--gold-pale)">يبقى في الصالون</span>
        <span class="num" style="font-size:18px;color:${S.net>=0?'#9fce99':'#e29aa6'}">${accFmt(S.net)} ر.س · ${pct(S.net)}٪</span></div></div>
  </div>
  ${S.due?`<div class="card" style="margin-top:18px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;border-color:var(--gold-deep)">
    <span style="font-size:13px;color:var(--gold-pale)">مستحق على الصالون لم يُدفع بعد (فواتير آجلة ومصاريف مستحقة)</span>
    <span class="num" style="font-size:22px;color:#e29aa6">${accFmt(S.due)} ر.س</span></div>`:''}`;
};
