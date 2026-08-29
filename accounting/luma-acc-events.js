/* ═══════════ لوما · ربط العمليات بالمحاسبة ═══════════
   طبقة الربط (Mapping) تحفظ «أي حساب لأي دور»، فلا يُكتب رقم حساب داخل أي
   عملية. تغيير الدليل لاحقاً = تعديل الربط، لا مطاردة أرقام في الملفات.

   كل عملية مالية تمرّ بـ post(eventType, payload) فتُترجَم لقيد متوازن مُرحَّل،
   ويُحفظ مرجعها (source + sourceId) فلا تتكرر: العملية الواحدة قيد واحد. */
(function(){
  if(!window.LumaAcc)throw new Error('luma-acc-core.js يجب أن يُحمَّل أولاً');
  const {Money,AccRepo,Audit,COA,KEYS,Journal,Ledger}=LumaAcc;

  /* الأدوار المحاسبية → أرقام الحسابات. قابلة للتحرير من الواجهة. */
  const MAP_DEFAULT={
    cash:'110101', bank:'110201', card_clearing:'1103',
    ar:'1110', inventory:'1120', vat_input:'1130', prepaid:'1140',
    ap:'2101', vat_output:'2110', vat_payable:'2120',
    payroll_payable:'2130', tips_payable:'2135', accrued:'2140', deferred_revenue:'2150',
    capital:'3101', retained:'3201', income_summary:'3301',
    rev_service:'4101', rev_product:'4102', rev_subscription:'4103', sales_returns:'4190',
    cogs_product:'5101', cogs_supplies:'5102',
    exp_salary:'5201', exp_commission:'5202', exp_rent:'5203', exp_utilities:'5204',
    exp_marketing:'5205', exp_bankfee:'5206', exp_maintenance:'5207',
    exp_depreciation:'5290', exp_other:'5299',
  };

  const Mapping={
    all(){
      const saved=AccRepo.get(KEYS.map,null);
      return saved?Object.assign({},MAP_DEFAULT,saved):Object.assign({},MAP_DEFAULT);
    },
    /* دور → رقم حساب، مع تحقق من صلاحيته للترحيل */
    acc(role){
      const code=Mapping.all()[role];
      if(!code)throw new Error('لا يوجد حساب مرتبط بالدور: '+role);
      if(!COA.postable(code))throw new Error('الحساب المرتبط بـ«'+role+'» ('+code+') غير صالح للترحيل');
      return code;
    },
    set(role,code,reason){
      if(!COA.postable(code))throw new Error('حساب غير صالح للترحيل: '+code);
      const cur=AccRepo.get(KEYS.map,{});const before={...cur};
      cur[role]=String(code);AccRepo.set(KEYS.map,cur);
      Audit.log('update','mapping',role,before[role]||null,code,reason);
      return cur;
    },
    DEFAULT:MAP_DEFAULT,
  };

  /* حساب النقد حسب طريقة الدفع — الشبكة تمرّ بحساب تحت التحصيل */
  const CASHLIKE={'نقداً':'cash',cash:'cash','mada':'card_clearing','مدى':'card_clearing',
    'apple':'card_clearing','Apple Pay':'card_clearing','card':'card_clearing',
    'بطاقة ائتمانية':'card_clearing','تحويل بنكي':'bank','bank':'bank'};
  const payRole=m=>CASHLIKE[m]||'card_clearing';

  /* ضريبة القيمة المضافة — معزولة في طبقة واحدة قابلة للتحديث نظامياً.
     لا نفترض تفاصيل تنظيمية: النسبة والتقريب هنا فقط. */
  const VAT={
    rate(){const c=AccRepo.get('luma_acc_vat',null);return c&&c.rate!=null?c.rate:0.15;},
    enabled(){const c=AccRepo.get('luma_acc_vat',null);return !c||c.enabled!==false;},
    /* من مبلغ غير شامل → الضريبة */
    on(netHalalas){return VAT.enabled()?Math.round(netHalalas*VAT.rate()):0;},
    /* من مبلغ شامل → تفكيك */
    extract(grossHalalas){
      if(!VAT.enabled())return {net:grossHalalas,vat:0};
      const net=Math.round(grossHalalas/(1+VAT.rate()));
      return {net,vat:grossHalalas-net};
    },
    config(c,reason){
      const before=AccRepo.get('luma_acc_vat',null);
      AccRepo.set('luma_acc_vat',Object.assign({rate:0.15,enabled:true},before||{},c));
      Audit.log('update','vat','config',before,AccRepo.get('luma_acc_vat',null),reason);
    },
  };

  /* منع الازدواج: عملية واحدة → قيد واحد */
  function already(source,sourceId){
    return Journal.list({source}).find(j=>
      String(j.sourceId)===String(sourceId)&&j.status!=='void'&&!j.reversalOf)||null;
  }

  /* ─────────── قواعد الترحيل لكل نوع عملية ───────────
     كل قاعدة تُرجع {desc, lines[]} بالريالات؛ المحرك يحوّلها لهللات ويتحقق. */
  const RULES={
    /* بيع خدمة/منتج مدفوع — نقد أو شبكة */
    sale_cash(p){
      const net=p.net, vat=p.vat, tip=p.tip||0;
      const lines=[{account:Mapping.acc(payRole(p.method)),debit:net+vat+tip,desc:'تحصيل '+(p.method||'')}];
      lines.push({account:Mapping.acc(p.kind==='product'?'rev_product':'rev_service'),credit:net,desc:p.desc||''});
      if(vat)lines.push({account:Mapping.acc('vat_output'),credit:vat,desc:'ضريبة مخرجات'});
      /* البقشيش ليس إيراداً — التزام للموظفة */
      if(tip)lines.push({account:Mapping.acc('tips_payable'),credit:tip,desc:'بقشيش'});
      return {desc:p.desc||'بيع نقدي',lines};
    },
    /* بيع آجل — ذمة على العميلة */
    sale_credit(p){
      const lines=[{account:Mapping.acc('ar'),debit:p.net+p.vat,desc:'ذمة '+(p.party&&p.party.name||''),party:p.party}];
      lines.push({account:Mapping.acc(p.kind==='product'?'rev_product':'rev_service'),credit:p.net,desc:p.desc||''});
      if(p.vat)lines.push({account:Mapping.acc('vat_output'),credit:p.vat,desc:'ضريبة مخرجات'});
      return {desc:p.desc||'بيع آجل',lines};
    },
    /* تحصيل من عميلة */
    receipt(p){
      return {desc:p.desc||'تحصيل من عميلة',lines:[
        {account:Mapping.acc(payRole(p.method)),debit:p.amount,desc:'تحصيل '+(p.method||'')},
        {account:Mapping.acc('ar'),credit:p.amount,desc:'سداد ذمة',party:p.party},
      ]};
    },
    /* شراء من مورد — مخزون أو مصروف */
    purchase(p){
      const lines=[{account:Mapping.acc(p.toInventory?'inventory':(p.expenseRole||'exp_other')),debit:p.net,desc:p.desc||''}];
      if(p.vat)lines.push({account:Mapping.acc('vat_input'),debit:p.vat,desc:'ضريبة مدخلات'});
      lines.push(p.paid
        ?{account:Mapping.acc(payRole(p.method)),credit:p.net+p.vat,desc:'دفع '+(p.method||'')}
        :{account:Mapping.acc('ap'),credit:p.net+p.vat,desc:'ذمة مورد',party:p.party});
      return {desc:p.desc||'شراء',lines};
    },
    /* دفع لمورد */
    supplier_payment(p){
      return {desc:p.desc||'دفع لمورد',lines:[
        {account:Mapping.acc('ap'),debit:p.amount,desc:'سداد مورد',party:p.party},
        {account:Mapping.acc(payRole(p.method)),credit:p.amount,desc:'دفع '+(p.method||'')},
      ]};
    },
    /* مصروف */
    expense(p){
      const lines=[{account:Mapping.acc(p.expenseRole||'exp_other'),debit:p.net,desc:p.desc||''}];
      if(p.vat)lines.push({account:Mapping.acc('vat_input'),debit:p.vat,desc:'ضريبة مدخلات'});
      lines.push(p.accrued
        ?{account:Mapping.acc('accrued'),credit:p.net+p.vat,desc:'مصروف مستحق'}
        :{account:Mapping.acc(payRole(p.method)),credit:p.net+p.vat,desc:'دفع '+(p.method||'')});
      return {desc:p.desc||'مصروف',lines};
    },
    /* تكلفة المبيعات — تُرحَّل مع البيع حين تُعرف التكلفة */
    cogs(p){
      return {desc:p.desc||'تكلفة مبيعات',lines:[
        {account:Mapping.acc(p.role||'cogs_product'),debit:p.cost,desc:p.desc||''},
        {account:Mapping.acc('inventory'),credit:p.cost,desc:'صرف من المخزون'},
      ]};
    },
    /* مرتجع بيع — عكس الإيراد والضريبة والنقد/الذمة */
    sales_return(p){
      const lines=[{account:Mapping.acc('sales_returns'),debit:p.net,desc:p.desc||'مردود مبيعات'}];
      if(p.vat)lines.push({account:Mapping.acc('vat_output'),debit:p.vat,desc:'عكس ضريبة مخرجات'});
      lines.push(p.toCustomerBalance
        ?{account:Mapping.acc('ar'),credit:p.net+p.vat,desc:'إشعار دائن',party:p.party}
        :{account:Mapping.acc(payRole(p.method)),credit:p.net+p.vat,desc:'ردّ مبلغ'});
      return {desc:p.desc||'مرتجع مبيعات',lines};
    },
    /* الرواتب والعمولات — استحقاق ثم صرف */
    payroll_accrue(p){
      const lines=[];
      if(p.base)lines.push({account:Mapping.acc('exp_salary'),debit:p.base,desc:'رواتب'});
      if(p.commission)lines.push({account:Mapping.acc('exp_commission'),debit:p.commission,desc:'عمولات'});
      lines.push({account:Mapping.acc('payroll_payable'),credit:(p.base||0)+(p.commission||0),desc:'مستحق للموظفات'});
      return {desc:p.desc||'استحقاق رواتب وعمولات',lines};
    },
    payroll_pay(p){
      return {desc:p.desc||'صرف رواتب',lines:[
        {account:Mapping.acc('payroll_payable'),debit:p.amount,desc:'سداد مستحقات'},
        {account:Mapping.acc(payRole(p.method)),credit:p.amount,desc:'صرف '+(p.method||'')},
      ]};
    },
    /* تحويل بين صندوق وبنك */
    transfer(p){
      return {desc:p.desc||'تحويل بين الحسابات',lines:[
        {account:Mapping.acc(p.toRole),debit:p.amount,desc:'وارد'},
        {account:Mapping.acc(p.fromRole),credit:p.amount,desc:'صادر'},
      ]};
    },
    /* إهلاك */
    depreciation(p){
      return {desc:p.desc||'إهلاك الفترة',lines:[
        {account:Mapping.acc('exp_depreciation'),debit:p.amount,desc:p.desc||''},
        {account:p.accumAccount,credit:p.amount,desc:'مجمع الإهلاك'},
      ]};
    },
  };

  const Events={
    RULES,Mapping,VAT,payRole,already,

    /* الواجهة الوحيدة لتحويل عملية إلى قيد */
    post(type,p){
      const rule=RULES[type];
      if(!rule)throw new Error('نوع عملية غير معروف محاسبياً: '+type);
      if(p.sourceId!=null){
        const dup=already(p.source||type,p.sourceId);
        if(dup)return dup;                       /* لا قيد مكرر للعملية نفسها */
      }
      const built=rule(p);
      return Journal.create({
        date:p.date,desc:built.desc,ref:p.ref||'',
        source:p.source||type,sourceId:p.sourceId,
        costCenter:p.costCenter||'',party:p.party||null,
        attachments:p.attachments||[],
        lines:built.lines,
      },{post:true,reason:'قيد آلي — '+type});
    },
  };

  LumaAcc.Events=Events;
  LumaAcc.Mapping=Mapping;
  LumaAcc.VAT=VAT;
})();
