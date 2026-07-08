/* لوما · داشبورد الصالون — الطاقم والموارد البشرية: ملفات، إجازات، طلبات وسلاسل، دوام وحضور، رواتب */
/* ── STAFF files tab (merged into the HR screen) ── */
function hrStaffTab(){
  const active=STAFF.filter(s=>spOf(s.id).status==='active').length;
  const rows=STAFF.map(s=>{
    const p=spOf(s.id);
    const cnt=APPTS.filter(a=>a.staff===s.id&&a.st!=='cancelled'&&a.st!=='blocked').length;const rev=cnt*380;
    const susp=p.status!=='active';
    return `<div class="card" style="display:flex;align-items:center;gap:16px;margin-bottom:12px;flex-wrap:wrap;${susp?'opacity:.65':''}">
    ${spAvatar(s,52)}
    <div style="flex:1;min-width:170px">
      <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span style="font-size:16px;color:var(--white);font-weight:600">${s.n}</span>${susp?'<span class="badge soft">موقوفة</span>':'<span class="badge green">نشطة</span>'}${p.docs.length?`<span class="badge gold" style="font-size:10px">📎 ${p.docs.length} مستند</span>`:''}</div>
      <div style="font-size:12.5px;color:var(--gold-pale);margin-top:2px">${s.role} · ${s.shift||'دوام كامل'}${p.phone?` · <span dir="ltr">${p.phone}</span>`:''}</div>
    </div>
    <div style="text-align:center"><div class="num" style="font-size:22px;color:var(--white)">${cnt}</div><div style="font-size:11px;color:var(--muted)">مواعيد اليوم</div></div>
    <div style="text-align:center"><div class="num" style="font-size:22px;color:var(--gold-light)">${rev.toLocaleString('en')}</div><div style="font-size:11px;color:var(--muted)">دخل اليوم (ر.س)</div></div>
    <button class="btn btn-gold" style="padding:8px 18px" onclick="SALON.viewStaff('${s.id}')">الملف الكامل</button>
  </div>`;}).join('');
  return `
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:22px">
    <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('staff',19)}</div></div><div class="val">${STAFF.length}</div><div class="k">إجمالي الطاقم</div></div>
    <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('users',19)}</div></div><div class="val">${active}</div><div class="k">نشطات · على رأس العمل</div></div>
    <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('invoice',19)}</div></div><div class="val">${STAFF.reduce((t,s)=>t+spOf(s.id).docs.length,0)}</div><div class="k">مستندات محفوظة</div></div>
  </div>
  <div class="sec-label">الموظفات <span class="ln"></span></div>
  ${rows}`;
}

/* ══════════ HR — الموارد البشرية (إجازات برصيد وتعارضات · دوام وحضور · رواتب متعددة المصادر) ══════════ */
const HR_LEAVE_KEY='luma_hr_leaves', HR_PAY_KEY='luma_hr_pay2', HR_SHIFT_KEY='luma_hr_shifts',
      HR_ATT_KEY='luma_hr_att', HR_ADV_KEY='luma_hr_advances', HR_CLOSE_KEY='luma_hr_closed';
