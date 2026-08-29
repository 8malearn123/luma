/* ═══ أنواع طلبات الموارد البشرية — بذرة مشتركة بين لوحة الصالون وبوابة الموظفة ═══
   كانت البذرة داخل salon-hr.js وحده، فلا تصل الأنواع للموظفة إلا بعد أن تفتح
   المالكة شاشة الموارد البشرية. هنا تُقرأ وتُبذر من الطرفين.
   لكل نوع إصدار: النوع المضاف لاحقاً يصل للصالونات القائمة مرة واحدة فقط،
   ويبقى محذوفاً إن حذفته المالكة بعدها. */
(function(){
  if(window.LumaReqTypes)return;
  const KEY='luma_req_types', SEED_KEY='luma_req_types_seed', SEED_VER=2;

  const SEED=[
    {v:1,t:{id:'t1',name:'طلب سلفة',chain:'c2',fields:[
      {label:'المبلغ (ر.س)',type:'number',req:1},
      {label:'سبب السلفة',type:'text',req:0},
    ]}},
    {v:1,t:{id:'t2',name:'خطاب تعريف',chain:'c1',fields:[
      {label:'الجهة الموجَّه لها',type:'text',req:1},
      {label:'اللغة',type:'select',options:['عربي','إنجليزي'],req:1},
    ]}},
    /* استئذان: غياب ساعات داخل يوم الدوام — لا يُخصم من رصيد الإجازات */
    {v:2,t:{id:'t3',name:'طلب استئذان',chain:'c1',fields:[
      {label:'تاريخ الاستئذان',type:'date',req:1},
      {label:'نوع الاستئذان',type:'select',options:['خروج مبكر','تأخر عن بداية الدوام','استئذان خلال الدوام'],req:1},
      {label:'من الساعة',type:'time',req:1},
      {label:'إلى الساعة',type:'time',req:1,after:2},
      {label:'السبب',type:'text',req:0},
    ]}},
  ];

  function all(){
    let cur=LumaStore.get(KEY,null);
    if(!cur){
      cur=SEED.map(x=>x.t);
      LumaStore.set(KEY,cur);LumaStore.set(SEED_KEY,SEED_VER);
      return cur;
    }
    const seen=LumaStore.get(SEED_KEY,1);
    if(seen<SEED_VER){
      SEED.filter(x=>x.v>seen&&!cur.some(t=>t.id===x.t.id)).forEach(x=>cur.push(x.t));
      LumaStore.set(KEY,cur);LumaStore.set(SEED_KEY,SEED_VER);
    }
    return cur;
  }

  window.LumaReqTypes={KEY,SEED_VER,all};
})();
