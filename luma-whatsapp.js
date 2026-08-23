/* لوما · إشعارات واتساب — ربط كل صالون بمزوّد API خاص به
   كل صالون يوصّل حسابه الخاص (Meta Cloud API أو Twilio أو 360dialog أو UltraMsg
   أو أي مزوّد مخصص)، ويحرّر قوالب رسائله، ويتحكم بأي حدث يُرسل تلقائياً.
   بلا ربط: النظام يرجع لروابط wa.me اليدوية بدل أن يفشل صامتاً. */
(function(){
  if(window.LumaWA)return;
  const CFG_KEY='luma_wa_cfg', LOG_KEY='luma_wa_log', LOG_MAX=120;

  /* مزوّدو الواتساب المدعومون وحقول كل واحد */
  const PROVIDERS={
    meta:{n:'Meta WhatsApp Cloud API',doc:'graph.facebook.com',
      f:[['sender','معرّف رقم المرسل (Phone Number ID)','ltr'],['token','رمز الوصول الدائم (Access Token)','ltr']]},
    twilio:{n:'Twilio WhatsApp',doc:'api.twilio.com',
      f:[['sid','Account SID','ltr'],['token','Auth Token','ltr'],['sender','رقم المرسل (whatsapp:+…)','ltr']]},
    d360:{n:'360dialog',doc:'waba.360dialog.io',
      f:[['token','مفتاح D360-API-KEY','ltr']]},
    ultramsg:{n:'UltraMsg',doc:'api.ultramsg.com',
      f:[['sid','معرّف النسخة (instance)','ltr'],['token','رمز الوصول (token)','ltr']]},
    custom:{n:'مزوّد مخصص (Webhook)',doc:'رابطك الخاص',
      f:[['url','رابط الإرسال (POST)','ltr'],['token','رمز التفويض — اختياري','ltr']]},
  };

  /* أحداث النظام التي تُرسل إشعاراً، وقوالبها الافتراضية */
  const EVENTS={
    booking:{n:'تأكيد الحجز',d:'يُرسل للعميلة فور تثبيت موعدها',
      t:'أهلاً {{client}} 🌸\nتم تأكيد حجزك في {{salon}}\nالخدمة: {{service}}\nالموعد: {{date}} الساعة {{time}}\nمع: {{staff}}\nنراكِ قريباً!'},
    reminder:{n:'تذكير قبل الموعد',d:'يُرسل قبل الموعد بعدد الساعات المحدّد',
      t:'تذكير ودّي 🌸\n{{client}}، موعدك في {{salon}} غداً {{date}} الساعة {{time}}.\nالخدمة: {{service}}\nللتعديل أو الإلغاء تواصلي معنا.'},
    cancel:{n:'إلغاء أو تعديل الموعد',d:'يُرسل عند إلغاء الحجز أو تغييره',
      t:'{{client}}، أُلغي موعدك في {{salon}} بتاريخ {{date}} الساعة {{time}}.\nيسعدنا حجزك في وقت آخر يناسبك.'},
    receipt:{n:'الفاتورة بعد الدفع',d:'يُرسل بعد إتمام الدفع مع قيمة الفاتورة',
      t:'شكراً {{client}} 💛\nفاتورتك من {{salon}}: {{amount}} ر.س\nالخدمة: {{service}}\nرقم الفاتورة: {{invoice}}\nسعدنا بزيارتك!'},
    review:{n:'طلب تقييم الزيارة',d:'يُرسل بعد الزيارة لطلب تقييم',
      t:'{{client}}، كيف كانت تجربتك في {{salon}}؟\nرأيك يهمنا — قيّمي زيارتك من هنا:\n{{link}}'},
    staff_ot:{n:'أمر أوفر تايم للموظفة',d:'يُرسل للموظفة عند توجيه أمر أوفر تايم',
      t:'{{staff}}، وصلك أمر أوفر تايم في {{salon}}\nالتاريخ: {{date}}\nالوقت: {{time}}\nالمدة: {{hours}}\nيرجى الردّ بالموافقة أو الاعتذار من بوابة الموظفات.'},
    due:{n:'تنبيه مستحقات',d:'يُرسل للعميلة عند وجود مبلغ غير مدفوع',
      t:'{{client}}، لديك مبلغ مستحق لدى {{salon}} بقيمة {{amount}} ر.س.\nيسعدنا سدادها في زيارتك القادمة.'},
  };

  const DEF={on:false,provider:'meta',cc:'966',sender:'',token:'',sid:'',url:'',
             events:{booking:true,reminder:true,cancel:true,receipt:true,review:true,staff_ot:false,due:false},
             tpl:{},leadHours:24,sandbox:true};

  const get=()=>Object.assign({},DEF,window.LumaStore?LumaStore.get(CFG_KEY,{}):{});
  const set=v=>{if(window.LumaStore)LumaStore.set(CFG_KEY,v);return v;};
  const log=()=>window.LumaStore?LumaStore.get(LOG_KEY,[]):[];
  const pushLog=r=>{if(!window.LumaStore)return;LumaStore.update(LOG_KEY,l=>{l.unshift(r);return l.slice(0,LOG_MAX);},[]);};

  /* رقم بصيغة E.164 بلا + — يقبل 05xxxxxxxx و 9665xxxxxxxx و +966… */
  function normPhone(p,cc){
    let d=String(p==null?'':p).replace(/\D/g,'');
    if(!d)return '';
    cc=String(cc||'966').replace(/\D/g,'');
    if(d.startsWith('00'))d=d.slice(2);
    if(d.startsWith(cc))return d;
    return cc+d.replace(/^0+/,'');
  }
  /* تعبئة متغيرات القالب — أي متغير غير معروف يُترك فارغاً لا يظهر كـ {{x}} */
  function fill(tpl,vars){
    return String(tpl||'').replace(/\{\{(\w+)\}\}/g,(m,k)=>{
      const v=vars&&vars[k];return (v==null||v==='')?'':String(v);
    }).replace(/\n{3,}/g,'\n\n').trim();
  }
  const tplOf=(cfg,ev)=>(cfg.tpl&&cfg.tpl[ev])||(EVENTS[ev]&&EVENTS[ev].t)||'';

  /* بناء طلب المزوّد — نفس الرسالة، أشكال مختلفة */
  function buildRequest(cfg,to,text){
    const H={'Content-Type':'application/json'};
    switch(cfg.provider){
      case 'meta':
        return {url:'https://graph.facebook.com/v21.0/'+encodeURIComponent(cfg.sender||'')+'/messages',
          init:{method:'POST',headers:{...H,Authorization:'Bearer '+(cfg.token||'')},
                body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to,type:'text',text:{preview_url:false,body:text}})}};
      case 'twilio':
        return {url:'https://api.twilio.com/2010-04-01/Accounts/'+encodeURIComponent(cfg.sid||'')+'/Messages.json',
          init:{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded',
                Authorization:'Basic '+btoa((cfg.sid||'')+':'+(cfg.token||''))},
                body:new URLSearchParams({From:'whatsapp:+'+String(cfg.sender||'').replace(/\D/g,''),To:'whatsapp:+'+to,Body:text}).toString()}};
      case 'd360':
        return {url:'https://waba.360dialog.io/v1/messages',
          init:{method:'POST',headers:{...H,'D360-API-KEY':cfg.token||''},
                body:JSON.stringify({to,type:'text',text:{body:text}})}};
      case 'ultramsg':
        return {url:'https://api.ultramsg.com/'+encodeURIComponent(cfg.sid||'')+'/messages/chat',
          init:{method:'POST',headers:H,body:JSON.stringify({token:cfg.token||'',to:'+'+to,body:text})}};
      default:
        return {url:cfg.url||'',
          init:{method:'POST',headers:cfg.token?{...H,Authorization:'Bearer '+cfg.token}:H,
                body:JSON.stringify({to,message:text})}};
    }
  }
  const waLink=(to,text)=>'https://wa.me/'+to+'?text='+encodeURIComponent(text);

  /* هل الربط مكتمل؟ */
  function ready(cfg){
    cfg=cfg||get();
    if(!cfg.on)return false;
    const p=PROVIDERS[cfg.provider];if(!p)return false;
    return p.f.every(([k])=>String(cfg[k]||'').trim());
  }

  /* الإرسال: يُرجع {ok,status,mode,link} ويسجّل المحاولة دائماً */
  async function send(ev,vars,phone,opt){
    opt=opt||{};
    const cfg=get();
    const to=normPhone(phone||(vars&&vars.phone),cfg.cc);
    const text=fill(opt.text||tplOf(cfg,ev),vars||{});
    const base={id:Date.now()+Math.random().toString(36).slice(2,6),ev,to,text,
                at:new Date().toISOString(),name:(vars&&(vars.client||vars.staff))||''};
    if(!to){pushLog({...base,status:'failed',info:'رقم جوال غير صالح'});return {ok:false,status:'failed'};}
    if(!opt.force&&cfg.events&&cfg.events[ev]===false){
      pushLog({...base,status:'skipped',info:'الحدث معطّل في الإعدادات'});return {ok:false,status:'skipped'};}
    if(!ready(cfg)){
      const link=waLink(to,text);
      pushLog({...base,status:'manual',info:'لا يوجد ربط API — رابط إرسال يدوي',link});
      return {ok:false,status:'manual',link};
    }
    if(cfg.sandbox){
      pushLog({...base,status:'sandbox',info:'وضع التجربة — لم تُرسل فعلياً'});
      return {ok:true,status:'sandbox'};
    }
    const {url,init}=buildRequest(cfg,to,text);
    if(!url){pushLog({...base,status:'failed',info:'رابط الإرسال غير مضبوط'});return {ok:false,status:'failed'};}
    try{
      const r=await fetch(url,init);
      const body=await r.text().catch(()=>'');
      if(r.ok){pushLog({...base,status:'sent',info:'HTTP '+r.status});return {ok:true,status:'sent'};}
      pushLog({...base,status:'failed',info:'HTTP '+r.status+' — '+String(body).slice(0,140),link:waLink(to,text)});
      return {ok:false,status:'failed',code:r.status};
    }catch(e){
      pushLog({...base,status:'failed',info:'تعذّر الاتصال بالمزوّد: '+(e&&e.message||e),link:waLink(to,text)});
      return {ok:false,status:'failed'};
    }
  }
  /* إعادة إرسال قيد من السجل */
  async function retry(id){
    const r=log().find(x=>x.id===id);
    if(!r)return {ok:false};
    return send(r.ev,{},r.to,{text:r.text,force:true});
  }

  window.LumaWA={KEY:CFG_KEY,LOG_KEY,PROVIDERS,EVENTS,DEF,
    get,set,log,ready,send,retry,normPhone,fill,tplOf,buildRequest,waLink,
    clearLog(){if(window.LumaStore)LumaStore.set(LOG_KEY,[]);},
    stats(){const l=log();return {total:l.length,
      sent:l.filter(x=>x.status==='sent').length,
      failed:l.filter(x=>x.status==='failed').length,
      manual:l.filter(x=>x.status==='manual').length,
      sandbox:l.filter(x=>x.status==='sandbox').length};},
  };
})();
