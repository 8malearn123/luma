/* ═══════════ لوما · الصلاحيات المحاسبية ═══════════
   لوما لا تملك نظام صلاحيات (الأدوار نصوص للعرض)، فهذه طبقة مستقلة للمحاسبة
   وحدها. تُفرض عند حدود النطاق لا في الواجهة فقط: إخفاء زر لا يمنع أحداً من
   استدعاء الدالة من الطرفية.

   تحذير موثّق: الفرض الحقيقي مستحيل في المتصفح — من يملك DevTools يملك كل
   شيء. النظير الحقيقي هو RLS وسياسات الخادم في migrations/0002. هذه الطبقة
   تمنع الخطأ لا الخصم. */
(function(){
  if(!window.LumaAcc)throw new Error('luma-acc-core.js يجب أن يُحمَّل أولاً');
  const {AccRepo,Audit}=LumaAcc;
  const K={role:'luma_acc_role',roles:'luma_acc_roles'};

  /* الصلاحيات — العمليات الحساسة مفصولة عمداً عن العرض */
  const PERMS={
    'acc.view'        :'عرض المحاسبة',
    'acc.entry.create':'إنشاء قيد',
    'acc.entry.edit'  :'تعديل قيد قبل الترحيل',
    'acc.entry.post'  :'ترحيل قيد',
    'acc.entry.void'  :'إلغاء مسودة',
    'acc.entry.reverse':'عكس قيد مُرحَّل',
    'acc.coa.manage'  :'إدارة دليل الحسابات',
    'acc.mapping'     :'إدارة ربط الحسابات',
    'acc.period.manage':'إدارة الفترات',
    'acc.period.close':'إقفال فترة',
    'acc.period.reopen':'إعادة فتح فترة مقفلة',
    'acc.statements'  :'عرض القوائم المالية',
    'acc.vat'         :'إدارة الضرائب',
    'acc.assets'      :'إدارة الأصول الثابتة',
    'acc.recon'       :'التسوية البنكية',
    'acc.opening'     :'ترحيل الأرصدة الافتتاحية',
    'acc.audit'       :'عرض سجل التدقيق',
  };

  const ALL=Object.keys(PERMS);
  const ROLES_DEFAULT={
    owner    :{name:'المالكة',       perms:ALL},
    accountant:{name:'المحاسِبة',    perms:ALL.filter(p=>p!=='acc.period.reopen')},
    bookkeeper:{name:'مُدخِلة قيود', perms:['acc.view','acc.entry.create','acc.entry.edit','acc.statements']},
    viewer   :{name:'مراجعة',        perms:['acc.view','acc.statements','acc.audit']},
  };

  const Perm={
    PERMS,ALL,
    roles(){return Object.assign({},ROLES_DEFAULT,AccRepo.get(K.roles,{}));},
    /* الدور الحالي — افتراضه المالكة في نسخة المتصفح */
    role(){try{return LumaStore.raw.get(K.role,'owner');}catch(e){return 'owner';}},
    setRole(r,reason){
      if(!Perm.roles()[r])throw new Error('دور غير معروف: '+r);
      const before=Perm.role();
      try{LumaStore.raw.set(K.role,r);}catch(e){}
      Audit.log('update','role','current',before,r,reason);
      return r;
    },
    list(){return (Perm.roles()[Perm.role()]||{perms:[]}).perms;},
    can(p){return Perm.list().indexOf(p)>=0;},
    /* البوابة: تُستدعى داخل العمليات الحساسة */
    require(p){
      if(Perm.can(p))return true;
      const e=new Error('لا تملكين صلاحية: '+(PERMS[p]||p));
      try{Audit.log('denied','permission',p,null,{role:Perm.role()},'محاولة بلا صلاحية');}catch(x){}
      throw e;
    },
    /* تعريف دور مخصص */
    setRolePerms(id,name,perms,reason){
      const cur=AccRepo.get(K.roles,{});const before=cur[id]||null;
      cur[id]={name:name||id,perms:(perms||[]).filter(p=>ALL.indexOf(p)>=0)};
      AccRepo.set(K.roles,cur);
      Audit.log('update','role',id,before,cur[id],reason);
      return cur[id];
    },
  };

  /* ─── فرض الصلاحيات عند حدود النطاق ───
     نلفّ الدوال الحساسة بدل نثر الفحص داخلها، فتبقى قواعد المحاسبة نقية. */
  function gate(obj,fn,perm){
    const orig=obj[fn];
    if(typeof orig!=='function')return;
    obj[fn]=function(){Perm.require(perm);return orig.apply(this,arguments);};
  }
  gate(LumaAcc.Journal,'create','acc.entry.create');
  gate(LumaAcc.Journal,'update','acc.entry.edit');
  gate(LumaAcc.Journal,'post','acc.entry.post');
  gate(LumaAcc.Journal,'voidDraft','acc.entry.void');
  gate(LumaAcc.Journal,'reverse','acc.entry.reverse');
  gate(LumaAcc.COA,'add','acc.coa.manage');
  gate(LumaAcc.COA,'setActive','acc.coa.manage');
  gate(LumaAcc.Mapping,'set','acc.mapping');
  gate(LumaAcc.Periods,'open','acc.period.manage');
  gate(LumaAcc.Periods,'close','acc.period.close');
  gate(LumaAcc.Periods,'reopen','acc.period.reopen');
  gate(LumaAcc.VAT,'config','acc.vat');
  if(LumaAcc.Assets){
    gate(LumaAcc.Assets,'add','acc.assets');
    gate(LumaAcc.Assets,'runDepreciation','acc.assets');
    gate(LumaAcc.Assets,'dispose','acc.assets');
  }
  if(LumaAcc.Recon){
    gate(LumaAcc.Recon,'open','acc.recon');
    gate(LumaAcc.Recon,'close','acc.recon');
    gate(LumaAcc.Recon,'addFee','acc.recon');
  }
  if(LumaAcc.Opening)gate(LumaAcc.Opening,'post','acc.opening');
  if(LumaAcc.Reports)gate(LumaAcc.Reports,'closePeriod','acc.period.close');

  LumaAcc.Perm=Perm;
})();
