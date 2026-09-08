/* ===== LumaHome — التوصيل والخدمة المنزلية =====

   مساران مختلفان جوهرياً، يُداران من مكان واحد:

   ① توصيل المنتجات — بضاعة تنتقل: عنوان + رسوم حسب النطاق + حالات
      (قيد التجهيز ← خرج للتوصيل ← سُلّم).
   ② الخدمة المنزلية — خبيرة تنتقل: عنوان + رسوم انتقال + حد أدنى
      للطلب + وقت طريق يُحجز على جدول الخبيرة قبل الموعد وبعده،
      وإلا صار موعدها التالي مستحيلاً.

   الفرق الجوهري: الأول يشغل مندوباً، والثاني يشغل *وقت الخبيرة نفسها*.
   لذلك الخدمة المنزلية تُضيف وقت طريق إلى مدة الحجز، ولا تُعرض إلا
   للخدمات التي وسمتها المالكة «قابلة للتنفيذ في المنزل».

   الميزة ضمن باقة فَرِيد (799 ر.س) — أول تطبيق فعلي لحدود الباقات.  */
(function(){
  if(window.LumaHome)return;

  const CFG_KEY='luma_home_cfg';
  const ADDR_KEY='luma_addresses';      /* دفتر عناوين العميلة على جهازها */
  const PLAN_KEY='luma_plan';

  /* ── الباقات: أول تطبيق فعلي للحدود ── */
  const PLANS={
    sanaa:{id:'sanaa',name:'سَناء',price:199,features:[]},
    wahaj:{id:'wahaj',name:'وَهَج',price:399,features:['loyalty']},
    fareed:{id:'fareed',name:'فَرِيد',price:799,features:['loyalty','team','home']},
  };
  const plan=()=>{
    try{const p=LumaStore.raw.get(PLAN_KEY,'');if(PLANS[p])return PLANS[p];}catch(e){}
    return PLANS.sanaa;
  };
  const hasFeature=f=>plan().features.includes(f);
  const setPlan=id=>{if(PLANS[id]){try{LumaStore.raw.set(PLAN_KEY,id);}catch(e){}}return plan();};

  const DEFAULTS={
    enabled:false,
    delivery:{
      on:false, fee:25, freeAbove:300, prepDays:'خلال يومين',
      zones:[],                        /* [{name,fee,eta}] — رسوم لكل نطاق */
      note:'',
    },
    homeService:{
      on:false, fee:80, minTotal:250, travelMin:30,
      districts:[],                    /* الأحياء التي نخدمها */
      services:[],                     /* أسماء الخدمات القابلة للتنفيذ منزلياً */
      staff:[],                        /* الخبيرات المتنقّلات */
      from:'10:00', to:'20:00',        /* نافذة الزيارات المنزلية */
      note:'',
    },
  };
  const merge=(a,b)=>{
    const o=Object.assign({},a,b||{});
    o.delivery=Object.assign({},a.delivery,(b&&b.delivery)||{});
    o.homeService=Object.assign({},a.homeService,(b&&b.homeService)||{});
    return o;
  };
  const cfg=()=>merge(DEFAULTS,(()=>{try{return LumaStore.get(CFG_KEY,null);}catch(e){return null;}})());
  const save=patch=>{const n=merge(cfg(),patch);try{LumaStore.set(CFG_KEY,n);}catch(e){}return n;};

  /* الميزة فعّالة فقط إذا: الباقة تسمح + المالكة فعّلتها */
  const deliveryOn=()=>hasFeature('home')&&cfg().enabled&&cfg().delivery.on;
  const homeServiceOn=()=>hasFeature('home')&&cfg().enabled&&cfg().homeService.on;

  /* ── الرسوم ── */
  function deliveryFee(subtotal,zoneName){
    const d=cfg().delivery;
    if(!deliveryOn())return {fee:0,free:false,reason:'التوصيل غير مفعّل'};
    if(d.freeAbove&&subtotal>=d.freeAbove)return {fee:0,free:true,reason:'مجاني — تجاوز الطلب '+d.freeAbove+' ر.س'};
    const z=(d.zones||[]).find(x=>x.name===zoneName);
    return {fee:z?(+z.fee||0):(+d.fee||0),free:false,eta:(z&&z.eta)||d.prepDays};
  }
  function homeFee(subtotal){
    const h=cfg().homeService;
    if(!homeServiceOn())return {fee:0,ok:false,reason:'الخدمة المنزلية غير مفعّلة'};
    if(h.minTotal&&subtotal<h.minTotal)
      return {fee:+h.fee||0,ok:false,reason:'الحد الأدنى للزيارة المنزلية '+h.minTotal+' ر.س'};
    return {fee:+h.fee||0,ok:true};
  }
  /* الخدمة المنزلية تشغل وقت الخبيرة ذهاباً وإياباً — يُحجز مع الموعد */
  const travelMin=()=>homeServiceOn()?(+cfg().homeService.travelMin||0):0;
  const totalDurationAtHome=svcMin=>svcMin+travelMin()*2;

  const canServeAtHome=name=>{
    const l=cfg().homeService.services||[];
    return homeServiceOn()&&(!l.length||l.includes(name));
  };
  const homeStaff=()=>cfg().homeService.staff||[];
  const districts=()=>cfg().homeService.districts||[];
  const zones=()=>cfg().delivery.zones||[];

  /* ── دفتر عناوين العميلة ── */
  const addresses=()=>{try{return LumaStore.get(ADDR_KEY,[])||[];}catch(e){return [];}};
  function addAddress(a){
    const row=Object.assign({id:'ad'+Date.now().toString(36)},a);
    try{LumaStore.update(ADDR_KEY,l=>{l.push(row);return l;},[]);}catch(e){}
    return row;
  }
  const removeAddress=id=>{try{LumaStore.update(ADDR_KEY,l=>l.filter(x=>x.id!==id),[]);}catch(e){}};
  const fmtAddress=a=>a?[a.district,a.street,a.details].filter(Boolean).join(' · '):'';

  /* ── حالات التتبّع ── */
  const DELIVERY_STEPS=[['new','طلب جديد'],['prep','قيد التجهيز'],['out','خرج للتوصيل'],['done','سُلّم']];
  const HOME_STEPS=[['confirmed','مؤكد'],['onway','الخبيرة في الطريق'],['arrived','وصلت'],['done','اكتملت']];
  const stepLabel=(steps,k)=>((steps.find(s=>s[0]===k)||[])[1])||k;
  const nextStep=(steps,k)=>{const i=steps.findIndex(s=>s[0]===k);return i>=0&&i<steps.length-1?steps[i+1][0]:null;};

  window.LumaHome={
    PLANS,plan,setPlan,hasFeature,
    cfg,save,DEFAULTS,
    deliveryOn,homeServiceOn,
    deliveryFee,homeFee,travelMin,totalDurationAtHome,
    canServeAtHome,homeStaff,districts,zones,
    addresses,addAddress,removeAddress,fmtAddress,
    DELIVERY_STEPS,HOME_STEPS,stepLabel,nextStep,
    KEYS:{CFG_KEY,ADDR_KEY,PLAN_KEY},
  };
})();
