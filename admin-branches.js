/* ═══ لوما · إدارة طلبات الفروع ═══
   الطلب الذي ترسله مالكة الصالون من لوحتها يصل هنا. الاعتماد وحده هو ما يفتح
   الفرع لديها؛ والفرع المدفوع يصل مُفعَّلاً بسجلّ دفع فلا يحتاج قراراً. */
(function(){
  const A = window.LUMA_ADMIN = window.LUMA_ADMIN || {};
  const esc = v => String(v==null?'':v)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const ST={pending:['بانتظار القرار','gold'],active:['نشط','green'],rejected:['مرفوض','soft']};

  function rows(list){
    if(!list.length) return `<div class="card" style="text-align:center;color:var(--muted)">لا طلبات فروع حالياً.</div>`;
    return list.map(r=>{
      const st=ST[r.status]||ST.pending;
      return `<div class="card" style="margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
          <div style="width:44px;height:44px;border-radius:8px;background:var(--surface3);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;color:var(--gold-light)">${icon('pin',21)}</div>
          <div style="flex:1;min-width:230px">
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span style="font-size:15px;color:var(--white);font-weight:600">${esc(r.name)}</span>
              <span class="badge ${st[1]}">${st[0]}</span>
              ${r.paid?`<span class="badge green">مدفوع · ${r.fee} ر.س</span>`:''}
              <span style="font-size:11px;color:var(--muted-deep)" dir="ltr">${r.at}</span>
            </div>
            <div style="font-size:12.5px;color:var(--cream);margin-top:3px">${esc(r.salon)} — ${esc(r.city)}${r.area?' · '+esc(r.area):''}</div>
            <div style="font-size:12px;color:var(--muted);margin-top:3px">
              ${r.chairs} كراسي · ${r.staff} موظفات · <span dir="ltr">${esc(r.phone)}</span>${r.openAt?' · افتتاح '+r.openAt:''}
              ${r.payRef?` · <span dir="ltr" style="color:var(--gold-light)">${esc(r.payRef)}</span> (${esc(r.pay)})`:''}
            </div>
            ${r.status==='rejected'&&r.note?`<div style="font-size:12px;color:var(--red);margin-top:5px">سبب الرفض: ${esc(r.note)}</div>`:''}
          </div>
          ${r.status==='pending'
            ? `<button class="btn btn-gold" style="padding:9px 18px" onclick="BRADM.ok('${r.id}')">اعتماد وفتح الفرع</button>
               <button class="btn btn-ghost" style="padding:9px 16px;border-color:#7c4a55;color:var(--red)" onclick="BRADM.no('${r.id}')">رفض</button>`
            : `<span class="badge ${st[1]}">${r.paid?'فُعِّل بالدفع':st[0]}</span>`}
        </div></div>`;}).join('');
  }

  A.branchreqs = { render(){
    const all=LumaBranches.requests();
    const pend=all.filter(r=>r.status==='pending');
    const done=all.filter(r=>r.status!=='pending');
    const paid=all.filter(r=>r.paid).reduce((t,r)=>t+r.fee,0);
    return `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:22px">
      ${[['طلبات بانتظار القرار',pend.length,''],['فروع مُفعَّلة',all.filter(r=>r.status==='active').length,''],['اشتراكات الفروع',paid.toLocaleString('en'),'ر.س / شهر']]
        .map(k=>`<div class="card"><div class="num" style="font-family:var(--luma-font-display);font-size:34px;color:var(--white)">${k[1]}</div>
        <div style="font-size:12.5px;color:var(--gold-pale);margin-top:6px">${k[0]}${k[2]?' <span style="color:var(--muted)">'+k[2]+'</span>':''}</div></div>`).join('')}
    </div>
    <div class="sec-label">بانتظار القرار <span class="ln"></span></div>
    ${rows(pend)}
    ${done.length?`<div class="sec-label" style="margin-top:24px">مُعالَجة <span class="ln"></span></div>${rows(done)}`:''}`;
  }};

  window.BRADM={
    ok(id){
      const r=LumaBranches.decide(id,true);
      if(r)LUX.toast('اعتُمد فرع «'+r.name+'» — صار متاحاً للصالون ✓','ok');
      ADMIN.go('branchreqs');
    },
    no(id){
      LUX.modal('رفض طلب الفرع',`
        <div class="lux-lead">يصل السبب لمالكة الصالون في شاشة الفروع لديها.</div>
        <div class="lux-f"><label>سبب الرفض</label><input id="brNote" placeholder="مثال: يلزم صك الإيجار والرخصة البلدية"/></div>
        <button class="lux-btn lux-gold" data-ok style="width:100%">تأكيد الرفض</button>`,
      {onMount(ov,close){
        ov.querySelector('[data-ok]').onclick=()=>{
          const note=(ov.querySelector('#brNote').value||'').trim();
          if(!note){ov.querySelector('#brNote').style.borderColor='var(--red)';return;}
          LumaBranches.decide(id,false,note);close();ADMIN.go('branchreqs');
          LUX.toast('رُفض الطلب — وصل السبب للصالون','ok');
        };
      }});
    },
  };
})();
