/* ===== LUMA UI — shared interaction layer for all dashboards =====
   Adds real behavior to action buttons via event delegation:
   export (CSV download), add/edit forms, confirm dialogs, row details,
   context menus, schedules — without touching every button by hand.
   Already-wired controls (inline onclick / anchors / our own UI) are skipped. */
(function(){
  if(window.__LUMA_UI__) return; window.__LUMA_UI__=true;

  /* ---------- styles ---------- */
  const css=`
  .lux-toast-wrap{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9000;display:flex;flex-direction:column;gap:10px;align-items:center;pointer-events:none;}
  .lux-toast{background:#18171d;border:1px solid var(--gold-deep,#7c6335);color:var(--gold-light,#ccab64);padding:12px 22px;border-radius:30px;font-family:'Cairo',sans-serif;font-size:14px;box-shadow:0 12px 34px rgba(0,0,0,.5);opacity:0;transform:translateY(14px);transition:all .3s;max-width:90vw;}
  .lux-toast.show{opacity:1;transform:none;}
  .lux-toast.ok{border-color:#6fa86a;color:#9fce99;}
  .lux-toast.err{border-color:#c0566a;color:#e29aa6;}
  .lux-ov{position:fixed;inset:0;z-index:8900;background:rgba(0,0,0,.66);display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;transition:opacity .25s;}
  .lux-ov.show{opacity:1;}
  .lux-modal{background:linear-gradient(168deg,#1f1b16,#18171d);border:1px solid var(--line,#1b1a21);border-radius:16px;width:460px;max-width:100%;max-height:90vh;overflow-y:auto;transform:translateY(12px) scale(.98);transition:transform .25s;font-family:'Cairo',sans-serif;}
  .lux-ov.show .lux-modal{transform:none;}
  .lux-h{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:20px 22px;border-bottom:1px solid var(--line,#1b1a21);position:sticky;top:0;background:#18171d;z-index:2;}
  .lux-h h3{font-size:18px;color:#f6f2ec;font-weight:600;margin:0;}
  .lux-h .x{background:none;border:none;color:#86818d;font-size:24px;cursor:pointer;line-height:1;}
  .lux-b{padding:22px;}
  .lux-b .lux-lead{font-size:13.5px;color:#86818d;margin-bottom:18px;line-height:1.8;}
  .lux-f{margin-bottom:15px;} .lux-f label{display:block;font-size:13px;color:var(--gold-pale,#e6ce95);margin-bottom:7px;}
  .lux-f input,.lux-f select,.lux-f textarea{width:100%;background:#0e0d11;border:1px solid var(--line,#1b1a21);border-radius:8px;padding:12px 14px;color:#f6f2ec;font-family:'Cairo',sans-serif;font-size:14px;outline:none;resize:vertical;}
  .lux-f input:focus,.lux-f select:focus,.lux-f textarea:focus{border-color:var(--gold-deep,#7c6335);}
  .lux-two{display:grid;grid-template-columns:1fr 1fr;gap:12px;}
  .lux-row{display:flex;justify-content:space-between;gap:12px;padding:11px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:14px;}
  .lux-row:last-child{border-bottom:none;} .lux-row .k{color:#86818d;} .lux-row .v{color:#f6f2ec;font-weight:500;text-align:left;max-width:62%;}
  .lux-btn{font-family:'Cairo',sans-serif;font-weight:600;font-size:14.5px;padding:13px 20px;border-radius:8px;cursor:pointer;border:none;transition:all .2s;}
  .lux-gold{background:linear-gradient(120deg,#dbbd81,#ccab64 45%,#9c8047);color:#131217;width:100%;}
  .lux-gold:hover{filter:brightness(1.07);}
  .lux-ghost{background:transparent;border:1px solid var(--gold-deep,#7c6335);color:var(--gold-light,#ccab64);}
  .lux-foot{display:flex;gap:10px;margin-top:8px;}
  .lux-menu{position:fixed;z-index:9100;background:#18171d;border:1px solid var(--line,#1b1a21);border-radius:10px;padding:6px;box-shadow:0 16px 40px rgba(0,0,0,.55);min-width:170px;font-family:'Cairo',sans-serif;}
  .lux-menu button{display:flex;align-items:center;gap:9px;width:100%;text-align:right;background:none;border:none;color:#ece6da;font-size:13.5px;padding:10px 12px;border-radius:7px;cursor:pointer;}
  .lux-menu button:hover{background:rgba(156,124,58,.16);color:var(--gold-light,#ccab64);}
  .lux-menu button.danger:hover{background:rgba(192,86,106,.16);color:#e29aa6;}
  .lux-ok{width:74px;height:74px;border-radius:50%;border:1px solid var(--gold-deep,#7c6335);background:rgba(156,124,58,.12);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:34px;color:var(--gold-light,#ccab64);}
  .lux-seg{display:flex;gap:8px;margin-bottom:16px;}
  .lux-seg button{flex:1;font-family:'Cairo',sans-serif;font-size:13.5px;color:#86818d;background:#0e0d11;border:1px solid var(--line,#1b1a21);border-radius:9px;padding:11px 8px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;transition:all .2s;}
  .lux-seg button.on{background:linear-gradient(120deg,rgba(220,192,106,.16),rgba(156,124,58,.05));border-color:var(--gold-light,#ccab64);color:var(--gold-light,#ccab64);}
  .lux-chips{display:flex;flex-wrap:wrap;gap:8px;}
  .lux-chip{font-family:'Cairo',sans-serif;font-size:13px;color:#ece6da;background:#0e0d11;border:1px solid var(--line,#1b1a21);border-radius:30px;padding:8px 16px;cursor:pointer;transition:all .2s;}
  .lux-chip:hover{border-color:var(--gold-deep,#7c6335);}
  .lux-chip.on{background:linear-gradient(120deg,#dbbd81,#9c8047);color:#131217;border-color:transparent;font-weight:500;}
  .lux-pr{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.05);}
  .lux-pr:last-child{border-bottom:none;}
  .lux-ck{width:20px;height:20px;border-radius:6px;border:1px solid var(--gold-deep,#7c6335);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;color:transparent;font-size:13px;background:#0e0d11;}
  .lux-ck.on{background:linear-gradient(120deg,#dbbd81,#9c8047);border-color:transparent;color:#131217;}
  .lux-pr .nm{font-size:14px;color:#f6f2ec;font-weight:500;} .lux-pr .bk{font-size:11.5px;color:#86818d;direction:ltr;text-align:right;}
  .lux-pr .amt{margin-right:auto;font-family:'Bodoni Moda',serif;font-size:18px;color:var(--gold-light,#ccab64);direction:ltr;}
  .lux-pr.done{opacity:.75;}
  .lux-spin{width:44px;height:44px;border:3px solid rgba(205,172,80,.25);border-top-color:#ccab64;border-radius:50%;margin:8px auto 16px;animation:luxspin .8s linear infinite;}
  @keyframes luxspin{to{transform:rotate(360deg)}}
  .lux-radio{width:18px;height:18px;border-radius:50%;border:1px solid var(--gold-deep,#7c6335);flex-shrink:0;display:flex;align-items:center;justify-content:center;}
  .lux-radio.on{border-color:var(--gold-light,#ccab64);}
  .lux-radio.on::after{content:'';width:9px;height:9px;border-radius:50%;background:linear-gradient(120deg,#dbbd81,#9c8047);}
  .lux-av{width:38px;height:38px;border-radius:50%;background:#201f26;border:1px solid var(--gold-deep,#7c6335);display:flex;align-items:center;justify-content:center;color:var(--gold-light,#ccab64);font-family:'Bodoni Moda',serif;font-size:16px;flex-shrink:0;}
  .lux-opt{cursor:pointer;border-radius:8px;padding:11px 10px;transition:background .15s;}
  .lux-opt:hover{background:rgba(156,124,58,.08);}
  `;
  const st=document.createElement('style');st.textContent=css;document.head.appendChild(st);

  const tw=document.createElement('div');tw.className='lux-toast-wrap lux-root';document.body.appendChild(tw);

  /* ---------- primitives ---------- */
  function toast(msg,type){
    const t=document.createElement('div');t.className='lux-toast'+(type?(' '+type):'');t.textContent=msg;tw.appendChild(t);
    requestAnimationFrame(()=>t.classList.add('show'));
    setTimeout(()=>{t.classList.remove('show');setTimeout(()=>t.remove(),300);},2600);
  }
  function modal(title,body,opts){
    opts=opts||{};
    const ov=document.createElement('div');ov.className='lux-ov lux-root';
    ov.innerHTML=`<div class="lux-modal"><div class="lux-h"><h3>${title}</h3><button class="x" aria-label="إغلاق">×</button></div><div class="lux-b">${body}</div></div>`;
    document.body.appendChild(ov);requestAnimationFrame(()=>ov.classList.add('show'));
    const close=()=>{ov.classList.remove('show');setTimeout(()=>ov.remove(),250);};
    ov.querySelector('.x').addEventListener('click',close);
    ov.addEventListener('click',e=>{if(e.target===ov)close();});
    if(opts.onMount)opts.onMount(ov,close);
    return {ov,close};
  }
  function confirmBox(msg,onYes,danger){
    const {ov,close}=modal('تأكيد',`<div class="lux-lead">${msg}</div><div class="lux-foot"><button class="lux-btn lux-ghost" data-no style="flex:1">إلغاء</button><button class="lux-btn ${danger?'':'lux-gold'}" data-yes style="flex:1;${danger?'background:#b14a5c;color:#fff':''}">${danger?'نعم، تأكيد':'تأكيد'}</button></div>`,
      {onMount(ov,close){ov.querySelector('[data-no]').onclick=close;ov.querySelector('[data-yes]').onclick=()=>{close();onYes&&onYes();};}});
  }
  function menu(x,y,items){
    document.querySelectorAll('.lux-menu').forEach(m=>m.remove());
    const m=document.createElement('div');m.className='lux-menu lux-root';
    m.innerHTML=items.map((it,i)=>`<button data-i="${i}" class="${it.danger?'danger':''}">${it.label}</button>`).join('');
    document.body.appendChild(m);
    const r=m.getBoundingClientRect();
    m.style.left=Math.min(x,innerWidth-r.width-10)+'px';
    m.style.top=Math.min(y,innerHeight-r.height-10)+'px';
    items.forEach((it,i)=>m.querySelector(`[data-i="${i}"]`).onclick=()=>{m.remove();it.fn&&it.fn();});
    setTimeout(()=>document.addEventListener('click',function h(){m.remove();document.removeEventListener('click',h);}),0);
  }
  function field(label,name,opts){opts=opts||{};
    if(opts.type==='select')return `<div class="lux-f"><label>${label}</label><select name="${name}">${(opts.options||[]).map(o=>`<option>${o}</option>`).join('')}</select></div>`;
    if(opts.type==='textarea')return `<div class="lux-f"><label>${label}</label><textarea name="${name}" rows="${opts.rows||3}" placeholder="${opts.ph||''}">${opts.val||''}</textarea></div>`;
    return `<div class="lux-f"><label>${label}</label><input name="${name}" value="${opts.val||''}" placeholder="${opts.ph||''}" ${opts.dir?`dir="${opts.dir}" style="text-align:right"`:''}/></div>`;
  }
  function formModal(title,lead,fields,okLabel,onOk){
    const body=`<div class="lux-lead">${lead}</div>${fields.join('')}<button class="lux-btn lux-gold" data-ok style="margin-top:6px">${okLabel}</button>`;
    modal(title,body,{onMount(ov,close){
      ov.querySelector('[data-ok]').onclick=()=>{
        const data={};ov.querySelectorAll('input,select,textarea').forEach(el=>data[el.name]=el.value);
        const req=ov.querySelector('input,select,textarea');
        if(req && !req.value.trim()){req.style.borderColor='#c0566a';req.focus();return;}
        close();onOk?onOk(data):toast('تم الحفظ بنجاح ✓','ok');
      };
    }});
  }

  /* ---------- CSV export from nearest table ---------- */
  function tableNear(btn){
    const scope=btn.closest('.screen,.scr,.main,body')||document;
    return scope.querySelector('.ptable,.btable,.ftable,table,.ctable');
  }
  function exportCSV(btn){
    const tb=tableNear(btn);
    if(!tb){toast('تم تجهيز التقرير ✓','ok');return;}
    const headSel=tb.querySelector('.pth,.bth,.fth,thead tr,.cth');
    const rowSel='.ptr,.btr,.ftr,.ctr';
    let rows=[...tb.querySelectorAll(rowSel)];
    if(!rows.length)rows=[...tb.querySelectorAll('tbody tr,tr')].filter(r=>r!==headSel);
    rows=rows.filter(r=>r.style.display!=='none');
    const cells=el=>[...el.children].map(c=>('"'+c.textContent.replace(/\s+/g,' ').trim().replace(/"/g,'""')+'"'));
    const lines=[];
    if(headSel)lines.push(cells(headSel).join(','));
    rows.forEach(r=>lines.push(cells(r).join(',')));
    if(lines.length<2){toast('تم تجهيز التقرير ✓','ok');return;}
    const blob=new Blob(['﻿'+lines.join('\n')],{type:'text/csv;charset=utf-8;'});
    const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='luma-export-'+Date.now()+'.csv';a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1500);
    toast('تم تصدير '+rows.length+' سجلًا (CSV) ✓','ok');
  }

  /* ---------- payouts (تنفيذ التحويلات) ---------- */
  const PAYOUTS=[
    {n:'رهف العتيبي',bank:'الراجحي ····2291',amount:17150},
    {n:'لمياء الزهراني',bank:'الأهلي ····8842',amount:12300},
    {n:'دانة الشهري',bank:'الإنماء ····5570',amount:9840},
    {n:'نورة القحطاني',bank:'الراجحي ····3380',amount:9300},
    {n:'ريم العنزي',bank:'بنك البلاد ····1120',amount:6420},
    {n:'سارة الغامدي',bank:'الراجحي ····7765',amount:5400},
  ];
  function payoutFlow(){
    const list=PAYOUTS.map(p=>({...p,sel:true}));
    const fmt=n=>n.toLocaleString('en');
    const selTotal=()=>list.filter(p=>p.sel).reduce((s,p)=>s+p.amount,0);
    const selCount=()=>list.filter(p=>p.sel).length;
    const rowsHTML=()=>list.map((p,i)=>`<div class="lux-pr"><button type="button" class="lux-ck on" data-ck="${i}">✓</button><div><div class="nm">${p.n}</div><div class="bk">${p.bank}</div></div><div class="amt">${fmt(p.amount)} ر.س</div></div>`).join('');
    const body=`
      <div class="lux-lead">يوجد <b style="color:#f6f2ec">${list.length} تحويلًا</b> مستحقًا للمزوّدين. اختاري التحويلات ثم نفّذيها دفعة واحدة عبر بوابة الدفع.</div>
      <div class="lux-pr" style="border-bottom:1px solid var(--line,#1b1a21)"><button type="button" class="lux-ck on" id="luxAll">✓</button><div class="nm">تحديد الكل</div></div>
      <div id="luxRows">${rowsHTML()}</div>
      <div class="lux-row" style="margin-top:8px"><span class="k">الإجمالي المحدد</span><span class="v" id="luxSum" style="color:var(--gold-light,#ccab64);font-family:'Bodoni Moda',serif;font-size:20px">${fmt(selTotal())} ر.س</span></div>
      <div class="lux-foot" style="margin-top:14px"><button class="lux-btn lux-ghost" data-cancel style="flex:1">إلغاء</button><button class="lux-btn lux-gold" data-go style="flex:1.4">تنفيذ <span id="luxGoN">${selCount()}</span> تحويل</button></div>`;
    modal('تنفيذ التحويلات للمزوّدين',body,{onMount(ov,close){
      const sumEl=ov.querySelector('#luxSum'),goN=ov.querySelector('#luxGoN'),allBtn=ov.querySelector('#luxAll');
      const refresh=()=>{sumEl.textContent=fmt(selTotal())+' ر.س';goN.textContent=selCount();allBtn.classList.toggle('on',selCount()===list.length);};
      ov.querySelectorAll('[data-ck]').forEach(b=>b.onclick=()=>{const i=+b.dataset.ck;list[i].sel=!list[i].sel;b.classList.toggle('on',list[i].sel);refresh();});
      allBtn.onclick=()=>{const all=selCount()!==list.length;list.forEach(p=>p.sel=all);ov.querySelectorAll('[data-ck]').forEach(b=>b.classList.toggle('on',all));refresh();};
      ov.querySelector('[data-cancel]').onclick=close;
      ov.querySelector('[data-go]').onclick=()=>{
        const chosen=list.filter(p=>p.sel);
        if(!chosen.length){toast('اختاري تحويلًا واحدًا على الأقل','err');return;}
        const total=chosen.reduce((s,p)=>s+p.amount,0),cnt=chosen.length;
        const b=ov.querySelector('.lux-b');
        b.innerHTML=`<div style="text-align:center;padding:14px 0"><div class="lux-spin"></div><div style="color:#f6f2ec;font-size:15px;font-weight:500">جارٍ تنفيذ ${cnt} تحويل…</div><div style="color:#86818d;font-size:12.5px;margin-top:6px">يتم التحقق عبر بوابة الدفع</div></div>`;
        setTimeout(()=>{
          const ref='PAYOUT-'+Math.floor(100000+Math.random()*900000);
          b.innerHTML=`<div style="text-align:center"><div class="lux-ok">✓</div><h3 style="color:#f6f2ec;font-size:20px;font-weight:600;margin:0">تم تنفيذ التحويلات ✨</h3><div style="color:var(--gold-pale,#e6ce95);font-size:13.5px;margin-top:8px">حُوّل <b style="color:#f6f2ec">${fmt(total)} ر.س</b> إلى <b style="color:#f6f2ec">${cnt}</b> مزوّدة بنجاح.</div></div>
            <div class="lux-row" style="margin-top:18px"><span class="k">رقم الدفعة</span><span class="v" style="font-family:'IBM Plex Mono',monospace;color:var(--gold-light,#ccab64)">${ref}</span></div>
            ${chosen.map(p=>`<div class="lux-pr done"><span style="color:#6fa86a;font-size:15px">✓</span><div><div class="nm">${p.n}</div><div class="bk">${p.bank}</div></div><div class="amt">${fmt(p.amount)} ر.س</div></div>`).join('')}
            <button class="lux-btn lux-gold" data-done style="margin-top:16px">تم</button>`;
          b.querySelector('[data-done]').onclick=close;
          toast('تم تنفيذ '+cnt+' تحويل بقيمة '+fmt(total)+' ر.س ✓','ok');
        },1100);
      };
    }});
  }

  /* ---------- commissions control (التحكم في العمولات) ---------- */
  function commissionEditor(){
    const TIERS=[{nm:'سَناء',rate:12,subs:50},{nm:'وَهَج',rate:10,subs:86},{nm:'فَرِيد',rate:8,subs:28}];
    const body=`
      <div class="lux-lead">تحكّمي في نسبة عمولة المنصة لكل باقة. تُطبَّق على حجوزات المزوّدات ضمن كل باقة فورًا بعد الحفظ.</div>
      ${TIERS.map((t,i)=>`<div class="lux-f"><label>${t.nm} <span style="color:#86818d;font-weight:400">· ${t.subs} مزوّدة</span></label>
        <div style="display:flex;align-items:center;gap:12px">
          <input type="range" min="0" max="25" step="0.5" value="${t.rate}" data-r="${i}" style="flex:1"/>
          <div style="display:flex;align-items:center;gap:4px;background:#0e0d11;border:1px solid var(--line,#1b1a21);border-radius:8px;padding:8px 10px;min-width:74px;justify-content:center"><input data-n="${i}" value="${t.rate}" dir="ltr" style="width:38px;background:none;border:none;color:var(--gold-light,#ccab64);font-family:'IBM Plex Mono',monospace;font-size:15px;text-align:center;outline:none"/><span style="color:#86818d">%</span></div>
        </div></div>`).join('')}
      <div class="lux-row" style="margin-top:6px"><span class="k">متوسط العمولة المرجّح</span><span class="v" id="luxAvg" style="color:var(--gold-light,#ccab64)">—</span></div>
      <div class="lux-foot" style="margin-top:14px"><button class="lux-btn lux-ghost" data-c style="flex:1">إلغاء</button><button class="lux-btn lux-gold" data-s style="flex:1.4">حفظ نِسب العمولات</button></div>`;
    modal('التحكم في العمولات',body,{onMount(ov,close){
      const totSubs=TIERS.reduce((s,t)=>s+t.subs,0);
      const avg=()=>{let n=0;ov.querySelectorAll('[data-n]').forEach((el,i)=>n+=(parseFloat(el.value)||0)*TIERS[i].subs);return (n/totSubs).toFixed(1);};
      const upAvg=()=>ov.querySelector('#luxAvg').textContent=avg()+'%';
      ov.querySelectorAll('[data-r]').forEach(r=>r.oninput=()=>{const i=+r.dataset.r;ov.querySelector(`[data-n="${i}"]`).value=r.value;upAvg();});
      ov.querySelectorAll('[data-n]').forEach(n=>n.oninput=()=>{const i=+n.dataset.n;const v=Math.max(0,Math.min(25,parseFloat(n.value)||0));ov.querySelector(`[data-r="${i}"]`).value=v;upAvg();});
      upAvg();
      ov.querySelector('[data-c]').onclick=close;
      ov.querySelector('[data-s]').onclick=()=>{close();toast('تم تحديث نِسب العمولات ✓ · متوسط '+avg()+'%','ok');};
    }});
  }
  window.LUX_commissions=commissionEditor; /* LUX_payouts may be overridden per-page (admin payments) */

  /* ---------- row → detail ---------- */
  function rowDetail(row){
    const tb=row.closest('.ptable,.btable,.ftable,table');
    const head=tb&&tb.querySelector('.pth,.bth,.fth,thead tr');
    const heads=head?[...head.children].map(c=>c.textContent.trim()):[];
    const cells=[...row.children];
    const body=cells.map((c,i)=>{const v=c.textContent.replace(/\s+/g,' ').trim();if(!v)return '';return `<div class="lux-row"><span class="k">${heads[i]||('حقل '+(i+1))}</span><span class="v">${v}</span></div>`;}).join('')||'<div class="lux-lead">لا توجد تفاصيل إضافية.</div>';
    modal('التفاصيل',body+`<div class="lux-foot" style="margin-top:16px"><button class="lux-btn lux-ghost" data-c style="flex:1">إغلاق</button><button class="lux-btn lux-gold" data-e style="flex:1">تعديل</button></div>`,
      {onMount(ov,close){ov.querySelector('[data-c]').onclick=close;ov.querySelector('[data-e]').onclick=()=>{close();editForm('السجل');};}});
  }

  /* ---------- common action builders ---------- */
  function addForm(ctx){
    formModal('إضافة جديد', ctx?('إضافة عنصر إلى: '+ctx):'أدخلي بيانات العنصر الجديد.',
      [field('الاسم','name',{ph:'مثال: خدمة / عنصر جديد'}),
       field('الوصف','desc',{type:'textarea',rows:2,ph:'وصف مختصر…'}),
       field('القيمة / السعر','val',{dir:'ltr',ph:'0'})],
      'إضافة',()=>toast('تمت الإضافة بنجاح ✓','ok'));
  }
  function editForm(ctx){
    formModal('تعديل', 'تحديث بيانات: '+(ctx||'العنصر'),
      [field('الاسم','name',{val:ctx&&ctx!=='السجل'?ctx:''}),
       field('الوصف','desc',{type:'textarea',rows:2}),
       field('الحالة','status',{type:'select',options:['مفعّل','موقوف','مسودة']})],
      'حفظ التعديلات',()=>toast('تم حفظ التعديلات ✓','ok'));
  }
  const SERVICE_OPTS=['مكياج','بشرة','شعر','أظافر','رموش','تصوير','سبا'];
  function inviteForm(){
    const chip=o=>`<button type="button" class="lux-chip" data-v="${o}">${o}</button>`;
    const body=`
      <div class="lux-lead">اختاري نوع المزوّد ثم أدخلي بياناته. يمكن اختيار أكثر من تخصّص.</div>
      <div class="lux-seg" data-type="expert">
        <button type="button" data-t="expert" class="on">◆ خبيرة مستقلة</button>
        <button type="button" data-t="salon">⬢ صالون</button>
      </div>
      <div class="lux-f"><label id="luxNameLb">اسم الخبيرة</label><input name="name" placeholder="الاسم الكامل"/></div>
      <div class="lux-f"><label>البريد أو الجوال</label><input name="contact" dir="ltr" style="text-align:right" placeholder="name@example.com"/></div>
      <div class="lux-f" id="luxBranchWrap" style="display:none"><label>عدد الفروع</label><input name="branches" dir="ltr" style="text-align:right" placeholder="مثال: 2"/></div>
      <div class="lux-f"><label id="luxSvcLb">التخصّصات (واحد أو أكثر)</label><div class="lux-chips" id="luxSvc">${SERVICE_OPTS.map(chip).join('')}</div></div>
      <button class="lux-btn lux-gold" data-ok style="margin-top:6px">إرسال الدعوة</button>`;
    modal('دعوة مزوّد جديد',body,{onMount(ov,close){
      let type='expert';
      const seg=ov.querySelectorAll('.lux-seg button');
      seg.forEach(b=>b.onclick=()=>{
        type=b.dataset.t;seg.forEach(x=>x.classList.toggle('on',x===b));
        ov.querySelector('#luxNameLb').textContent= type==='salon'?'اسم الصالون':'اسم الخبيرة';
        ov.querySelector('#luxBranchWrap').style.display= type==='salon'?'':'none';
        ov.querySelector('#luxSvcLb').textContent= type==='salon'?'الخدمات التي يقدّمها الصالون (واحد أو أكثر)':'تخصّصات الخبيرة (واحد أو أكثر)';
      });
      ov.querySelectorAll('#luxSvc .lux-chip').forEach(c=>c.onclick=()=>c.classList.toggle('on'));
      ov.querySelector('[data-ok]').onclick=()=>{
        const name=ov.querySelector('[name=name]');
        const svc=[...ov.querySelectorAll('#luxSvc .lux-chip.on')].map(c=>c.dataset.v);
        if(!name.value.trim()){name.style.borderColor='#c0566a';name.focus();return;}
        if(!svc.length){ov.querySelector('#luxSvc').style.outline='1px solid #c0566a';toast('اختاري تخصّصًا واحدًا على الأقل','err');return;}
        close();
        toast('تم إرسال الدعوة إلى '+(type==='salon'?'صالون':'خبيرة')+' · '+svc.length+' تخصّص ✓','ok');
      };
    }});
  }
  function scheduleView(name){
    const days=['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
    const rows=days.map(d=>`<div class="lux-row"><span class="k">${d}</span><span class="v">${d==='الجمعة'?'إجازة':'10:00 ص – 8:00 م'}</span></div>`).join('');
    modal('جدول '+(name||'الموظفة'),`<div class="lux-lead">أوقات العمل الأسبوعية والمتاحة للحجز.</div>${rows}<button class="lux-btn lux-gold" data-ok style="margin-top:16px">تعديل الجدول</button>`,
      {onMount(ov,close){ov.querySelector('[data-ok]').onclick=()=>{close();toast('تم تحديث الجدول ✓','ok');};}});
  }

  /* ---------- main delegation ---------- */
  document.addEventListener('click',function(e){
    if(e.target.closest('.lux-root'))return; // ignore our own UI

    const btn=e.target.closest('button, .more, [role="button"]');
    if(btn && !btn.getAttribute('onclick') && !btn.closest('a[href]') && !btn.dataset.luxDone){
      const t=(btn.textContent||'').replace(/\s+/g,' ').trim();
      const ctxEl=btn.closest('.card,.stat,.ptr,.btr,.ftr');
      const ctx=ctxEl?(ctxEl.querySelector('.nm,.cl,.n,.sec-label,.ttl,h3,h4')||{}).textContent:'';
      const ctxName=ctx?ctx.replace(/\s+/g,' ').trim():'';

      // symbol-only buttons
      if(/^[⋯⋮]$/.test(t)){
        const r=btn.getBoundingClientRect();
        menu(r.left,r.bottom+6,[
          {label:'عرض التفاصيل',fn:()=>{const row=btn.closest('.ptr,.btr,.ftr');row?rowDetail(row):toast('عرض التفاصيل')}},
          {label:'تعديل',fn:()=>editForm(ctxName)},
          {label:'حذف',danger:true,fn:()=>confirmBox('هل تريدين حذف هذا العنصر؟ لا يمكن التراجع.',()=>toast('تم الحذف','err'),true)},
        ]);
        return e.preventDefault();
      }
      if(/^[‹›◂▸<>]$/.test(t)){toast('لا توجد بيانات لفترة أخرى في النموذج');return e.preventDefault();}

      if(/تصدير|كشف الحساب|كشف|تحميل|تقرير/.test(t)){exportCSV(btn);return e.preventDefault();}
      if(/حذف|إلغاء الاشتراك/.test(t)){confirmBox('تأكيد الحذف؟ لا يمكن التراجع عن هذه العملية.',()=>toast('تم الحذف','err'),true);return e.preventDefault();}
      if(/إيقاف|تعليق|حظر|تجميد/.test(t)){confirmBox('تأكيد إيقاف/تعليق هذا العنصر؟',()=>toast('تم التنفيذ ✓','ok'),true);return e.preventDefault();}
      if(/دعوة/.test(t)){inviteForm();return e.preventDefault();}
      if(/الجدول|جدول/.test(t)){scheduleView(ctxName);return e.preventDefault();}
      if(/حضور مباشر/.test(t)){formModal('تسجيل حضور مباشر','أضيفي عميلة حضرت بدون موعد مسبق.',[field('اسم العميلة','name'),field('الخدمة','svc',{type:'select',options:['مكياج','شعر','بشرة','أظافر']}),field('الموظفة','staff',{type:'select',options:['أمل','سارة','نورة','ريم']})],'تسجيل الحضور',()=>toast('تم تسجيل الحضور ✓','ok'));return e.preventDefault();}
      if(/تعديل|تحرير/.test(t)){editForm(ctxName);return e.preventDefault();}
      if(/إضافة|أضيفي|جديد|إنشاء|^\+/.test(t)){addForm(ctxName);return e.preventDefault();}
      if(/تنفيذ التحويلات|تنفيذ التحويل|تنفيذ الدفعات/.test(t)){(window.LUX_payouts||payoutFlow)();return e.preventDefault();}
      if(/حفظ|تطبيق|تأكيد|إرسال|تنفيذ/.test(t)){toast('تم بنجاح ✓','ok');return e.preventDefault();}
      if(/عرض الكل|المزيد|عرض|التفاصيل|إدارة/.test(t)){
        const row=btn.closest('.ptr,.btr,.ftr');
        if(row){rowDetail(row);}
        else{modal(t||'تفاصيل', ctxName?`<div class="lux-lead">القسم: <b style="color:#f6f2ec">${ctxName}</b></div>`:'' + '<div class="lux-lead">هذه نافذة تفاعلية ضمن نموذج العرض. ستُربط بالبيانات الفعلية عند تشغيل الواجهة الخلفية.</div>',{});}
        return e.preventDefault();
      }
      // generic fallback for any other labelled button
      if(t.length){
        modal(t, `<div class="lux-lead">"${t}"</div><div class="lux-row"><span class="k">القسم</span><span class="v">${ctxName||'—'}</span></div><div class="lux-row"><span class="k">الحالة</span><span class="v" style="color:#9fce99">جاهزة ✓</span></div><button class="lux-btn lux-gold" data-ok style="margin-top:16px">متابعة</button>`,
          {onMount(ov,close){ov.querySelector('[data-ok]').onclick=()=>{close();toast('تم ✓','ok');};}});
        return e.preventDefault();
      }
      return;
    }

    // clickable data rows / appointment blocks (no inner button)
    const row=e.target.closest('.ptr,.btr,.ftr,.appt,.trow');
    if(row && !e.target.closest('button')){
      if(row.classList.contains('appt')){
        const c=(row.querySelector('.ap-c')||{}).textContent||'';
        const s=(row.querySelector('.ap-s')||{}).textContent||'';
        const tt=(row.querySelector('.ap-t')||{}).textContent||'';
        modal('تفاصيل الموعد',`<div class="lux-row"><span class="k">العميلة</span><span class="v">${c}</span></div><div class="lux-row"><span class="k">الخدمة</span><span class="v">${s}</span></div><div class="lux-row"><span class="k">الوقت</span><span class="v">${tt}</span></div><div class="lux-foot" style="margin-top:16px"><button class="lux-btn lux-ghost" data-c style="flex:1">إغلاق</button><button class="lux-btn lux-gold" data-k style="flex:1">تأكيد الموعد</button></div>`,
          {onMount(ov,close){ov.querySelector('[data-c]').onclick=close;ov.querySelector('[data-k]').onclick=()=>{close();toast('تم تأكيد الموعد ✓','ok');};}});
      } else { rowDetail(row); }
    }
  },false);

  window.LUX={toast,modal,confirm:confirmBox,menu,formModal,payouts:payoutFlow,commissions:commissionEditor};
})();
