/* لوما · توثيق العميلات برقم الجوال (OTP)
   التقييم والتعليق متاحان فقط لرقمٍ يمرّ بخطوتين:
   1) رمز تحقق يُرسل للجوال (محاكاة SMS في النسخة التجريبية — يُستبدل بمزوّد
      رسائل حقيقي في المرحلة 4)، 2) الرقم مسجّل فعلاً كعميلة لدى الصالون. */
(function(){
  const VKEY='luma_client_verify';
  /* أرقام العميلات الحاليات (بذور تجريبية) — عميلات جدد يُضفن من لوحة الصالون برقم جوال */
  const KNOWN={
    '0555101101':'نوف العتيبي','0555202202':'سارة الأحمدي','0555303303':'لطيفة المطيري',
    '0555404404':'هند الشمري','0555505505':'وعد الزهراني','0555606606':'منيرة الدوسري',
    '0555707707':'جواهر الشهري','0555808808':'دانة السالم',
  };
  const norm=p=>{let d=String(p||'').replace(/\D/g,'');if(d.startsWith('966'))d='0'+d.slice(3);return d;};
  function registry(){
    const m={...KNOWN};
    try{(JSON.parse(localStorage.getItem('luma_salon_clients'))||[]).forEach(c=>{
      if(c&&c.phone&&c.n)m[norm(c.phone)]=c.n;});}catch(e){}
    return m;
  }

  window.LumaVerify={
    current(){try{return JSON.parse(localStorage.getItem(VKEY));}catch(e){return null;}},
    lookup(p){return registry()[norm(p)]||null;},
    logout(){try{localStorage.removeItem(VKEY);}catch(e){}},
    _code:null,_phone:null,
    start(p){
      const d=norm(p);
      if(!/^05\d{8}$/.test(d))return null;
      this._phone=d;this._code=String(Math.floor(1000+Math.random()*9000));
      return this._code;
    },
    confirm(c){
      if(!this._code||String(c).trim()!==this._code)return {ok:false,reason:'badcode'};
      const name=this.lookup(this._phone);
      if(!name)return {ok:false,reason:'notclient'};
      const v={phone:this._phone,name};
      try{localStorage.setItem(VKEY,JSON.stringify(v));}catch(e){}
      this._code=this._phone=null;
      return {ok:true,name};
    },

    /* بوابة التوثيق — تُرسم داخل host وتستدعي onDone عند النجاح */
    gate(host,onDone){
      const bd='1px solid rgba(150,130,90,.4)';
      const inp='width:100%;background:transparent;border:'+bd+';border-radius:10px;padding:11px 13px;color:inherit;font-family:inherit;font-size:13.5px;outline:none;text-align:right';
      const btn='border:'+bd+';background:linear-gradient(120deg,#dbbd81,#caa85f 45%,#937842);color:#141013;border-radius:10px;padding:11px 16px;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;white-space:nowrap';
      const stepA=(err)=>{
        host.innerHTML=`
        <div style="border:${bd};border-radius:13px;padding:15px 16px;margin-top:8px">
          <div style="font-size:13px;font-weight:700;margin-bottom:4px">🔒 التقييم متاح للعميلات فقط</div>
          <div style="font-size:11.5px;opacity:.65;margin-bottom:11px">وثّقي رقم جوالك المسجّل لدى الصالون لنشر تقييمك.</div>
          ${err?`<div style="font-size:12px;color:#c97b88;margin-bottom:9px">${err}</div>`:''}
          <div style="display:flex;gap:8px">
            <input id="vfPhone" dir="ltr" placeholder="05xxxxxxxx" maxlength="14" style="${inp}"/>
            <button id="vfSend" type="button" style="${btn}">إرسال رمز التحقق</button>
          </div>
        </div>`;
        host.querySelector('#vfSend').onclick=()=>{
          const code=LumaVerify.start(host.querySelector('#vfPhone').value);
          if(!code)return stepA('أدخلي رقم جوال سعودي صحيح (05xxxxxxxx).');
          stepB(code);
        };
      };
      const stepB=(code)=>{
        host.innerHTML=`
        <div style="border:${bd};border-radius:13px;padding:15px 16px;margin-top:8px">
          <div style="font-size:13px;font-weight:700;margin-bottom:9px">أدخلي رمز التحقق المُرسل لجوالك</div>
          <div id="vfCodeDemo" style="font-size:11.5px;border:1px dashed rgba(150,130,90,.5);border-radius:9px;padding:8px 11px;margin-bottom:11px;opacity:.8">💬 (محاكاة SMS — يُفعَّل الإرسال الحقيقي مع مزوّد الرسائل): رمزك هو <b style="font-size:14px;letter-spacing:.2em" dir="ltr">${code}</b></div>
          <div style="display:flex;gap:8px">
            <input id="vfCode" dir="ltr" placeholder="• • • •" maxlength="4" style="${inp};letter-spacing:.4em;text-align:center"/>
            <button id="vfOk" type="button" style="${btn}">تأكيد</button>
            <button id="vfBack" type="button" style="border:${bd};background:transparent;color:inherit;border-radius:10px;padding:11px 13px;font-family:inherit;font-size:12px;cursor:pointer">رجوع</button>
          </div>
          <div id="vfErr" style="font-size:12px;color:#c97b88;margin-top:8px"></div>
        </div>`;
        host.querySelector('#vfBack').onclick=()=>stepA();
        host.querySelector('#vfOk').onclick=()=>{
          const r=LumaVerify.confirm(host.querySelector('#vfCode').value);
          if(r.ok)return onDone(r);
          if(r.reason==='notclient')return stepA('هذا الرقم غير مسجّل لدينا كعميلة — التقييم متاح للعميلات فقط. 🌸');
          host.querySelector('#vfErr').textContent='الرمز غير صحيح — حاولي مرة أخرى.';
        };
      };
      stepA();
    },
  };
})();
