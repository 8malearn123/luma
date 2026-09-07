/* ===== LumaStore — الطبقة الموحدة فوق كل مفاتيح luma_* =====
   get/set/update/subscribe + إصدار مخطط مع هجرات صغيرة، حتى لا يكسر أي
   تغيير بنيوي قادم بيانات المستخدمين المخزنة في متصفحاتهم.
   يُحمَّل قبل كل السكربتات الأخرى في كل الصفحات. */
(function(){
  if(window.LumaStore)return;
  const VER_KEY='luma_schema_version', VERSION=1;

  /* هجرات المخطط: املأ دالة لكل إصدار جديد يغيّر بنية مفتاح مخزّن.
     مثال مستقبلي — 2: تحويل luma_hr_pay2 إلى بنية أعمق. */
  const MIGRATIONS={
    1(){ /* الإصدار الأساسي — لا شيء يُرحَّل */ },
  };

  let cur=0;
  try{cur=parseInt(localStorage.getItem(VER_KEY))||0;}catch(e){}
  for(let v=cur+1;v<=VERSION;v++){
    try{MIGRATIONS[v]&&MIGRATIONS[v]();}catch(e){console.warn('LumaStore migration',v,'failed:',e);}
  }
  try{localStorage.setItem(VER_KEY,String(VERSION));}catch(e){}

  const subs={};
  function emit(k,val){(subs[k]||[]).forEach(cb=>{try{cb(val);}catch(e){}});}
  /* مزامنة بين التبويبات المفتوحة */
  window.addEventListener('storage',e=>{
    if(e.key&&subs[e.key])emit(e.key,get(e.key,undefined));
  });

  function get(k,fallback){
    try{const r=localStorage.getItem(k);return r===null?fallback:JSON.parse(r);}
    catch(e){return fallback;}
  }
  function set(k,val){
    try{localStorage.setItem(k,JSON.stringify(val));}
    catch(e){console.warn('LumaStore: storage full or blocked for',k);}
    emit(k,val);
  }

  window.LumaStore={
    VERSION,get,set,
    update(k,fn,fallback){const v=fn(get(k,fallback));set(k,v);return v;},
    remove(k){try{localStorage.removeItem(k);}catch(e){}emit(k,undefined);},
    subscribe(k,cb){(subs[k]=subs[k]||[]).push(cb);return()=>{subs[k]=(subs[k]||[]).filter(x=>x!==cb);};},
    /* للقيم النصية غير-JSON (مثل الثيم ورقم تسلسل الفواتير) */
    raw:{
      get(k,f){try{const r=localStorage.getItem(k);return r===null?f:r;}catch(e){return f;}},
      set(k,v){try{localStorage.setItem(k,String(v));}catch(e){}emit(k,v);},
    },
  };

  /* ===== LumaEvents — سجل إشعارات مركزي لكل عمليات المنصة =====
     أي صفحة تسجّل حدثاً (حجز، دفعة، تقييم، طلب…) وتعرضه لوحة الأدمن حيّاً. */
  const EV_KEY='luma_events', EV_SEEN='luma_events_seen', EV_MAX=60;
  window.LumaEvents={
    KEY:EV_KEY,
    push(type,msg,href){
      window.LumaStore.update(EV_KEY,l=>{
        l.unshift({type,msg,at:Date.now(),...(href?{href}:{})});
        return l.slice(0,EV_MAX);
      },[]);
    },
    list(){return window.LumaStore.get(EV_KEY,[]);},
    unread(){
      const seen=parseInt(window.LumaStore.raw.get(EV_SEEN,'0'))||0;
      return this.list().filter(e=>e.at>seen).length;
    },
    markRead(){window.LumaStore.raw.set(EV_SEEN,String(Date.now()));},
    ago(t){
      const s=Math.max(1,Math.round((Date.now()-t)/1000));
      if(s<60)return 'الآن';
      const m=Math.round(s/60);if(m<60)return 'قبل '+m+' دقيقة';
      const h=Math.round(m/60);if(h<24)return 'قبل '+h+(h===1?' ساعة':' ساعات');
      const d=Math.round(h/24);return 'قبل '+d+(d===1?' يوم':' أيام');
    },
  };
})();