const HR_DAYS=['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const HR_QUOTA=21; /* الرصيد السنوي للإجازات */
const hrLoad=(k,f)=>LumaStore.get(k,f);
const hrSave=(k,v)=>LumaStore.set(k,v);
const hrMonth=()=>new Date().toISOString().slice(0,7);

let HR_LEAVES=hrLoad(HR_LEAVE_KEY,null);
if(!HR_LEAVES){
  HR_LEAVES=[
    {id:1,staff:'sara',from:'2026-07-14',to:'2026-07-16',type:'سنوية',reason:'سفر عائلي',status:'pending'},
    {id:2,staff:'reem',from:'2026-07-10',to:'2026-07-10',type:'طارئة',reason:'',status:'pending'},
    {id:3,staff:'nora',from:'2026-06-22',to:'2026-06-24',type:'مرضية',reason:'',status:'approved'},
  ];
  hrSave(HR_LEAVE_KEY,HR_LEAVES);
}
/* حضور تجريبي: تأخيرات وغياب هذا الأسبوع */
let HR_ATT=hrLoad(HR_ATT_KEY,null);
if(!HR_ATT){HR_ATT={sara:{1:{late:45}},reem:{3:{late:20}},nora:{2:{absent:true}}};hrSave(HR_ATT_KEY,HR_ATT);}
/* مبيعات منتجات وبقشيش تجريبية لكل موظفة (شهرياً) */
const HR_PROD={amal:5200,sara:3400,nora:6100,reem:2800};
const HR_TIPS={amal:640,sara:380,nora:520,reem:290};

const hrPay=()=>hrLoad(HR_PAY_KEY,{});
const hrPayOf=sid=>({base:3500,pct:10,prodPct:15,tierAt:15000,tierPct:12,...(hrPay()[sid]||{})});
const hrAdvances=()=>hrLoad(HR_ADV_KEY,{});
const hrAdvOf=sid=>((hrAdvances()[hrMonth()]||{})[sid])||0;
const hrClosed=()=>!!(hrLoad(HR_CLOSE_KEY,{})[hrMonth()]);
const hrShifts=()=>hrLoad(HR_SHIFT_KEY,{});
const hrShiftOf=(sid,d)=>{const s=(hrShifts()[sid]||{})[d];return s||((d===5)?{off:true}:{off:false,start:'10:00',end:'20:00'});};
const hrStaffName=id=>{const s=STAFF.find(x=>x.id===id);return s?s.n:id;};
const hrAttOf=(sid,d)=>((HR_ATT[sid]||{})[d])||null;
function hrOnLeaveToday(sid){
  const t=new Date().toISOString().slice(0,10);
  return HR_LEAVES.some(l=>l.staff===sid&&l.status==='approved'&&l.from<=t&&l.to>=t);
}
/* رصيد الإجازات: الحصة السنوية − أيام السنوية المعتمدة هذه السنة */
function hrBalance(sid){
  const yr=new Date().getFullYear();
  const used=HR_LEAVES.filter(l=>l.staff===sid&&l.status==='approved'&&l.type==='سنوية'&&l.from.startsWith(yr))
    .reduce((t,l)=>t+((new Date(l.to)-new Date(l.from))/86400000+1),0);
  return Math.max(0,HR_QUOTA-used);
}
/* حجوزات متعارضة مع فترة الإجازة (نموذج اليوم الواحد في اللوحة) */
function hrConflicts(l){
  const t=new Date().toISOString().slice(0,10);
  if(l.from>t||l.to<t)return [];
  return APPTS.filter(a=>a.staff===l.staff&&a.st!=='cancelled'&&a.st!=='blocked');
}
/* الرواتب متعددة المصادر: خدمات (بشرائح) + منتجات + بقشيش − سلف */
function hrLedger(sid){
  const p=hrPayOf(sid);
  const svc=APPTS.filter(a=>a.staff===sid&&a.st!=='cancelled'&&a.st!=='blocked').length*380*24;
  const rate=svc>=p.tierAt?p.tierPct:p.pct;
  const svcComm=Math.round(svc*rate/100);
  const prod=HR_PROD[sid]||0, prodComm=Math.round(prod*p.prodPct/100);
  const tips=HR_TIPS[sid]||0, adv=hrAdvOf(sid);
  const att=HR_ATT[sid]||{};
  const late=Object.values(att).reduce((t,d)=>t+(d.late||0),0);
  const abs=Object.values(att).filter(d=>d.absent).length;
  return {p,svc,rate,svcComm,prod,prodComm,tips,adv,late,abs,
          net:p.base+svcComm+prodComm+tips-adv};
}

/* ── custom request types (owner-defined forms) + approval chains ── */
const REQ_TYPES_KEY='luma_req_types', REQ_CHAINS_KEY='luma_req_chains',
      REQS_KEY='luma_requests', LEAVE_CHAIN_KEY='luma_leave_chain';
let HR_CHAINS=hrLoad(REQ_CHAINS_KEY,null);
if(!HR_CHAINS){
  HR_CHAINS=[
    {id:'c1',name:'اعتماد مباشر',steps:['المالكة']},
    {id:'c2',name:'سلسلة مزدوجة',steps:['مديرة الصالون','المالكة']},
  ];
  hrSave(REQ_CHAINS_KEY,HR_CHAINS);
}
let HR_RTYPES=hrLoad(REQ_TYPES_KEY,null);
if(!HR_RTYPES){
  HR_RTYPES=[
    {id:'t1',name:'طلب سلفة',chain:'c2',fields:[{label:'المبلغ (ر.س)',type:'number',req:1},{label:'سبب السلفة',type:'text',req:0}]},
    {id:'t2',name:'خطاب تعريف',chain:'c1',fields:[{label:'الجهة الموجَّه لها',type:'text',req:1},{label:'اللغة',type:'select',options:['عربي','إنجليزي'],req:1}]},
  ];
  hrSave(REQ_TYPES_KEY,HR_RTYPES);
}
let HR_REQS=hrLoad(REQS_KEY,[]);
const hrChainOf=id=>HR_CHAINS.find(c=>c.id===id)||HR_CHAINS[0]||{id:'x',name:'اعتماد مباشر',steps:['المالكة']};
const hrTypeOf=id=>HR_RTYPES.find(t=>t.id===id);
const hrLeaveChain=()=>hrChainOf(hrLoad(LEAVE_CHAIN_KEY,'c1'));
/* visual stepper: ✓ done · ● current · ○ upcoming */
function hrStepper(chain,step,status){
  return `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:8px">${chain.steps.map((nm,i)=>{
    const done=status==='approved'||i<step, cur=status==='pending'&&i===step;
    return `${i?'<span style="color:var(--muted-deep)">←</span>':''}
      <span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;padding:4px 10px;border-radius:20px;
        ${done?'background:rgba(111,168,106,.14);color:#9fce99;border:1px solid rgba(111,168,106,.4)'
        :cur?'background:rgba(205,172,80,.14);color:var(--gold-light);border:1px solid var(--gold-deep)'
        :'background:var(--surface3);color:var(--muted);border:1px solid var(--line)'}">
        ${done?'✓':cur?'●':'○'} ${nm}</span>`;}).join('')}</div>`;
}

const HR={
  tab:'staff',
  go(t){this.tab=t;SALON.go('hr');},
  review(id,ok){
    const l=HR_LEAVES.find(x=>x.id===id);if(!l)return;
    const chain=hrLeaveChain();l.step=l.step||0;
    /* توقيع خطوة وسيطة في سلسلة الموافقات — الطلب يبقى قيد المراجعة */
    if(ok&&l.step<chain.steps.length-1){
      l.step++;hrSave(HR_LEAVE_KEY,HR_LEAVES);SALON.go('hr');
      LUX.toast('وقّعت «'+chain.steps[l.step-1]+'» — بانتظار موافقة «'+chain.steps[l.step]+'»','ok');
      return;
    }
    if(ok&&l.type==='سنوية'){
      const days=(new Date(l.to)-new Date(l.from))/86400000+1;
      if(days>hrBalance(l.staff)){LUX.toast('رصيد '+hrStaffName(l.staff)+' لا يكفي ('+hrBalance(l.staff)+' يوماً متبقياً)','err');return;}
    }
    l.status=ok?'approved':'rejected';
    hrSave(HR_LEAVE_KEY,HR_LEAVES);
    if(ok){
      const cf=hrConflicts(l);
      if(cf.length){this.conflictModal(l,cf);return;}
      LUX.toast('اكتملت سلسلة الموافقات — حُدّث الدوام وحُظرت مواعيد الحجز تلقائياً ✓','ok');
    }else LUX.toast('تم رفض الطلب','ok');
    SALON.go('hr');
  },
  /* ─── الطلبات العامة: تقديم بحسب نوع وفورم تحدّدهما المالكة ─── */
  newRequest(){
    const opts=[{id:'__leave',name:'إجازة (نظامي)'}].concat(HR_RTYPES);
    LUX.modal('طلب جديد',`
      <div class="lux-lead">اختاري الموظفة ونوع الطلب — النموذج يظهر حسب النوع الذي عرّفتِه في «أنواع الطلبات».</div>
      <div class="lux-f"><label>الموظفة</label><select name="staff">${STAFF.map(s=>`<option value="${s.id}">${s.n}</option>`).join('')}</select></div>
      <div class="lux-f"><label>نوع الطلب</label><select name="type">${opts.map(t=>`<option value="${t.id}">${t.name}</option>`).join('')}</select></div>
      <button class="lux-btn lux-gold" data-ok style="width:100%">متابعة</button>`,{onMount(ov,close){
      ov.querySelector('[data-ok]').onclick=()=>{
        const staff=ov.querySelector('[name=staff]').value, tid=ov.querySelector('[name=type]').value;
        close();
        if(tid==='__leave')return HR.newLeave();
        HR.requestForm(tid,staff);
      };
    }});
  },
  requestForm(tid,staff){
    const t=hrTypeOf(tid);if(!t)return;
    const chain=hrChainOf(t.chain);
    const fld=(f,i)=>{
      const req=f.req?' <span style="color:#c0566a">*</span>':'';
      if(f.type==='select')return `<div class="lux-f"><label>${f.label}${req}</label><select data-f="${i}">${(f.options||[]).map(o=>`<option>${o}</option>`).join('')}</select></div>`;
      if(f.type==='date')return `<div class="lux-f"><label>${f.label}${req}</label><input type="date" data-f="${i}"/></div>`;
      if(f.type==='number')return `<div class="lux-f"><label>${f.label}${req}</label><input type="number" data-f="${i}" dir="ltr" style="text-align:right"/></div>`;
      return `<div class="lux-f"><label>${f.label}${req}</label><input data-f="${i}"/></div>`;
    };
    LUX.modal(t.name+' — '+hrStaffName(staff),`
      <div class="lux-lead">سلسلة الاعتماد: <b style="color:var(--gold-light,#ccab64)">${chain.steps.join(' ← ')}</b></div>
      ${t.fields.map(fld).join('')}
      <button class="lux-btn lux-gold" data-ok style="width:100%;margin-top:6px">إرسال الطلب</button>`,{onMount(ov,close){
      ov.querySelector('[data-ok]').onclick=()=>{
        const values={};
        for(let i=0;i<t.fields.length;i++){
          const el=ov.querySelector(`[data-f="${i}"]`);
          if(t.fields[i].req&&!el.value.trim()){el.style.borderColor='#c0566a';el.focus();return;}
          values[t.fields[i].label]=el.value.trim();
        }
        HR_REQS.unshift({id:Date.now(),type:tid,staff,values,step:0,status:'pending',at:new Date().toISOString().slice(0,10)});
        hrSave(REQS_KEY,HR_REQS);close();SALON.go('hr');
        LUX.toast('أُرسل الطلب — بانتظار «'+chain.steps[0]+'» ✓','ok');
      };
    }});
  },
  reviewReq(id,ok){
    const r=HR_REQS.find(x=>x.id===id);if(!r)return;
    const chain=hrChainOf((hrTypeOf(r.type)||{}).chain);
    if(!ok){r.status='rejected';}
    else if(r.step<chain.steps.length-1){
      r.step++;hrSave(REQS_KEY,HR_REQS);SALON.go('hr');
      LUX.toast('وقّعت «'+chain.steps[r.step-1]+'» — بانتظار «'+chain.steps[r.step]+'»','ok');return;
    }
    else r.status='approved';
    hrSave(REQS_KEY,HR_REQS);SALON.go('hr');
    LUX.toast(ok?'اكتملت سلسلة الموافقات — الطلب معتمد نهائياً ✓':'تم رفض الطلب','ok');
  },
  /* ─── إدارة أنواع الطلبات (فورم من تصميم المالكة) ─── */
  manageTypes(){
    const rows=HR_RTYPES.map(t=>`
      <div class="lux-row"><span class="k">${t.name}<br><span style="font-size:10.5px">${t.fields.length} حقول · سلسلة: ${hrChainOf(t.chain).name}</span></span>
      <span class="v"><button class="lux-btn lux-ghost" style="padding:6px 12px;font-size:11px" onclick="HR.delType('${t.id}')">حذف</button></span></div>`).join('')
      ||'<div class="lux-lead">لا أنواع مخصصة بعد.</div>';
    LUX.modal('أنواع الطلبات',`
      <div class="lux-lead">النوع يحدد النموذج الذي تعبّئه الموظفة وسلسلة الموافقات التي يمر بها.</div>
      <div class="lux-row"><span class="k">إجازة (نظامي)<br><span style="font-size:10.5px">نموذج ثابت + رصيد وتعارضات</span></span>
        <span class="v"><select id="lvChain" style="background:#0e0d11;border:1px solid var(--line,#26242d);border-radius:7px;color:#f6f2ec;padding:7px 9px;font-family:inherit;font-size:12px">${HR_CHAINS.map(c=>`<option value="${c.id}" ${hrLeaveChain().id===c.id?'selected':''}>${c.name}</option>`).join('')}</select></span></div>
      ${rows}
      <button class="lux-btn lux-gold" data-new style="width:100%;margin-top:14px">+ نوع طلب جديد</button>`,{onMount(ov,close){
      ov.querySelector('#lvChain').onchange=e=>{hrSave(LEAVE_CHAIN_KEY,e.target.value);LUX.toast('حُدّثت سلسلة موافقات الإجازات ✓','ok');};
      ov.querySelector('[data-new]').onclick=()=>{close();HR.typeBuilder();};
    }});
  },
  typeBuilder(){
    let fields=[];
    const render=ov=>{
      ov.querySelector('#tbFields').innerHTML=fields.map((f,i)=>`
        <div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:12.5px">
          <span style="flex:1;color:#f6f2ec">${f.label}</span>
          <span style="color:#86818d">${{text:'نص',number:'رقم',date:'تاريخ',select:'قائمة'}[f.type]}${f.req?' · إلزامي':''}</span>
          <button style="background:none;border:none;color:#c0566a;cursor:pointer" onclick="this.dispatchEvent(new CustomEvent('rmf',{bubbles:true,detail:${i}}))">×</button>
        </div>`).join('')||'<div style="color:#86818d;font-size:12px;padding:6px 0">أضيفي حقول النموذج…</div>';
    };
    LUX.modal('نوع طلب جديد',`
      <div class="lux-f"><label>اسم النوع</label><input name="tname" placeholder="مثال: طلب دورة تدريبية"/></div>
      <div class="lux-f"><label>سلسلة الموافقات</label><select name="tchain">${HR_CHAINS.map(c=>`<option value="${c.id}">${c.name} (${c.steps.join(' ← ')})</option>`).join('')}</select></div>
      <div style="font-size:12px;color:#9c8047;font-weight:700;margin:12px 0 6px">حقول النموذج</div>
      <div id="tbFields"></div>
      <div style="display:flex;gap:7px;margin-top:10px;flex-wrap:wrap">
        <input id="tbLabel" placeholder="تسمية الحقل" style="flex:2;min-width:120px;background:#0e0d11;border:1px solid var(--line,#26242d);border-radius:7px;color:#f6f2ec;padding:9px 11px;font-family:inherit;font-size:12.5px"/>
        <select id="tbType" style="background:#0e0d11;border:1px solid var(--line,#26242d);border-radius:7px;color:#f6f2ec;padding:9px;font-family:inherit;font-size:12.5px"><option value="text">نص</option><option value="number">رقم</option><option value="date">تاريخ</option><option value="select">قائمة خيارات</option></select>
        <label style="display:flex;align-items:center;gap:4px;font-size:11.5px;color:#86818d"><input type="checkbox" id="tbReq"/> إلزامي</label>
      </div>
      <input id="tbOpts" placeholder="الخيارات مفصولة بفاصلة (للقائمة فقط)" style="display:none;width:100%;margin-top:8px;background:#0e0d11;border:1px solid var(--line,#26242d);border-radius:7px;color:#f6f2ec;padding:9px 11px;font-family:inherit;font-size:12.5px"/>
      <button class="lux-btn lux-ghost" data-addf style="width:100%;margin-top:10px;padding:9px">+ إضافة الحقل</button>
      <button class="lux-btn lux-gold" data-ok style="width:100%;margin-top:12px">حفظ نوع الطلب</button>`,{onMount(ov,close){
      render(ov);
      ov.addEventListener('rmf',e=>{fields.splice(e.detail,1);render(ov);});
      ov.querySelector('#tbType').onchange=e=>ov.querySelector('#tbOpts').style.display=e.target.value==='select'?'':'none';
      ov.querySelector('[data-addf]').onclick=()=>{
        const lb=ov.querySelector('#tbLabel').value.trim();if(!lb)return;
        const ty=ov.querySelector('#tbType').value;
        const f={label:lb,type:ty,req:ov.querySelector('#tbReq').checked?1:0};
        if(ty==='select')f.options=ov.querySelector('#tbOpts').value.split(',').map(x=>x.trim()).filter(Boolean);
        fields.push(f);ov.querySelector('#tbLabel').value='';render(ov);
      };
      ov.querySelector('[data-ok]').onclick=()=>{
        const nm=ov.querySelector('[name=tname]').value.trim();
        if(!nm){ov.querySelector('[name=tname]').style.borderColor='#c0566a';return;}
        if(!fields.length){LUX.toast('أضيفي حقلاً واحداً على الأقل','err');return;}
        HR_RTYPES.push({id:'t'+Date.now(),name:nm,chain:ov.querySelector('[name=tchain]').value,fields});
        hrSave(REQ_TYPES_KEY,HR_RTYPES);close();SALON.go('hr');LUX.toast('أُنشئ نوع «'+nm+'» ✓','ok');
      };
    }});
  },
  delType(id){
    const i=HR_RTYPES.findIndex(t=>t.id===id);if(i<0)return;
    HR_RTYPES.splice(i,1);hrSave(REQ_TYPES_KEY,HR_RTYPES);
    document.querySelectorAll('.lux-ov').forEach(o=>o.remove());HR.manageTypes();
  },
  /* ─── إدارة سلاسل الموافقات ─── */
  manageChains(){
    const rows=HR_CHAINS.map(c=>`
      <div class="lux-row"><span class="k">${c.name}<br><span style="font-size:10.5px">${c.steps.join(' ← ')}</span></span>
      <span class="v">${HR_CHAINS.length>1?`<button class="lux-btn lux-ghost" style="padding:6px 12px;font-size:11px" onclick="HR.delChain('${c.id}')">حذف</button>`:''}</span></div>`).join('');
    LUX.modal('سلاسل الموافقات',`
      <div class="lux-lead">السلسلة تحدّد مَن يوقّع على الطلب وبأي ترتيب — يعتمد الطلب نهائياً بعد آخر توقيع.</div>
      ${rows}
      <div style="font-size:12px;color:#9c8047;font-weight:700;margin:14px 0 6px">سلسلة جديدة</div>
      <div class="lux-f"><label>اسم السلسلة</label><input id="chName" placeholder="مثال: اعتماد ثلاثي"/></div>
      <div class="lux-f"><label>الخطوات بالترتيب (مفصولة بفاصلة)</label><input id="chSteps" placeholder="مديرة الفرع، مديرة الموارد البشرية، المالكة"/></div>
      <button class="lux-btn lux-gold" data-ok style="width:100%">إضافة السلسلة</button>`,{onMount(ov,close){
      ov.querySelector('[data-ok]').onclick=()=>{
        const nm=ov.querySelector('#chName').value.trim();
        const steps=ov.querySelector('#chSteps').value.split(/[،,]/).map(x=>x.trim()).filter(Boolean);
        if(!nm){ov.querySelector('#chName').style.borderColor='#c0566a';return;}
        if(!steps.length){ov.querySelector('#chSteps').style.borderColor='#c0566a';LUX.toast('أدخلي خطوة واحدة على الأقل','err');return;}
        HR_CHAINS.push({id:'c'+Date.now(),name:nm,steps});
        hrSave(REQ_CHAINS_KEY,HR_CHAINS);close();SALON.go('hr');
        LUX.toast('أُنشئت سلسلة «'+nm+'» ('+steps.length+' خطوات) ✓','ok');
      };
    }});
  },
  delChain(id){
    if(HR_CHAINS.length<=1)return;
    const used=HR_RTYPES.some(t=>t.chain===id)||hrLoad(LEAVE_CHAIN_KEY,'c1')===id;
    if(used){LUX.toast('السلسلة مستخدمة في نوع طلب — غيّري النوع أولاً','err');return;}
    const i=HR_CHAINS.findIndex(c=>c.id===id);HR_CHAINS.splice(i,1);hrSave(REQ_CHAINS_KEY,HR_CHAINS);
    document.querySelectorAll('.lux-ov').forEach(o=>o.remove());HR.manageChains();
  },
  conflictModal(l,cf){
    const rows=cf.map(a=>`<div class="lux-row"><span class="k" dir="ltr">${slotLabel(a.start)}</span><span class="v">${a.client} · ${a.service}</span></div>`).join('');
    LUX.modal('هناك حجوزات نشطة خلال هذه الفترة',`
      <div class="lux-lead">لدى <b style="color:var(--gold-light)">${hrStaffName(l.staff)}</b> ${cf.length} حجزاً مؤكداً يتقاطع مع إجازتها المعتمدة — اختاري طريقة المعالجة:</div>
      ${rows}
      <button class="lux-btn lux-gold" data-dist style="width:100%;margin-top:16px">توزيع الحجوزات تلقائياً على زميلات متاحات</button>
      <button class="lux-btn lux-ghost" data-notify style="width:100%;margin-top:8px">إرسال إشعار اعتذار وإعادة جدولة للعملاء</button>`,{onMount(ov,close){
      ov.querySelector('[data-dist]').onclick=()=>{
        let moved=0,stuck=0;
        cf.forEach(a=>{
          const target=STAFF.find(s=>s.id!==l.staff&&!hrOnLeaveToday(s.id)&&spOf(s.id).status==='active'&&
            !APPTS.some(b=>b.staff===s.id&&b.st!=='cancelled'&&b.start<a.start+a.dur&&a.start<b.start+b.dur));
          if(target){a.staff=target.id;moved++;}else{a.st='cancelled';stuck++;}
        });
        close();SALON.go('hr');
        LUX.toast('وُزّع '+moved+' حجزاً تلقائياً'+(stuck?' — '+stuck+' بحاجة لإعادة جدولة':'')+' ✓','ok');
      };
      ov.querySelector('[data-notify]').onclick=()=>{
        cf.forEach(a=>a.st='cancelled');close();SALON.go('hr');
        LUX.toast('أُرسل إشعار الاعتذار وإعادة الجدولة لـ '+cf.length+' عميلة ✓','ok');
      };
    }});
  },
  newLeave(){
    const body=`
      <div class="lux-lead">قدّمي طلب إجازة — يظهر بحالة «قيد المراجعة» حتى يُعتمد.</div>
      <div class="lux-f"><label>الموظفة</label><select name="staff">${STAFF.map(s=>`<option value="${s.id}">${s.n} (رصيد: ${hrBalance(s.id)} يوماً)</option>`).join('')}</select></div>
      <div class="lux-two">
        <div class="lux-f"><label>من</label><input type="date" name="from"/></div>
        <div class="lux-f"><label>إلى</label><input type="date" name="to"/></div>
      </div>
      <div class="lux-f"><label>النوع</label><select name="type"><option>سنوية</option><option>مرضية</option><option>طارئة</option><option>بدون راتب</option></select></div>
      <div class="lux-f"><label>السبب (اختياري)</label><input name="reason" placeholder="…"/></div>
      <div class="lux-foot"><button class="lux-btn lux-ghost" data-c style="flex:1">إلغاء</button><button class="lux-btn lux-gold" data-ok style="flex:1.4">إرسال الطلب</button></div>`;
    LUX.modal('طلب إجازة جديد',body,{onMount(ov,close){
      ov.querySelector('[data-c]').onclick=close;
      ov.querySelector('[data-ok]').onclick=()=>{
        const g=n=>ov.querySelector('[name='+n+']');
        if(!g('from').value||!g('to').value){LUX.toast('حدّدي التاريخين','err');return;}
        if(g('to').value<g('from').value){LUX.toast('تاريخ النهاية قبل البداية','err');return;}
        const clash=HR_LEAVES.some(l=>l.staff===g('staff').value&&['pending','approved'].includes(l.status)&&l.from<=g('to').value&&l.to>=g('from').value);
        if(clash){LUX.toast('يوجد طلب إجازة آخر يتقاطع مع هذه الفترة','err');return;}
        HR_LEAVES.unshift({id:Date.now(),staff:g('staff').value,from:g('from').value,to:g('to').value,type:g('type').value,reason:g('reason').value.trim(),status:'pending'});
        hrSave(HR_LEAVE_KEY,HR_LEAVES);close();SALON.go('hr');LUX.toast('أُرسل الطلب ✓','ok');
      };
    }});
  },
  editShift(sid){
    const rows=HR_DAYS.map((d,i)=>{const sh=hrShiftOf(sid,i);return `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--line-soft)">
        <span style="width:70px;font-size:13px;color:var(--cream)">${d}</span>
        <label style="display:flex;align-items:center;gap:5px;font-size:12px;color:var(--muted)"><input type="checkbox" data-off="${i}" ${sh.off?'checked':''}/> إجازة</label>
        <input type="time" data-s="${i}" value="${sh.start||'10:00'}" ${sh.off?'disabled':''} style="background:#0e0d11;border:1px solid var(--line);border-radius:6px;color:var(--white);padding:6px 8px;font-size:12px"/>
        <span style="color:var(--muted)">←</span>
        <input type="time" data-e="${i}" value="${sh.end||'20:00'}" ${sh.off?'disabled':''} style="background:#0e0d11;border:1px solid var(--line);border-radius:6px;color:var(--white);padding:6px 8px;font-size:12px"/>
      </div>`;}).join('');
    LUX.modal('دوام '+hrStaffName(sid),`<div class="lux-lead">هذه الساعات هي مصدر الحقيقة لمواعيد الحجز المتاحة في صفحة العملاء.</div>`+rows+`<button class="lux-btn lux-gold" data-ok style="margin-top:16px;width:100%">حفظ الجدول</button>`,{onMount(ov,close){
      ov.querySelectorAll('[data-off]').forEach(cb=>cb.onchange=()=>{const i=cb.dataset.off;ov.querySelector(`[data-s="${i}"]`).disabled=cb.checked;ov.querySelector(`[data-e="${i}"]`).disabled=cb.checked;});
      ov.querySelector('[data-ok]').onclick=()=>{
        const all=hrShifts();all[sid]={};
        for(let i=0;i<7;i++){
          const off=ov.querySelector(`[data-off="${i}"]`).checked;
          const st=ov.querySelector(`[data-s="${i}"]`).value,en=ov.querySelector(`[data-e="${i}"]`).value;
          if(!off&&en<=st){LUX.toast('نهاية الوردية يجب أن تكون بعد بدايتها ('+HR_DAYS[i]+')','err');return;}
          all[sid][i]=off?{off:true}:{off:false,start:st,end:en};
        }
        hrSave(HR_SHIFT_KEY,all);close();SALON.go('hr');LUX.toast('تم تحديث الدوام — وانعكس فوراً على مواعيد الحجز ✓','ok');
      };
    }});
  },
  editPay(sid){
    if(hrClosed()){LUX.toast('الشهر مُصفّى — الأرقام مجمّدة','err');return;}
    const p=hrPayOf(sid);
    LUX.modal('راتب وعمولات '+hrStaffName(sid),`
      <div class="lux-f"><label>الراتب الأساسي (ر.س/شهر)</label><input name="base" dir="ltr" style="text-align:right" value="${p.base}"/></div>
      <div class="lux-two">
        <div class="lux-f"><label>عمولة الخدمات (٪)</label><input name="pct" dir="ltr" style="text-align:right" value="${p.pct}"/></div>
        <div class="lux-f"><label>عمولة المنتجات (٪)</label><input name="prodPct" dir="ltr" style="text-align:right" value="${p.prodPct}"/></div>
      </div>
      <div class="lux-lead" style="margin:4px 0 8px">الشريحة التحفيزية: إذا تجاوزت مبيعات الخدمات الحد، ترتفع النسبة تلقائياً.</div>
      <div class="lux-two">
        <div class="lux-f"><label>حد الشريحة (ر.س)</label><input name="tierAt" dir="ltr" style="text-align:right" value="${p.tierAt}"/></div>
        <div class="lux-f"><label>نسبة الشريحة (٪)</label><input name="tierPct" dir="ltr" style="text-align:right" value="${p.tierPct}"/></div>
      </div>
      <button class="lux-btn lux-gold" data-ok style="width:100%;margin-top:6px">حفظ</button>`,{onMount(ov,close){
      ov.querySelector('[data-ok]').onclick=()=>{
        const num=(n,mx)=>Math.min(mx,Math.max(0,parseFloat(ov.querySelector('[name='+n+']').value)||0));
        const all=hrPay();all[sid]={base:num('base',99999),pct:num('pct',100),prodPct:num('prodPct',100),tierAt:num('tierAt',999999),tierPct:num('tierPct',100)};
        hrSave(HR_PAY_KEY,all);close();SALON.go('hr');LUX.toast('تم تحديث الراتب ✓','ok');
      };
    }});
  },
  addAdvance(sid){
    if(hrClosed()){LUX.toast('الشهر مُصفّى — لا يمكن إضافة سلف','err');return;}
    LUX.modal('سلفة — '+hrStaffName(sid),`
      <div class="lux-f"><label>مبلغ السلفة (ر.س) — يُخصم من صافي هذا الشهر</label><input name="amt" dir="ltr" style="text-align:right" placeholder="0"/></div>
      <button class="lux-btn lux-gold" data-ok style="width:100%">تسجيل السلفة</button>`,{onMount(ov,close){
      ov.querySelector('[data-ok]').onclick=()=>{
        const v=parseFloat(ov.querySelector('[name=amt]').value)||0;
        if(v<=0){LUX.toast('أدخلي مبلغاً صحيحاً','err');return;}
        const all=hrAdvances();const m=hrMonth();all[m]=all[m]||{};all[m][sid]=(all[m][sid]||0)+v;
        hrSave(HR_ADV_KEY,all);close();SALON.go('hr');LUX.toast('سُجّلت السلفة وخُصمت من الصافي ✓','ok');
      };
    }});
  },
  closeMonth(){
    if(hrClosed())return;
    const total=STAFF.reduce((t,s)=>t+hrLedger(s.id).net,0);
    LUX.confirm('تصفية واعتماد رواتب شهر '+hrMonth()+' بإجمالي '+total.toLocaleString('en')+' ر.س؟ بعد الاعتماد تُجمَّد الأرقام وتُصدر قسائم الرواتب.',()=>{
      const all=hrLoad(HR_CLOSE_KEY,{});
      all[hrMonth()]={total,at:new Date().toISOString(),slips:STAFF.map(s=>({staff:s.n,...hrLedger(s.id)}))};
      hrSave(HR_CLOSE_KEY,all);SALON.go('hr');
      LUX.toast('تمت التصفية ✓ صدرت '+STAFF.length+' قسائم راتب وحُدّث النظام المحاسبي','ok');
    });
  },
};
window.HR=HR;

SCREENS.hr=()=>{
  const tabs=[['staff','الموظفات'],['leaves','الطلبات'],['shifts','جدول الدوام'],['payroll','الرواتب والعمولات']];
  const pending=HR_LEAVES.filter(l=>l.status==='pending').length;
  const head=`
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:12px">
    <div><div style="font-weight:600;font-size:19px;color:var(--white)">الطاقم والموارد البشرية</div><div style="font-size:13px;color:var(--gold-pale);margin-top:2px">ملفات الموظفات، الإجازات، الدوام والحضور، والرواتب — كلها تتزامن مع الحجوزات تلقائياً</div></div>
    ${HR.tab==='staff'?`<button class="btn btn-gold" onclick="SALON.addStaff()">+ إضافة موظفة</button>`:''}
    ${HR.tab==='leaves'?`<div style="display:flex;gap:9px;flex-wrap:wrap">
      <button class="btn btn-ghost" onclick="HR.manageChains()">سلاسل الموافقات</button>
      <button class="btn btn-ghost" onclick="HR.manageTypes()">أنواع الطلبات</button>
      <button class="btn btn-gold" onclick="HR.newRequest()">+ طلب جديد</button>
    </div>`:''}
  </div>
  <div style="display:flex;gap:8px;border-bottom:1px solid var(--line);margin-bottom:20px;overflow-x:auto">
    ${tabs.map(([k,lb])=>`<button onclick="HR.go('${k}')" style="background:none;border:none;cursor:pointer;font-family:inherit;font-size:14px;font-weight:600;padding:10px 16px;white-space:nowrap;border-bottom:2px solid ${HR.tab===k?'var(--gold-light)':'transparent'};color:${HR.tab===k?'var(--gold-light)':'var(--muted)'}">${lb}${k==='staff'?` · ${STAFF.length}`:''}${k==='leaves'&&pending?` · ${pending}`:''}</button>`).join('')}
  </div>`;

  if(HR.tab==='staff')return head+hrStaffTab();

  if(HR.tab==='leaves'){
    const ST={pending:['قيد المراجعة','gold'],approved:['معتمدة','green'],rejected:['مرفوضة','soft']};
    const lvChain=hrLeaveChain();
    const rows=HR_LEAVES.map(l=>`
      <div class="card" style="margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
          <span style="width:42px;height:42px;border-radius:50%;background:var(--surface3);border:1px solid var(--gold-deep);display:flex;align-items:center;justify-content:center;color:var(--gold-light)">${hrStaffName(l.staff).charAt(0)}</span>
          <div style="flex:1;min-width:200px">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span style="font-size:14.5px;color:var(--white);font-weight:600">${hrStaffName(l.staff)}</span>
              <span class="badge soft" style="font-size:10.5px">إجازة</span>
              <span class="badge soft" style="font-size:10.5px">الرصيد المتبقي: ${hrBalance(l.staff)} يوماً</span>
            </div>
            <div style="font-size:12px;color:var(--muted);margin-top:3px">${l.type} · <span dir="ltr">${l.from}</span> ← <span dir="ltr">${l.to}</span>${l.reason?` · «${l.reason}»`:''}</div>
          </div>
          ${l.status==='pending'
            ?`<button class="btn btn-gold" style="padding:8px 18px" onclick="HR.review(${l.id},true)">اعتماد «${lvChain.steps[l.step||0]}»</button>
               <button class="btn btn-ghost" style="padding:8px 18px;border-color:#7c4a55;color:#e29aa6" onclick="HR.review(${l.id},false)">رفض</button>`
            :`<span class="badge ${ST[l.status][1]}">${ST[l.status][0]}</span>`}
        </div>
        ${l.status!=='rejected'?hrStepper(lvChain,l.step||0,l.status):''}
      </div>`).join('');
    const reqRows=HR_REQS.map(r=>{
      const t=hrTypeOf(r.type)||{name:'نوع محذوف',fields:[]};
      const chain=hrChainOf(t.chain);
      const vals=Object.entries(r.values).filter(([k,v])=>v).map(([k,v])=>`<span style="color:var(--muted)">${k}:</span> ${v}`).join(' · ');
      return `
      <div class="card" style="margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
          <span style="width:42px;height:42px;border-radius:11px;background:var(--surface3);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;color:var(--gold-light)">📄</span>
          <div style="flex:1;min-width:200px">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span style="font-size:14.5px;color:var(--white);font-weight:600">${hrStaffName(r.staff)}</span>
              <span class="badge gold" style="font-size:10.5px">${t.name}</span>
              <span style="font-size:11px;color:var(--muted-deep)" dir="ltr">${r.at}</span>
            </div>
            <div style="font-size:12px;color:var(--cream);margin-top:3px">${vals||'—'}</div>
          </div>
          ${r.status==='pending'
            ?`<button class="btn btn-gold" style="padding:8px 18px" onclick="HR.reviewReq(${r.id},true)">اعتماد «${chain.steps[r.step]}»</button>
               <button class="btn btn-ghost" style="padding:8px 18px;border-color:#7c4a55;color:#e29aa6" onclick="HR.reviewReq(${r.id},false)">رفض</button>`
            :`<span class="badge ${ST[r.status][1]}">${ST[r.status][0]}</span>`}
        </div>
        ${r.status!=='rejected'?hrStepper(chain,r.step,r.status):''}
      </div>`;}).join('');
    return head+`
    <div class="sec-label">طلبات الإجازة <span class="ln"></span><span style="font-size:11px;color:var(--muted)">سلسلة الاعتماد: ${lvChain.name}</span></div>
    ${rows||'<div class="card" style="text-align:center;color:var(--muted);margin-bottom:10px">لا توجد طلبات إجازة.</div>'}
    <div class="sec-label" style="margin-top:22px">الطلبات العامة <span class="ln"></span><span style="font-size:11px;color:var(--muted)">${HR_RTYPES.length} أنواع معرّفة</span></div>
    ${reqRows||'<div class="card" style="text-align:center;color:var(--muted)">لا طلبات عامة بعد — قدّمي طلباً من زر «+ طلب جديد».</div>'}`;
  }

  if(HR.tab==='shifts'){
    return head+`
    <div class="card" style="overflow-x:auto;padding:0">
      <table style="width:100%;min-width:820px;border-collapse:collapse;font-size:13px">
        <thead><tr style="background:var(--surface2);color:var(--gold)">
          <th style="padding:12px 16px;text-align:right">الموظفة</th>
          ${HR_DAYS.map(d=>`<th style="padding:12px 8px">${d}</th>`).join('')}<th></th></tr></thead>
        <tbody>${STAFF.map(s=>{
          const led=hrLedger(s.id);
          return `
          <tr style="border-top:1px solid var(--line-soft)">
            <td style="padding:12px 16px;color:var(--white);font-weight:600">${s.n}${hrOnLeaveToday(s.id)?' <span class="badge gold" style="margin-right:6px">في إجازة اليوم</span>':''}
              ${led.late||led.abs?`<div style="font-size:10px;color:#e29aa6;font-weight:400;margin-top:3px">هذا الشهر: ${led.late?led.late+' دقيقة تأخير':''}${led.late&&led.abs?' · ':''}${led.abs?led.abs+' غياب':''}</div>`:''}</td>
            ${HR_DAYS.map((_,i)=>{const sh=hrShiftOf(s.id,i);const att=hrAttOf(s.id,i);
              return `<td style="padding:8px;text-align:center;${att?'background:rgba(192,86,106,0.10)':''}">${sh.off?'<span style="color:var(--muted-deep);font-size:11.5px">إجازة</span>':`<span dir="ltr" style="background:var(--surface3);border-radius:6px;padding:3px 7px;font-size:11px;color:var(--gold-pale)">${sh.start}–${sh.end}</span>`}${att?`<div style="font-size:10px;color:#e29aa6;margin-top:4px">${att.absent?'غياب':'تأخير '+att.late+' دقيقة'}</div>`:''}</td>`;}).join('')}
            <td style="padding:8px"><button class="btn btn-ghost" style="padding:6px 14px;font-size:12px" onclick="HR.editShift('${s.id}')">تعديل</button></td>
          </tr>`;}).join('')}</tbody>
      </table>
    </div>
    <div style="font-size:11.5px;color:var(--muted);margin-top:12px">الساعات أعلاه هي مصدر الحقيقة لمواعيد الحجز المتاحة · التأخيرات والغيابات تُرحَّل تلقائياً إلى حاسبة الرواتب نهاية الشهر.</div>`;
  }

  /* payroll — multi-source ledger */
  const closed=hrClosed();
  const rows=STAFF.map(s=>{
    const L=hrLedger(s.id);
    return `<tr style="border-top:1px solid var(--line-soft)">
      <td style="padding:11px 14px;color:var(--white);font-weight:600">${s.n}<span style="font-size:11px;color:var(--muted);margin-right:8px">${s.role}</span></td>
      <td style="padding:11px" class="num">${L.p.base.toLocaleString('en')}</td>
      <td style="padding:11px" class="num">${L.svc.toLocaleString('en')}</td>
      <td style="padding:11px;color:var(--gold-pale)" class="num">${L.svcComm.toLocaleString('en')} <span style="font-size:10px;color:${L.rate!==L.p.pct?'#9fce99':'var(--muted)'}">(${L.rate}٪${L.rate!==L.p.pct?' شريحة ▲':''})</span></td>
      <td style="padding:11px;color:var(--gold-pale)" class="num">${L.prodComm.toLocaleString('en')} <span style="font-size:10px;color:var(--muted)">(${L.p.prodPct}٪ من ${L.prod.toLocaleString('en')})</span></td>
      <td style="padding:11px;color:#9fce99" class="num">${L.tips.toLocaleString('en')}</td>
      <td style="padding:11px;color:#e29aa6" class="num">−${L.adv.toLocaleString('en')}${closed?'':` <button class="btn btn-ghost" style="padding:3px 9px;font-size:10px" onclick="HR.addAdvance('${s.id}')">+ سلفة</button>`}</td>
      <td style="padding:11px;font-size:11px;color:${L.late||L.abs?'#e29aa6':'#9fce99'}">${L.late||L.abs?L.late+' د · '+L.abs+' غياب':'منتظم ✓'}</td>
      <td style="padding:11px;color:var(--gold-light);font-weight:700" class="num">${L.net.toLocaleString('en')}</td>
      <td style="padding:8px">${closed?'<span style="font-size:10.5px;color:var(--muted)">قسيمة ✓</span>':`<button class="btn btn-ghost" style="padding:6px 12px;font-size:11px" onclick="HR.editPay('${s.id}')">تعديل</button>`}</td>
    </tr>`;}).join('');
  const totalAll=STAFF.reduce((t,s)=>t+hrLedger(s.id).net,0);
  return head+`
  <div class="card" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:12px">
    <div><span style="font-size:13px;color:var(--gold-pale)">إجمالي رواتب شهر ${hrMonth()} — سجل نهائي متعدد المصادر (خدمات + منتجات + بقشيش − سلف)</span>
      <div class="num" style="font-size:26px;color:var(--gold-light);margin-top:4px">${totalAll.toLocaleString('en')} <span style="font-size:11px;color:var(--muted)">ر.س</span></div></div>
    ${closed
      ?'<span class="badge green" style="font-size:13px;padding:10px 20px">الشهر مُصفّى ومعتمد ✓</span>'
      :'<button class="btn btn-gold" onclick="HR.closeMonth()">تصفية واعتماد الرواتب</button>'}
  </div>
  <div class="card" style="overflow-x:auto;padding:0">
    <table style="width:100%;min-width:1020px;border-collapse:collapse;font-size:12.5px">
      <thead><tr style="background:var(--surface2);color:var(--gold)">
        ${['الموظفة','الأساسي','مبيعات الخدمات','عمولة الخدمات','عمولة المنتجات','بقشيش إلكتروني','سلف','الحضور','الصافي',''].map(h=>`<th style="padding:11px 14px;text-align:right;white-space:nowrap">${h}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
};

