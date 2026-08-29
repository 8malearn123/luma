/* ═══════════ لوما · جسر العمليات القائمة إلى المحاسبة ═══════════
   نقطة واحدة تربط ما يحدث في لوما بالمحرك المحاسبي. العمليات القائمة تبقى
   كما هي؛ الجسر يُستدعى بعد نجاحها فيُنشئ القيد. وإن فشل القيد لا تسقط
   العملية التشغيلية — يُسجَّل الخلل ويُعرض، لأن إسقاط دفعة مستلمة أسوأ من
   قيد مؤجَّل. (في نسخة الخادم يصيران معاملة واحدة ذرّية.) */
(function(){
  if(!window.LumaAcc)return;
  const {Money,Events,Journal,Audit}=LumaAcc;

  const branch=()=>{try{return window.LUMA_BRANCH||'shatee';}catch(e){return '';}};
  const today =()=>new Date().toISOString().slice(0,10);

  function safe(label,fn){
    try{return fn();}
    catch(err){
      try{Audit.log('error','bridge',label,null,{message:String(err&&err.message||err)},'فشل ترحيل آلي');}catch(e){}
      try{window.LUX&&LUX.toast('تعذّر ترحيل القيد ('+label+'): '+(err.message||err),'err');}catch(e){}
      return null;
    }
  }

  const Bridge={
    /* دفعة خدمة — الفاتورة تحمل الصافي والضريبة والبقشيش منفصلة */
    onServicePayment(apptId,rec,ctx){
      ctx=ctx||{};
      return safe('دفعة خدمة '+apptId,()=>Events.post('sale_cash',{
        source:'sale', sourceId:'APPT-'+apptId, ref:rec.no?('INV-'+rec.no):'',
        date:rec.date||today(), kind:'service', method:rec.method,
        net:rec.amount, vat:rec.vat, tip:rec.tip||0,
        costCenter:branch(),
        party:ctx.client?{kind:'customer',id:ctx.client,name:ctx.client}:null,
        desc:'خدمة '+(ctx.service||'')+(ctx.client?' — '+ctx.client:''),
      }));
    },

    /* تكلفة المستلزمات المستهلكة مع الخدمة — تفصل قيمة المخزون عن كميته */
    onSuppliesConsumed(apptId,consumed){
      if(!consumed||!consumed.length)return null;
      const inv=window.INVENTORY||[];
      let cost=0;
      consumed.forEach(c=>{
        const m=String(c).match(/^(.*)\s×(\d+)$/);
        if(!m)return;
        const it=inv.find(x=>x.n===m[1]);
        if(it)cost+=(it.cost||0)*(+m[2]||0);
      });
      if(!cost)return null;
      return safe('تكلفة مستلزمات '+apptId,()=>Events.post('cogs',{
        source:'cogs', sourceId:'APPT-'+apptId, date:today(),
        role:'cogs_supplies', cost, costCenter:branch(),
        desc:'مستلزمات مستهلكة — '+consumed.join('، '),
      }));
    },

    /* طلب متجر (منتجات) — الأسعار شاملة الضريبة فتُفكَّك */
    onStoreOrder(order){
      const gross=Money.from(order.total||0);
      const {net,vat}=LumaAcc.VAT.extract(gross);
      return safe('طلب متجر '+order.ref,()=>Events.post('sale_cash',{
        source:'order', sourceId:order.ref, ref:order.ref,
        date:(order.at||'').slice(0,10)||today(), kind:'product', method:order.pay,
        net:Money.to(net), vat:Money.to(vat), tip:0, costCenter:branch(),
        party:order.client?{kind:'customer',id:order.client,name:order.client}:null,
        desc:'طلب متجر '+order.ref+(order.client?' — '+order.client:''),
      }));
    },

    /* تصفية الرواتب — استحقاق الرواتب والعمولات */
    onPayrollClose(month,slips){
      const base=slips.reduce((t,s)=>t+(s.base||0),0);
      const comm=slips.reduce((t,s)=>t+(s.svcComm||0)+(s.prodComm||0),0);
      if(!base&&!comm)return null;
      return safe('رواتب '+month,()=>Events.post('payroll_accrue',{
        source:'payroll', sourceId:'PR-'+month, date:today(),
        base,commission:comm,costCenter:branch(),
        desc:'استحقاق رواتب وعمولات شهر '+month,
      }));
    },

    /* اشتراك فرع إضافي — مصروف تشغيلي على لوما */
    onBranchFee(req){
      return safe('اشتراك فرع '+req.id,()=>Events.post('expense',{
        source:'branch_fee', sourceId:req.payRef||req.id, ref:req.payRef||'',
        date:req.decidedAt||today(), expenseRole:'exp_other',
        net:req.fee, vat:0, method:req.pay, costCenter:req.id,
        desc:'اشتراك فرع '+req.name,
      }));
    },
  };

  /* مزامنة لاحقة: طلبات المتجر تُنشأ في صفحة العميلة حيث لا يعمل المحرك،
     فتُرحَّل عند فتح لوحة الصالون. آمنة للتكرار — already() يمنع الازدواج. */
  Bridge.syncPending=function(){
    let n=0;
    try{
      (LumaStore.get('luma_salon_orders',[])||[]).forEach(o=>{
        if(!o||!o.ref)return;
        if(Events.already('order',o.ref))return;
        if(Bridge.onStoreOrder(o))n++;
      });
    }catch(e){}
    return n;
  };

  LumaAcc.Bridge=Bridge;
})();