/* ===== LumaDate — تواريخ محلية موحّدة =====
   المشكلة التي يحلّها: toISOString() يعطي تاريخ UTC، فحجزٌ يُسجَّل الساعة 1:30
   فجراً بتوقيت الرياض كان يُخزَّن لليوم السابق. وtoLocaleDateString('ar-SA')
   يعرض التقويم الهجري افتراضياً، فترى العميلة «٢٤ ربيع الأول» بينما تعرض
   لوحة الصالون والفاتورة «2026-09-06». هذه الدوال تجعل التاريخ المخزَّن
   والمعروض شيئاً واحداً بتوقيت الجهاز وبالتقويم الميلادي. */
(function(){
  if(window.LumaDate)return;

  const pad=n=>String(n).padStart(2,'0');
  /* YYYY-MM-DD بالتوقيت المحلي — البديل الآمن عن toISOString().slice(0,10) */
  const iso=d=>{const x=d||new Date();return x.getFullYear()+'-'+pad(x.getMonth()+1)+'-'+pad(x.getDate());};
  /* YYYY-MM بالتوقيت المحلي — للرواتب والتقارير الشهرية */
  const month=d=>{const x=d||new Date();return x.getFullYear()+'-'+pad(x.getMonth()+1);};
  /* يوم مزاح بعدد أيام عن اليوم — لتوليد بيانات لا تنتهي صلاحيتها */
  const plus=(n,from)=>{const x=from?new Date(from):new Date();x.setDate(x.getDate()+n);return x;};
  const isoPlus=(n,from)=>iso(plus(n,from));
  /* تحويل YYYY-MM-DD إلى تاريخ محلي بلا انزلاق منطقة زمنية
     (new Date('2026-09-06') يُفسَّر UTC فيصير اليوم السابق شرق غرينتش) */
  const parse=s=>{
    if(s instanceof Date)return s;
    const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(s||''));
    return m?new Date(+m[1],+m[2]-1,+m[3]):new Date(s);
  };
  const daysBetween=(a,b)=>Math.round((parse(b).setHours(0,0,0,0)-parse(a).setHours(0,0,0,0))/86400000);
  /* حالة الموعد مشتقّة من تاريخه لا من حقل مكتوب يدوياً */
  const isPast=s=>daysBetween(new Date(),s)<0;
  const isToday=s=>daysBetween(new Date(),s)===0;

  /* العرض بالميلادي دائماً — 'ar-SA' وحدها تعطي الهجري */
  const LOCALE='ar-SA-u-ca-gregory';
  const fmt=(s,opts)=>{try{return parse(s).toLocaleDateString(LOCALE,opts||{day:'numeric',month:'long'});}
    catch(e){return iso(parse(s));}};
  const weekday=s=>fmt(s,{weekday:'long'});
  /* تسمية ودّية: اليوم / غداً / بعد غد / اسم اليوم */
  const label=s=>{
    const d=daysBetween(new Date(),s);
    if(d===0)return 'اليوم';
    if(d===1)return 'غداً';
    if(d===2)return 'بعد غد';
    return weekday(s);
  };
  /* التقويم الهجري كمعلومة مساعدة لا كبديل — للعرض بجانب الميلادي عند الحاجة */
  const hijri=s=>{try{return parse(s).toLocaleDateString('ar-SA-u-ca-islamic-umalqura',{day:'numeric',month:'long'});}catch(e){return '';}};

  window.LumaDate={LOCALE,iso,month,plus,isoPlus,parse,daysBetween,isPast,isToday,fmt,weekday,label,hijri};
})();
