/* ═══ لوما · الفروع — مصدر واحد للفروع النشطة ولطلبات فتح فرع جديد ═══
   يُحمَّل في لوحة الصالون (تُقدِّم الطلب) وفي لوحة إدارة لوما (تعتمده)،
   فالطلب الذي تُرسله المالكة يظهر لإدارة لوما من المفتاح نفسه.

   مساران لفتح فرع:
     • «إرسال الطلب» → pending، ولا يُفعَّل الفرع حتى تعتمده إدارة لوما.
     • «الدفع والتفعيل الفوري» → مدفوع، فيُفعَّل الفرع فوراً ويصل الإدارة
       مُعتمداً بسجلّ دفع — بلا انتظار.
   في الحالتين لا يُنشأ الفرع إلا بعد اعتماد أو دفع؛ الطلب وحده لا يفتح فرعاً. */
(function(){
  if(window.LumaBranches)return;
  const KEY='luma_branch_reqs';
  const FEE=399;              /* ر.س شهرياً لكل فرع إضافي — نصف باقة «فَرِيد» */

  /* الفرعان المؤسِّسان — ليسا طلبات، ولا يُحذفان */
  const SEED=[
    {id:'shatee',n:'فرع الشاطئ',c:'جدة · حي الشاطئ',main:true},
    {id:'rawdah',n:'فرع الروضة',c:'جدة · حي الروضة'},
  ];

  const load=()=>{try{return LumaStore.get(KEY,[])||[];}catch(e){return [];}};
  const save=v=>{try{LumaStore.set(KEY,v);}catch(e){}};

  /* معرّف الفرع يصير لاحقةً لمفاتيح التخزين (luma_hr_leaves@br-3)، فيلزم أن
     يكون قصيراً ولاتينياً — ترميز الاسم العربي ينتج معرّفاً غير مقروء. */
  function slug(name,taken){
    let i=taken.length+1,id='br-'+i;
    while(taken.includes(id)){id='br-'+(++i);}
    return id;
  }

  const requests=()=>load();
  /* الفروع العاملة = المؤسِّسة + كل طلب صار نشطاً (باعتماد أو بدفع) */
  const active=()=>SEED.concat(load().filter(r=>r.status==='active')
    .map(r=>({id:r.id,n:r.name,c:r.city+(r.area?' · '+r.area:''),fromRequest:true})));
  const pending=()=>load().filter(r=>r.status==='pending');

  function submit(d,opts){
    opts=opts||{};
    const list=load();
    const taken=SEED.map(b=>b.id).concat(list.map(r=>r.id));
    const paid=!!opts.paid;
    const req={
      id:slug(d.name,taken),
      salon:d.salon||'صالون لمسة',
      name:String(d.name||'').trim(),
      city:String(d.city||'').trim(),
      area:String(d.area||'').trim(),
      chairs:+d.chairs||0,
      staff:+d.staff||0,
      phone:String(d.phone||'').trim(),
      openAt:d.openAt||'',
      note:String(d.note||'').trim(),
      fee:FEE,
      paid:paid,
      pay:paid?(opts.method||'mada'):'',
      payRef:paid?('BR-'+Math.floor(100000+Math.random()*900000)):'',
      /* الدفع يُفعّل فوراً؛ غيره ينتظر اعتماد إدارة لوما */
      status:paid?'active':'pending',
      at:new Date().toISOString().slice(0,10),
      decidedAt:paid?new Date().toISOString().slice(0,10):'',
    };
    list.unshift(req);save(list);
    try{
      LumaEvents.push('block',
        paid?('فرع جديد مُفعَّل بالدفع: '+req.name+' — '+req.salon+' ('+FEE+' ر.س/شهر · '+req.payRef+')')
            :('طلب فتح فرع جديد: '+req.name+' — '+req.salon+' بانتظار اعتماد لوما'),
        'admin.html#branchreqs');
    }catch(e){}
    return req;
  }

  /* قرار إدارة لوما — الاعتماد وحده هو ما يفتح الفرع */
  function decide(id,ok,note){
    const list=load();const r=list.find(x=>x.id===id);
    if(!r||r.status!=='pending')return null;
    r.status=ok?'active':'rejected';
    r.decidedAt=new Date().toISOString().slice(0,10);
    if(note)r.note=note;
    save(list);
    try{LumaEvents.push('block',
      (ok?'اعتُمد فرع «':'رُفض طلب فرع «')+r.name+'» — '+r.salon,'salon.html#branches');}catch(e){}
    return r;
  }

  function remove(id){
    const list=load().filter(r=>r.id!==id);save(list);
  }

  window.LumaBranches={KEY,FEE,SEED,slug,requests,active,pending,submit,decide,remove};
})();
