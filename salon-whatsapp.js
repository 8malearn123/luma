/* لوما · داشبورد الصالون — شاشة «إشعارات واتساب»
   ربط الصالون بمزوّده الخاص، وتحرير قوالب الرسائل، والتحكم بكل حدث، وسجل الإرسال. */

const WA_TAB_DEF='connect';
const WA={
  tab:WA_TAB_DEF,
  go(t){this.tab=t;SALON.go('whatsapp');},
  cfg(){return LumaWA.get();},
  save(patch,silent){const c={...LumaWA.get(),...patch};LumaWA.set(c);if(!silent)SALON.go('whatsapp');return c;},
  setField(k,el){const v=el.type==='checkbox'?el.checked:el.value;this.save({[k]:v},true);},
  setProvider(p){this.save({provider:p});},
  toggle(){const c=this.cfg();this.save({on:!c.on});LUX.toast(!c.on?'فُعّل ربط واتساب':'أُوقف ربط واتساب',!c.on?'ok':'err');},
  toggleEvent(ev){const c=this.cfg();const e={...(c.events||{})};e[ev]=e[ev]===false;this.save({events:e});},
  setTpl(ev,el){const c=this.cfg();const t={...(c.tpl||{})};t[ev]=el.value;this.save({tpl:t},true);},
  resetTpl(ev){const c=this.cfg();const t={...(c.tpl||{})};delete t[ev];this.save({tpl:t});LUX.toast('عاد القالب للنص الافتراضي','ok');},
  toggleSandbox(){const c=this.cfg();this.save({sandbox:!c.sandbox});
    LUX.toast(!c.sandbox?'وضع التجربة مفعّل — لا إرسال فعلي':'الإرسال الفعلي مفعّل','ok');},

  /* اختبار الاتصال برقم تجريبي */
  test(){
    const c=this.cfg();
    LUX.modal('اختبار الإرسال',`
      <div class="lux-lead">نرسل رسالة تجريبية عبر «${LumaWA.PROVIDERS[c.provider].n}» للتأكد من صحة الربط.
        ${c.sandbox?'<b style="color:var(--gold-light)">وضع التجربة مفعّل — لن تُرسل فعلياً.</b>':''}</div>
      <div class="lux-f"><label>رقم الجوال</label><input name="ph" dir="ltr" style="text-align:right" placeholder="05xxxxxxxx"/></div>
      <div class="lux-f"><label>نص الرسالة</label><textarea name="tx" rows="3">رسالة تجريبية من ${(typeof pageCfg==='function'?pageCfg().title:'صالونك')} عبر لوما ✓</textarea></div>
      <button class="lux-btn lux-gold" data-ok style="width:100%">إرسال الاختبار</button>`,{onMount(ov,close){
      ov.querySelector('[data-ok]').onclick=async()=>{
        const ph=ov.querySelector('[name=ph]').value.trim();
        if(!ph){LUX.toast('أدخلي رقم الجوال','err');return;}
        const btn=ov.querySelector('[data-ok]');btn.disabled=true;btn.textContent='جارٍ الإرسال…';
        const r=await LumaWA.send('booking',{},ph,{text:ov.querySelector('[name=tx]').value,force:true});
        close();SALON.go('whatsapp');
        if(r.status==='sent')LUX.toast('نجح الإرسال ✓ — وصل عبر المزوّد','ok');
        else if(r.status==='sandbox')LUX.toast('وضع التجربة: سُجّلت الرسالة بلا إرسال فعلي','ok');
        else if(r.status==='manual'){LUX.toast('لا يوجد ربط مكتمل — فُتح رابط الإرسال اليدوي','warn');window.open(r.link,'_blank','noopener');}
        else LUX.toast('فشل الإرسال — راجعي السجل أسفل الشاشة','err');
      };
    }});
  },
  openLink(id){const r=LumaWA.log().find(x=>x.id===id);if(r&&r.link)window.open(r.link,'_blank','noopener');},
  async retry(id){
    const r=await LumaWA.retry(id);SALON.go('whatsapp');
    LUX.toast(r.ok?'أُعيد الإرسال ✓':'فشلت إعادة الإرسال','ok');
  },
  clearLog(){LUX.confirm('مسح سجل الإرسال بالكامل؟',()=>{LumaWA.clearLog();SALON.go('whatsapp');LUX.toast('مُسح السجل','ok');},true);},
};
window.WA=WA;

