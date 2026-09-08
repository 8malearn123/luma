/* ===== LumaDB — طبقة البيانات بوضعين =====

   واجهة واحدة أمام الشاشات، ومصدران خلفها:
     • وضع «محلي»  — بلا إعداد: كل شيء في تخزين المتصفح كما اليوم.
     • وضع «سحابي» — بملء luma-config.js: Supabase عبر PostgREST.

   لماذا هكذا: خطة المرحلة ب تقول ألّا نربط الشاشات القشرية بتخزين
   المتصفح ثم نعيد ربطها بالسحابة — عملٌ مكرر. فالشاشات تُكتب مرة واحدة
   على هذه الواجهة، وتشغيل المشروع لاحقاً يصير ملء ملف إعداد.

   لماذا REST مباشرة لا مكتبة: الموقع ثابت بلا خطوة بناء، وإضافة مكتبة
   من CDN إلى كل صفحة تكلفة دائمة مقابل ما نحتاجه فعلاً — قراءة وكتابة
   وجلسة. والمصادقة تمرّ عبر نقاط GoTrue القياسية مع تجديد الرمز.  */
(function(){
  if(window.LumaDB)return;

  const CFG=window.LUMA_CONFIG||{};
  const URL_=(CFG.supabaseUrl||'').replace(/\/+$/,'');
  const KEY=CFG.supabaseAnonKey||'';
  const CLOUD=!!(URL_&&KEY);
  const TOK='luma_sb_token';

  /* ── الرموز ── */
  const tok={
    get(){try{return JSON.parse(localStorage.getItem(TOK)||'null');}catch(e){return null;}},
    set(t){try{t?localStorage.setItem(TOK,JSON.stringify(t)):localStorage.removeItem(TOK);}catch(e){}},
  };
  const fresh=t=>t&&t.access_token&&(!t.expires_at||t.expires_at*1000>Date.now()+60000);

  async function refresh(){
    const t=tok.get();
    if(!t||!t.refresh_token)return null;
    try{
      const r=await fetch(URL_+'/auth/v1/token?grant_type=refresh_token',{
        method:'POST',headers:{'apikey':KEY,'Content-Type':'application/json'},
        body:JSON.stringify({refresh_token:t.refresh_token})});
      if(!r.ok){tok.set(null);return null;}
      const n=await r.json();tok.set(n);return n;
    }catch(e){return null;}
  }
  async function accessToken(){
    let t=tok.get();
    if(fresh(t))return t.access_token;
    t=await refresh();
    return t?t.access_token:null;
  }

  /* ── نداء PostgREST ── */
  async function rest(path,opts){
    opts=opts||{};
    const at=await accessToken();
    const h=Object.assign({
      'apikey':KEY,
      'Content-Type':'application/json',
      /* توقيت الصالون يصل للخادم فتُقارَن حدود الدوام به لا بـ UTC */
      'Accept-Profile':'public',
    },opts.headers||{});
    if(at)h['Authorization']='Bearer '+at;
    if(opts.prefer)h['Prefer']=opts.prefer;
    const r=await fetch(URL_+'/rest/v1/'+path,{
      method:opts.method||'GET',headers:h,
      body:opts.body?JSON.stringify(opts.body):undefined});
    const text=await r.text();
    let data=null;try{data=text?JSON.parse(text):null;}catch(e){data=text;}
    if(!r.ok){
      const err=new Error((data&&(data.message||data.hint))||('HTTP '+r.status));
      err.status=r.status;err.details=data;throw err;
    }
    return data;
  }

  /* ── المصادقة ── */
  const auth={
    /* رمز لمرة واحدة إلى البريد أو الجوال — لا كلمات مرور مخزَّنة */
    async sendOtp(dest){
      const isPhone=/^\+?[0-9]{8,15}$/.test(String(dest).replace(/\s/g,''));
      const body=isPhone?{phone:String(dest).replace(/\s/g,'')}:{email:dest};
      const r=await fetch(URL_+'/auth/v1/otp',{method:'POST',
        headers:{'apikey':KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
      if(!r.ok)throw new Error('تعذّر إرسال رمز التحقق');
      return true;
    },
    async verifyOtp(dest,code){
      const isPhone=/^\+?[0-9]{8,15}$/.test(String(dest).replace(/\s/g,''));
      const body=isPhone
        ? {phone:String(dest).replace(/\s/g,''),token:code,type:'sms'}
        : {email:dest,token:code,type:'email'};
      const r=await fetch(URL_+'/auth/v1/verify',{method:'POST',
        headers:{'apikey':KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
      if(!r.ok)throw new Error('رمز التحقق غير صحيح أو منتهٍ');
      const t=await r.json();tok.set(t);return t;
    },
    async user(){
      const at=await accessToken();if(!at)return null;
      try{
        const r=await fetch(URL_+'/auth/v1/user',{headers:{'apikey':KEY,'Authorization':'Bearer '+at}});
        return r.ok?await r.json():null;
      }catch(e){return null;}
    },
    async signOut(){
      const at=await accessToken();
      if(at){try{await fetch(URL_+'/auth/v1/logout',{method:'POST',
        headers:{'apikey':KEY,'Authorization':'Bearer '+at}});}catch(e){}}
      tok.set(null);
    },
    hasToken(){return !!tok.get();},
  };

  /* ── جداول تُقرأ وتُكتب بالاسم ──
     في الوضع المحلي تُخزَّن كمصفوفات تحت مفاتيح luma_db_<table>،
     فتعمل الشاشات نفسها قبل ربط المشروع وبعده. */
  const localKey=t=>'luma_db_'+t;
  const localRows=t=>LumaStore.get(localKey(t),[])||[];
  const uid=()=>'l'+Date.now().toString(36)+Math.random().toString(36).slice(2,7);
  function matches(row,where){
    return Object.keys(where||{}).every(k=>String(row[k])===String(where[k]));
  }

  const LumaDB={
    mode:CLOUD?'cloud':'local',
    isCloud:CLOUD,
    auth,
    /* نداء دالة على الخادم (RPC) — التوفر والرواتب وغيرها */
    async rpc(fn,args){
      if(!CLOUD)throw new Error('LumaDB.rpc تحتاج ربط المشروع');
      return rest('rpc/'+fn,{method:'POST',body:args||{}});
    },
    async select(table,opts){
      opts=opts||{};
      if(!CLOUD){
        let rows=localRows(table).filter(r=>matches(r,opts.where));
        if(opts.order)rows=rows.slice().sort((a,b)=>String(a[opts.order]).localeCompare(String(b[opts.order])));
        return opts.limit?rows.slice(0,opts.limit):rows;
      }
      const q=[];
      Object.keys(opts.where||{}).forEach(k=>q.push(encodeURIComponent(k)+'=eq.'+encodeURIComponent(opts.where[k])));
      q.push('select='+(opts.select||'*'));
      if(opts.order)q.push('order='+opts.order);
      if(opts.limit)q.push('limit='+opts.limit);
      return rest(table+'?'+q.join('&'));
    },
    async insert(table,row){
      if(!CLOUD){
        const r=Object.assign({id:uid()},row);
        LumaStore.update(localKey(table),l=>{l.push(r);return l;},[]);
        return r;
      }
      const out=await rest(table,{method:'POST',body:row,prefer:'return=representation'});
      return Array.isArray(out)?out[0]:out;
    },
    async update(table,id,patch){
      if(!CLOUD){
        let out=null;
        LumaStore.update(localKey(table),l=>{
          const i=l.findIndex(r=>String(r.id)===String(id));
          if(i>=0){l[i]=Object.assign({},l[i],patch);out=l[i];}
          return l;},[]);
        return out;
      }
      const res=await rest(table+'?id=eq.'+encodeURIComponent(id),
        {method:'PATCH',body:patch,prefer:'return=representation'});
      return Array.isArray(res)?res[0]:res;
    },
    async remove(table,id){
      if(!CLOUD){
        LumaStore.update(localKey(table),l=>l.filter(r=>String(r.id)!==String(id)),[]);
        return true;
      }
      await rest(table+'?id=eq.'+encodeURIComponent(id),{method:'DELETE'});
      return true;
    },
    /* فحص الاتصال — تستخدمه شاشة الإعدادات لعرض حالة الربط */
    async ping(){
      if(!CLOUD)return {ok:true,mode:'local',msg:'يعمل على تخزين المتصفح — لم يُربط مشروع سحابي بعد'};
      try{
        await rest('salons?select=id&limit=1');
        return {ok:true,mode:'cloud',msg:'متصل بالمشروع السحابي'};
      }catch(e){
        return {ok:false,mode:'cloud',msg:'تعذّر الاتصال: '+e.message,status:e.status};
      }
    },
  };

  window.LumaDB=LumaDB;
})();
