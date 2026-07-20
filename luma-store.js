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
    push(type,msg){
      window.LumaStore.update(EV_KEY,l=>{
        l.unshift({type,msg,at:Date.now()});
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