SCREENS.whatsapp=()=>{
  const c=WA.cfg(), P=LumaWA.PROVIDERS, E=LumaWA.EVENTS, st=LumaWA.stats(), ok=LumaWA.ready(c);
  const inp='background:var(--bg);border:1px solid var(--line);border-radius:9px;padding:11px 13px;color:var(--white);font-family:inherit;font-size:13px;outline:none;width:100%';
  const tabs=[['connect','الربط'],['events','الأحداث والقوالب'],['log','سجل الإرسال']];
  const ST={sent:['أُرسلت','green'],failed:['فشلت','soft'],manual:['يدوي','gold'],sandbox:['تجربة','soft'],skipped:['متجاهَلة','soft']};

  const head=`
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:12px">
    <div><div style="font-weight:600;font-size:19px;color:var(--white)">إشعارات واتساب</div>
      <div style="font-size:13px;color:var(--gold-pale);margin-top:2px">اربطي حساب واتساب الخاص بصالونك — تأكيد الحجز والتذكير والفاتورة وطلب التقييم تُرسل تلقائياً</div></div>
    <div style="display:flex;gap:9px;flex-wrap:wrap">
      <button class="btn btn-ghost" onclick="WA.test()">إرسال اختبار</button>
      <button class="btn ${c.on?'btn-ghost':'btn-gold'}" onclick="WA.toggle()">${c.on?'إيقاف الربط':'تفعيل الربط'}</button>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:20px">
    <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('mega',19)}</div></div>
      <div class="val" style="font-size:20px;color:${ok&&c.on?'#9fce99':'#e29aa6'}">${!c.on?'موقوف':(ok?'متصل':'غير مكتمل')}</div>
      <div class="k">حالة الربط · ${P[c.provider].n}</div></div>
    <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('invoice',19)}</div></div><div class="val">${st.sent}</div><div class="k">رسالة أُرسلت</div></div>
    <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('clock',19)}</div></div><div class="val" style="color:${st.failed?'#e29aa6':'var(--gold-light)'}">${st.failed}</div><div class="k">فشلت — قابلة لإعادة الإرسال</div></div>
    <div class="stat"><div class="glow"></div><div class="top"><div class="ico">${icon('users',19)}</div></div><div class="val">${Object.values(c.events||{}).filter(Boolean).length}</div><div class="k">حدث مفعّل من ${Object.keys(E).length}</div></div>
  </div>
  <div style="display:flex;gap:8px;border-bottom:1px solid var(--line);margin-bottom:20px;overflow-x:auto">
    ${tabs.map(([k,l])=>`<button onclick="WA.go('${k}')" style="background:none;border:none;cursor:pointer;font-family:inherit;font-size:14px;font-weight:600;padding:10px 16px;white-space:nowrap;border-bottom:2px solid ${WA.tab===k?'var(--gold-light)':'transparent'};color:${WA.tab===k?'var(--gold-light)':'var(--muted)'}">${l}${k==='log'&&st.total?` · ${st.total}`:''}</button>`).join('')}
  </div>`;

  if(WA.tab==='events'){
    return head+`
    <div class="card" style="margin-bottom:14px;display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <div style="flex:1;min-width:200px"><div style="font-size:13.5px;color:var(--white);font-weight:600">التذكير قبل الموعد</div>
        <div style="font-size:11.5px;color:var(--muted);margin-top:2px">كم ساعة قبل الموعد يُرسل التذكير</div></div>
      <input id="waLead" type="number" min="1" max="72" value="${c.leadHours||24}" onchange="WA.setField('leadHours',this)" dir="ltr" style="${inp};width:90px;text-align:center"/>
      <span style="font-size:12px;color:var(--muted)">ساعة</span>
    </div>
    ${Object.entries(E).map(([k,ev])=>{const on=(c.events||{})[k]!==false;const cur=LumaWA.tplOf(c,k);const custom=!!(c.tpl||{})[k];
    return `
    <div class="card wa-ev" data-ev="${k}" style="margin-bottom:12px">
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:10px">
        <div style="flex:1;min-width:190px">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span style="font-size:14.5px;color:var(--white);font-weight:600">${ev.n}</span>
            ${custom?'<span class="badge gold" style="font-size:10px">قالب مخصص</span>':''}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:3px">${ev.d}</div>
        </div>
        ${custom?`<button class="btn btn-ghost" style="padding:7px 12px;font-size:11.5px" onclick="WA.resetTpl('${k}')">إرجاع الافتراضي</button>`:''}
        <button class="wa-tgl btn ${on?'btn-gold':'btn-ghost'}" style="padding:7px 15px;font-size:12px" onclick="WA.toggleEvent('${k}')">${on?'مفعّل ✓':'معطّل'}</button>
      </div>
      <textarea class="wa-tpl" rows="4" onchange="WA.setTpl('${k}',this)" style="${inp};line-height:2;resize:vertical">${String(cur).replace(/</g,'&lt;')}</textarea>
      <div style="font-size:11px;color:var(--muted);margin-top:7px;line-height:1.9">المتغيرات المتاحة:
        ${['client','salon','service','staff','date','time','amount','invoice','hours','link'].map(v=>`<code style="background:var(--surface3);border-radius:5px;padding:2px 6px;margin-left:4px;font-size:10.5px" dir="ltr">{{${v}}}</code>`).join('')}</div>
    </div>`;}).join('')}`;
  }

  if(WA.tab==='log'){
    const L=LumaWA.log();
    return head+`
    <div class="card" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px">
      <span style="font-size:12.5px;color:var(--gold-pale)">كل محاولة إرسال تُسجَّل هنا — الناجحة والفاشلة واليدوية</span>
      ${L.length?'<button class="btn btn-ghost" onclick="WA.clearLog()">مسح السجل</button>':''}
    </div>
    ${L.length?`<div class="card" style="overflow-x:auto;padding:0">
      <table style="width:100%;min-width:840px;border-collapse:collapse;font-size:12.5px">
        <thead><tr style="background:var(--surface2);color:var(--gold)">
          ${['الوقت','الحدث','المستلم','الرسالة','الحالة',''].map(h=>`<th style="padding:11px 13px;text-align:right;white-space:nowrap">${h}</th>`).join('')}
        </tr></thead>
        <tbody>${L.map(r=>{const [lb,cl]=ST[r.status]||['—','soft'];
        return `<tr class="wa-row" style="border-top:1px solid var(--line-soft)">
          <td style="padding:10px 13px;color:var(--muted);white-space:nowrap" dir="ltr">${String(r.at).slice(0,16).replace('T',' ')}</td>
          <td style="padding:10px 13px;color:var(--white)">${(E[r.ev]||{n:r.ev}).n}${r.name?`<div style="font-size:10.5px;color:var(--muted)">${r.name}</div>`:''}</td>
          <td style="padding:10px 13px;color:var(--gold-pale)" dir="ltr">+${r.to}</td>
          <td style="padding:10px 13px;color:var(--cream);max-width:280px"><div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${String(r.text||'').replace(/</g,'&lt;').replace(/\n/g,' · ')}</div>
            ${r.info?`<div style="font-size:10.5px;color:var(--muted);margin-top:3px">${String(r.info).replace(/</g,'&lt;')}</div>`:''}</td>
          <td style="padding:10px 13px"><span class="badge ${cl}" style="font-size:10.5px">${lb}</span></td>
          <td style="padding:8px;white-space:nowrap">
            ${r.link?`<button class="btn btn-ghost" style="padding:6px 11px;font-size:11px" onclick="WA.openLink('${r.id}')">فتح واتساب</button>`:''}
            ${r.status==='failed'?`<button class="btn btn-ghost" style="padding:6px 11px;font-size:11px" onclick="WA.retry('${r.id}')">إعادة</button>`:''}
          </td></tr>`;}).join('')}</tbody></table></div>`
    :'<div class="card" style="text-align:center;color:var(--muted);font-size:13px;padding:26px">لا رسائل بعد — جرّبي «إرسال اختبار» من الأعلى.</div>'}`;
  }

  /* تبويب الربط */
  const p=P[c.provider];
  return head+`
  <div class="card" style="margin-bottom:14px">
    <div class="sec-label">المزوّد <span class="ln"></span><span style="font-size:11px;color:var(--muted)">لكل صالون حسابه الخاص — بياناته تبقى في متصفحه ولا تُشارك</span></div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px">
      ${Object.entries(P).map(([k,v])=>`
      <button class="wa-prov" data-prov="${k}" onclick="WA.setProvider('${k}')" style="border:1px solid ${c.provider===k?'var(--gold-deep)':'var(--line)'};background:${c.provider===k?'rgba(219,189,129,.1)':'var(--surface2)'};border-radius:11px;padding:12px 11px;cursor:pointer;font-family:inherit;text-align:right">
        <span style="display:block;font-size:12.5px;color:${c.provider===k?'var(--gold-light)':'var(--white)'};font-weight:600">${v.n}</span>
        <span style="display:block;font-size:10px;color:var(--muted);margin-top:4px" dir="ltr">${v.doc}</span></button>`).join('')}
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      ${p.f.map(([k,lb,d])=>`
      <div><label style="display:block;font-size:12px;color:var(--gold-pale);margin-bottom:6px">${lb}</label>
        <input class="wa-f" data-f="${k}" ${k==='token'?'type="password"':''} value="${String(c[k]||'').replace(/"/g,'&quot;')}" onchange="WA.setField('${k}',this)" ${d==='ltr'?'dir="ltr" style="'+inp+';text-align:right"':'style="'+inp+'"'}/></div>`).join('')}
      <div><label style="display:block;font-size:12px;color:var(--gold-pale);margin-bottom:6px">مفتاح الدولة الافتراضي</label>
        <input class="wa-f" data-f="cc" value="${c.cc||'966'}" onchange="WA.setField('cc',this)" dir="ltr" style="${inp};text-align:right"/></div>
    </div>
    <div style="display:flex;align-items:center;gap:12px;margin-top:16px;padding-top:14px;border-top:1px solid var(--line-soft);flex-wrap:wrap">
      <div style="flex:1;min-width:220px"><div style="font-size:13px;color:var(--white);font-weight:600">وضع التجربة</div>
        <div style="font-size:11.5px;color:var(--muted);margin-top:2px">تُسجَّل الرسائل في السجل بلا إرسال فعلي — أطفئيه بعد التأكد من الربط</div></div>
      <button class="wa-sandbox btn ${c.sandbox?'btn-gold':'btn-ghost'}" style="padding:8px 16px;font-size:12px" onclick="WA.toggleSandbox()">${c.sandbox?'مفعّل ✓':'معطّل'}</button>
    </div>
  </div>
  <div class="card" style="border-color:${ok?'rgba(111,168,106,.4)':'var(--gold-deep)'}">
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <span style="font-size:22px">${ok?'✓':'⚠'}</span>
      <div style="flex:1;min-width:220px">
        <div style="font-size:14px;color:var(--white);font-weight:600">${ok?'الربط مكتمل':'الربط غير مكتمل'}</div>
        <div style="font-size:12px;color:var(--muted);margin-top:3px;line-height:1.9">${ok
          ?'كل حدث مفعّل سيُرسل تلقائياً عبر '+p.n+'.'
          :'أكملي حقول '+p.n+' أعلاه. حتى ذلك الحين تُحفظ الرسائل في السجل مع رابط إرسال يدوي عبر wa.me.'}</div>
      </div>
      <button class="btn btn-ghost" onclick="WA.test()">إرسال اختبار</button>
    </div>
  </div>`;
};
