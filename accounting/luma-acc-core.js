/* ═══════════ لوما · النواة المحاسبية — النقود والتخزين ودليل الحسابات والتدقيق ═══════════
   طبقة نطاق نقية: لا DOM ولا تخزين مباشر. كل وصول للبيانات يمرّ عبر AccRepo،
   فاستبدال localStorage بـ Postgres لاحقاً تبديل محوّل لا إعادة بناء.
   القواعد المحاسبية تعيش هنا وحدها، ونظيرها في accounting/migrations كقيود SQL. */
(function(){
  if(window.LumaAcc)return;

  /* ─────────── النقود: أعداد صحيحة بالهللات ───────────
     0.1+0.2 !== 0.3 في العوائم — وهذا وحده يكفي لكسر ميزان المراجعة.
     كل المبالغ داخل المحرك هللات صحيحة؛ التحويل عند الحدود فقط. */
  const Money={
    from(v){                                   /* ريال (رقم أو نص) → هللة */
      const n=typeof v==='number'?v:parseFloat(String(v==null?0:v).replace(/[^\d.-]/g,''));
      return Math.round((isFinite(n)?n:0)*100);
    },
    to(h){return (h||0)/100;},                 /* هللة → ريال */
    fmt(h,d){return ((h||0)/100).toLocaleString('en-US',{minimumFractionDigits:d==null?2:d,maximumFractionDigits:d==null?2:d});},
    /* توزيع مبلغ على نسب دون ضياع هللة — الفرق يذهب لأكبر نصيب */
    split(total,weights){
      const sum=weights.reduce((a,b)=>a+b,0)||1;
      const out=weights.map(w=>Math.floor(total*w/sum));
      let rest=total-out.reduce((a,b)=>a+b,0);
      const order=weights.map((w,i)=>i).sort((a,b)=>weights[b]-weights[a]);
      for(let i=0;rest>0;i=(i+1)%order.length){out[order[i]]++;rest--;}
      return out;
    },
  };

  /* ─────────── واجهة التخزين ───────────
     المحرك لا يعرف localStorage. المحوّل الافتراضي يلفّ LumaStore،
     و tx() تحاكي الذرّية: تلتقط الحالة وتعيدها كما كانت إن فشلت العملية.
     (محاكاة — لا بديل عن transaction حقيقية في قاعدة بيانات.) */
  const KEYS={coa:'luma_acc_coa',je:'luma_acc_journal',seq:'luma_acc_seq',
              audit:'luma_acc_audit',map:'luma_acc_map',periods:'luma_acc_periods',
              cc:'luma_acc_costcenters',parties:'luma_acc_parties'};

  const AccRepo={
    get(k,f){try{return LumaStore.get(k,f);}catch(e){return f;}},
    set(k,v){try{LumaStore.set(k,v);}catch(e){throw new Error('تعذّر الحفظ: '+k);}},
    /* عملية ذرّية: إما تكتمل كل الكتابات أو تُرجَع الحالة السابقة */
    tx(keys,fn){
      const snap={};keys.forEach(k=>{snap[k]=JSON.stringify(this.get(k,null));});
      try{return fn();}
      catch(err){
        keys.forEach(k=>{const s=snap[k];try{s==='null'?LumaStore.remove(k):LumaStore.set(k,JSON.parse(s));}catch(e){}});
        throw err;
      }
    },
    nextNo(kind){
      const s=this.get(KEYS.seq,{});
      s[kind]=(s[kind]||0)+1;this.set(KEYS.seq,s);
      return s[kind];
    },
  };

  /* ─────────── سجل التدقيق ───────────
     يُلحق فقط، لا يُعدَّل ولا يُحذف. كل تغيير محاسبي يمرّ من هنا. */
  const Audit={
    log(action,entity,id,before,after,reason){
      const list=AccRepo.get(KEYS.audit,[]);
      list.unshift({
        id:'AUD-'+Date.now()+'-'+Math.floor(Math.random()*1000),
        action,entity,id:String(id),
        before:before==null?null:JSON.parse(JSON.stringify(before)),
        after :after ==null?null:JSON.parse(JSON.stringify(after)),
        reason:reason||'',
        user:Audit.user(),at:new Date().toISOString(),
      });
      AccRepo.set(KEYS.audit,list);
    },
    user(){try{return LumaStore.raw.get('luma_acc_user','مالكة الصالون');}catch(e){return 'نظام';}},
    all(f){
      let l=AccRepo.get(KEYS.audit,[]);
      if(f&&f.entity)l=l.filter(x=>x.entity===f.entity);
      if(f&&f.id)l=l.filter(x=>x.id===String(f.id));
      return l;
    },
  };

  /* ─────────── دليل الحسابات ───────────
     type: asset|liability|equity|revenue|expense
     nature: debit|credit — طبيعة الحساب، و contra يعكسها.
     code هرمي: البادئة تحدد الأب، فالشجرة تُشتق من الترقيم ولا تُخزَّن مرتين. */
  const TYPES={
    asset    :{ar:'الأصول',       nature:'debit' },
    liability:{ar:'الالتزامات',   nature:'credit'},
    equity   :{ar:'حقوق الملكية', nature:'credit'},
    revenue  :{ar:'الإيرادات',    nature:'credit'},
    expense  :{ar:'المصروفات',    nature:'debit' },
  };

  /* دليل افتراضي لصالون تجميل سعودي — قابل للتوسع من الواجهة */
  const COA_SEED=[
    ['1',    'الأصول',                       'asset',    1,0],
    ['11',   'الأصول المتداولة',             'asset',    1,0],
    /* الصندوق والبنك مجموعتان منذ البداية، لكل منهما حساب افتراضي.
       لو كانا ورقتين لتعذّر لاحقاً فتح صندوق لفرع جديد بعد أول ترحيل عليهما. */
    ['1101',   'الصندوق',                    'asset',    1,0],
    ['110101', 'الصندوق الرئيسي',            'asset',    0,0],
    ['1102',   'البنك',                      'asset',    1,0],
    ['110201', 'الحساب البنكي الرئيسي',      'asset',    0,0],
    ['1103', 'مدفوعات الشبكة تحت التحصيل',   'asset',    0,0],
    ['1110', 'العملاء — الذمم المدينة',      'asset',    0,0],
    ['1120', 'المخزون',                      'asset',    0,0],
    ['1130', 'ضريبة القيمة المضافة — المدخلات','asset',  0,0],
    ['1140', 'مصروفات مدفوعة مقدماً',        'asset',    0,0],
    ['12',   'الأصول الثابتة',               'asset',    1,0],
    ['1201', 'أثاث وتجهيزات',                'asset',    0,0],
    ['1202', 'مجمع إهلاك الأثاث والتجهيزات', 'asset',    0,1],
    ['2',    'الالتزامات',                   'liability',1,0],
    ['2101', 'الموردون — الذمم الدائنة',     'liability',0,0],
    ['2110', 'ضريبة القيمة المضافة — المخرجات','liability',0,0],
    ['2120', 'ضريبة القيمة المضافة المستحقة','liability',0,0],
    ['2130', 'رواتب وعمولات مستحقة',         'liability',0,0],
    ['2135', 'بقشيش مستحق للموظفات',         'liability',0,0],
    ['2140', 'مصروفات مستحقة',               'liability',0,0],
    ['2150', 'إيرادات مقدمة — اشتراكات وعربون','liability',0,0],
    ['3',    'حقوق الملكية',                 'equity',   1,0],
    ['3101', 'رأس المال',                    'equity',   0,0],
    ['3201', 'الأرباح المحتجزة',             'equity',   0,0],
    ['3301', 'ملخص الدخل',                   'equity',   0,0],
    ['4',    'الإيرادات',                    'revenue',  1,0],
    ['4101', 'إيرادات الخدمات',              'revenue',  0,0],
    ['4102', 'إيرادات المنتجات',             'revenue',  0,0],
    ['4103', 'إيرادات الاشتراكات',           'revenue',  0,0],
    ['4190', 'مردودات وخصومات المبيعات',     'revenue',  0,1],
    ['5',    'المصروفات',                    'expense',  1,0],
    ['51',   'تكلفة المبيعات',               'expense',  1,0],
    ['5101', 'تكلفة المنتجات المباعة',       'expense',  0,0],
    ['5102', 'تكلفة المستلزمات المستهلكة',   'expense',  0,0],
    ['52',   'المصروفات التشغيلية',          'expense',  1,0],
    ['5201', 'رواتب وأجور',                  'expense',  0,0],
    ['5202', 'عمولات الموظفات',              'expense',  0,0],
    ['5203', 'إيجار',                        'expense',  0,0],
    ['5204', 'كهرباء ومياه واتصالات',        'expense',  0,0],
    ['5205', 'تسويق وإعلان',                 'expense',  0,0],
    ['5206', 'رسوم بنكية ورسوم دفع',         'expense',  0,0],
    ['5207', 'صيانة ونظافة',                 'expense',  0,0],
    ['5290', 'مصروف الإهلاك',                'expense',  0,0],
    ['5299', 'مصروفات أخرى',                 'expense',  0,0],
  ];

  const COA={
    all(){
      let l=AccRepo.get(KEYS.coa,null);
      if(!l){
        l=COA_SEED.map(([code,name,type,isGroup,contra])=>({
          code,name,type,group:!!isGroup,contra:!!contra,
          nature:contra?(TYPES[type].nature==='debit'?'credit':'debit'):TYPES[type].nature,
          active:true,parent:COA.parentOf(code),
        }));
        AccRepo.set(KEYS.coa,l);
      }
      return l;
    },
    parentOf(code){
      const all=(AccRepo.get(KEYS.coa,null)||COA_SEED.map(r=>({code:r[0]})));
      let best=null;
      all.forEach(a=>{const c=a.code||a[0];
        if(c!==code&&code.indexOf(c)===0&&(!best||c.length>best.length))best=c;});
      return best;
    },
    get(code){return COA.all().find(a=>a.code===String(code))||null;},
    /* حساب الترحيل يجب أن يكون ورقة نشطة — لا يُرحَّل على حساب أب */
    postable(code){const a=COA.get(code);return !!(a&&a.active&&!a.group);},
    children(code){return COA.all().filter(a=>a.parent===code);},
    tree(){
      const roots=COA.all().filter(a=>!a.parent);
      const walk=n=>({...n,kids:COA.children(n.code).map(walk)});
      return roots.map(walk);
    },
    add(a){
      if(!a.code||!a.name)throw new Error('رقم الحساب واسمه إلزاميان');
      if(COA.get(a.code))throw new Error('رقم الحساب مستخدم: '+a.code);
      if(!TYPES[a.type])throw new Error('نوع حساب غير معروف: '+a.type);
      const list=COA.all();
      const rec={code:String(a.code),name:a.name,type:a.type,group:!!a.group,contra:!!a.contra,
        nature:a.contra?(TYPES[a.type].nature==='debit'?'credit':'debit'):TYPES[a.type].nature,
        active:a.active!==false,parent:COA.parentOf(String(a.code))};
      list.push(rec);list.sort((x,y)=>x.code.localeCompare(y.code));
      AccRepo.set(KEYS.coa,list);
      Audit.log('create','account',rec.code,null,rec);
      return rec;
    },
    setActive(code,on,reason){
      const list=COA.all();const a=list.find(x=>x.code===String(code));
      if(!a)throw new Error('حساب غير موجود: '+code);
      const before={...a};a.active=!!on;AccRepo.set(KEYS.coa,list);
      Audit.log('update','account',code,before,a,reason);
      return a;
    },
    TYPES,
  };

  window.LumaAcc={Money,AccRepo,Audit,COA,KEYS,TYPES,COA_SEED};
})();
