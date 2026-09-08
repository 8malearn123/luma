/* ===== LumaAuth — جلسة واحدة لكل الأدوار =====

   المشكلة التي يحلّها: كانت لوحة الصالون ولوحة الخبيرة تمنحان الدور
   لأنفسهما بمجرد فتح الصفحة (`localStorage.setItem('luma_role','salon')`)،
   فأي زائر يفتح salon.html يصبح «مالكة صالون» ويحصل على صلاحية التعديل
   في المتجر والصفحات العامة. الآن لا تُنشأ الجلسة إلا من صفحة الدخول.

   حدود هذه الطبقة — بصراحة: التحقق في المتصفح ليس حاجزاً أمنياً، فأي
   أحد يستطيع تعديل تخزين متصفحه. الحاجز الحقيقي هو Supabase Auth
   وسياسات RLS على الخادم (المرحلة ب). وظيفة هذه الطبقة أن يعرف التطبيق
   من المستخدمة أصلاً، وأن تكون نقطة الوصل التي تحلّ محلها جلسة Supabase
   حين يُربط المشروع: يكفي عندها تبديل session() و signIn() و signOut().  */
(function(){
  if(window.LumaAuth)return;

  const KEY='luma_session', LEGACY='luma_role';
  const TTL=12*60*60*1000;            /* 12 ساعة — جهاز الصالون مشترك */
  const ROLES=['salon','expert','client','staff','admin'];
  const HOME={salon:'salon.html',expert:'expert.html',client:'client.html',
              staff:'staff-portal.html',admin:'admin.html'};
  const subs=[];

  const now=()=>Date.now();
  function read(){
    try{
      const raw=localStorage.getItem(KEY);
      if(raw){
        const s=JSON.parse(raw);
        if(s&&s.role&&ROLES.includes(s.role)){
          if(s.exp&&s.exp<now()){localStorage.removeItem(KEY);return null;}
          return s;
        }
        return null;
      }
      /* توافق مع الجلسات القديمة المخزَّنة كـ luma_role */
      const legacy=localStorage.getItem(LEGACY);
      if(legacy&&ROLES.includes(legacy))return {role:legacy,name:'',at:now(),exp:now()+TTL,legacy:true};
    }catch(e){}
    return null;
  }
  function write(s){
    try{
      if(s){localStorage.setItem(KEY,JSON.stringify(s));localStorage.setItem(LEGACY,s.role);}
      else{localStorage.removeItem(KEY);localStorage.removeItem(LEGACY);}
    }catch(e){}
    subs.forEach(cb=>{try{cb(s);}catch(e){}});
  }

  const LumaAuth={
    ROLES,
    session:read,
    role(){const s=read();return s?s.role:null;},
    name(){const s=read();return s?(s.name||''):'';},
    is(...roles){const r=this.role();return !!r&&roles.flat().includes(r);},
    /* صلاحية التحرير في المتجر والصفحات العامة */
    isOwner(){return this.is('salon','expert');},

    signIn(role,opts){
      if(!ROLES.includes(role))throw new Error('LumaAuth: دور غير معروف — '+role);
      const s={role,name:(opts&&opts.name)||'',at:now(),exp:now()+TTL};
      write(s);return s;
    },
    signOut(next){
      write(null);
      if(next!==false)location.href=(typeof next==='string')?next:'login.html';
    },
    home(role){return HOME[role||this.role()]||'index.html';},
    onChange(cb){subs.push(cb);return()=>{const i=subs.indexOf(cb);if(i>=0)subs.splice(i,1);};},

    /* حارس اللوحات: يُستدعى في رأس الصفحة قبل رسم أي شيء.
       يعيد true إن كانت الجلسة صالحة، وإلا يحوّل لصفحة الدخول
       حاملاً وجهة العودة حتى تعود المستخدمة لحيث كانت. */
    require(roles,opts){
      const allow=[].concat(roles||[]).filter(Boolean);
      const s=read();
      if(s&&(!allow.length||allow.includes(s.role)))return true;
      if(opts&&opts.silent)return false;
      try{
        const next=location.pathname.split('/').pop()+location.hash;
        location.replace('login.html?next='+encodeURIComponent(next)+(s?'&denied=1':''));
      }catch(e){location.replace('login.html');}
      return false;
    },
  };

  window.LumaAuth=LumaAuth;
})();
