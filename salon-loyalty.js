/* لوما · برنامج الولاء والكوبونات
   نقاط لكل ريال مدفوع، مكافآت قابلة للاستبدال بكوبون خصم،
   وكوبونات تسويقية تعمل في صفحة الحجز العامة (booking.html). */

const LOY_CFG_KEY='luma_loyalty_cfg';
const LOY_PTS_KEY='luma_loyalty_pts';
const COUPON_KEY='luma_coupons';

function loyCfg(){
  return Object.assign({on:true,rate:1,rewards:[
    {pts:300,value:30},{pts:600,value:75},{pts:1000,value:150},
  ]},LumaStore.get(LOY_CFG_KEY,{}));
}
function loyPtsAll(){return LumaStore.get(LOY_PTS_KEY,{});}
function loyPts(name){return loyPtsAll()[name]||0;}
/* تُستدعى بعد كل دفعة ناجحة — تُرجع النقاط المضافة */
function loyAward(name,total){
  const cfg=loyCfg();if(!cfg.on||!name)return 0;
  const pts=Math.floor(total*cfg.rate);
  if(pts>0)LumaStore.update(LOY_PTS_KEY,m=>{m[name]=(m[name]||0)+pts;return m;},{});
  return pts;
}
/* رصيد تجريبي أولي للعميلات الحاليات — مرة واحدة فقط */
if(!Object.keys(loyPtsAll()).length){
  LumaStore.set(LOY_PTS_KEY,{'نوف العتيبي':920,'سارة الأحمدي':410,'لطيفة المطيري':760,'هند الشمري':330,'وعد الزهراني':150,'منيرة الدوسري':590});
}

function couponsAll(){
  return LumaStore.get(COUPON_KEY,[{code:'LUMA10',type:'percent',value:10,active:true,note:'حملة الافتتاح'}]);
}
function saveCoupons(list){LumaStore.set(COUPON_KEY,list);}

const LOY={
  /* إعدادات البرنامج + إدارة الكوبونات */
  settings(){
    const cfg=loyCfg();
    const cps=couponsAll();
    LUX.modal('برنامج الولاء والكوبونات',`
      <div class="lux-lead">تكسب العميلة نقاطاً مع كل فاتورة مدفوعة، وتستبدلها بخصومات.</div>
      <div class="lux-f"><label>نقطة لكل ريال مدفوع</label>
        <input id="loyRate" type="number" min="0" step="0.5" value="${cfg.rate}" dir="ltr" style="text-align:right"/></div>
      <div class="lux-f"><label>سلّم المكافآت (نقاط ← خصم بالريال)</label>
        ${cfg.rewards.map((r,i)=>`
          <div style="display:flex;gap:8px;margin-bottom:7px;align-items:center">
            <input class="rwPts" data-i="${i}" type="number" value="${r.pts}" dir="ltr" style="text-align:right;flex:1" placeholder="نقاط"/>
            <span style="color:var(--muted,#888);font-size:13px">←</span>
            <input class="rwVal" data-i="${i}" type="number" value="${r.value}" dir="ltr" style="text-align:right;flex:1" placeholder="ر.س"/>
          </div>`).join('')}</div>
      <div class="lux-f"><label>الكوبونات الفعّالة في صفحة الحجز العامة</label>
        <div id="cpList">${cps.map((c,i)=>`
          <div style="display:flex;align-items:center;gap:9px;padding:8px 10px;border:1px solid var(--line,#333);border-radius:10px;margin-bottom:7px;${c.active?'':'opacity:.45'}">
            <b style="font-family:monospace;letter-spacing:.08em;direction:ltr">${c.code}</b>
            <span style="flex:1;font-size:12px;color:var(--muted,#888)">${c.type==='percent'?c.value+'٪ خصم':c.value+' ر.س خصم'}${c.note?' · '+c.note:''}</span>
            <button type="button" class="lux-chip cpTgl" data-i="${i}">${c.active?'إيقاف':'تفعيل'}</button>
            <button type="button" class="lux-chip cpDel" data-i="${i}" style="color:#e29aa6">حذف</button>
          </div>`).join('')||'<div style="font-size:12.5px;color:var(--muted,#888)">لا كوبونات بعد.</div>'}</div>
        <div style="display:flex;gap:8px;margin-top:6px">
          <input id="cpCode" placeholder="الكود (مثال RAMADAN15)" dir="ltr" style="text-align:right;flex:1.4;text-transform:uppercase"/>
          <select id="cpType" style="flex:1"><option value="percent">نسبة ٪</option><option value="amount">مبلغ ر.س</option></select>
          <input id="cpVal" type="number" placeholder="القيمة" dir="ltr" style="text-align:right;flex:.8"/>
          <button type="button" class="lux-btn lux-ghost" id="cpAdd" style="padding:10px 14px">إضافة</button>
        </div></div>
      <button class="lux-btn lux-gold" data-save style="width:100%;margin-top:10px">حفظ الإعدادات</button>`,{onMount(ov,close){
      ov.querySelectorAll('.cpTgl').forEach(b=>b.onclick=()=>{
        const l=couponsAll();l[+b.dataset.i].active=!l[+b.dataset.i].active;saveCoupons(l);close();LOY.settings();});
      ov.querySelectorAll('.cpDel').forEach(b=>b.onclick=()=>{
        const l=couponsAll();l.splice(+b.dataset.i,1);saveCoupons(l);close();LOY.settings();});
      ov.querySelector('#cpAdd').onclick=()=>{
        const code=ov.querySelector('#cpCode').value.trim().toUpperCase();
        const value=parseFloat(ov.querySelector('#cpVal').value);
        if(!code||!(value>0))return LUX.toast('أدخلي الكود والقيمة','warn');
        const l=couponsAll();
        if(l.some(c=>c.code===code))return LUX.toast('الكود مستخدم من قبل','warn');
        l.push({code,type:ov.querySelector('#cpType').value,value,active:true});
        saveCoupons(l);close();LOY.settings();LUX.toast('أُضيف الكوبون «'+code+'» ✓','ok');};
      ov.querySelector('[data-save]').onclick=()=>{
        const rewards=[...ov.querySelectorAll('.rwPts')].map((p,i)=>({
          pts:parseInt(p.value)||0,value:parseInt(ov.querySelectorAll('.rwVal')[i].value)||0,
        })).filter(r=>r.pts>0&&r.value>0);
        LumaStore.set(LOY_CFG_KEY,{on:true,rate:Math.max(0,parseFloat(ov.querySelector('#loyRate').value)||1),rewards});
        close();LUX.toast('حُفظت إعدادات برنامج الولاء ✓','ok');
        SALON.go('clients');};
    }});
  },

  /* استبدال نقاط عميلة بكوبون خصم شخصي */
  redeem(name){
    const pts=loyPts(name);
    const cfg=loyCfg();
    LUX.modal('استبدال نقاط الولاء',`
      <div class="lux-lead">${name} — الرصيد الحالي <b style="color:var(--gold-light,#ccab64)">★ ${pts.toLocaleString('en')}</b> نقطة</div>
      ${cfg.rewards.map((r,i)=>`
        <button type="button" class="lux-btn ${pts>=r.pts?'lux-gold':'lux-ghost'}" data-rw="${i}" ${pts>=r.pts?'':'disabled'} style="width:100%;margin-bottom:8px;${pts>=r.pts?'':'opacity:.4'}">
          خصم ${r.value} ر.س — مقابل ${r.pts.toLocaleString('en')} نقطة</button>`).join('')}
      <div id="rwOut"></div>`,{onMount(ov,close){
      ov.querySelectorAll('[data-rw]').forEach(b=>b.onclick=()=>{
        const r=cfg.rewards[+b.dataset.rw];if(loyPts(name)<r.pts)return;
        const code=('LOYA-'+Math.abs((name+Date.now()).split('').reduce((h,ch)=>h*31+ch.charCodeAt(0)|0,7)).toString(36)).toUpperCase().slice(0,10);
        LumaStore.update(LOY_PTS_KEY,m=>{m[name]=(m[name]||0)-r.pts;return m;},{});
        const l=couponsAll();l.push({code,type:'amount',value:r.value,active:true,note:'استبدال نقاط — '+name});saveCoupons(l);
        ov.querySelector('#rwOut').innerHTML=`<div style="margin-top:10px;padding:13px;border:1px dashed var(--gold,#ccab64);border-radius:11px;text-align:center">
          كوبون العميلة الشخصي<br><b style="font-family:monospace;font-size:19px;letter-spacing:.12em;direction:ltr;display:inline-block;margin-top:5px">${code}</b>
          <div style="font-size:11.5px;color:var(--muted,#888);margin-top:5px">خصم ${r.value} ر.س — تدخله في صفحة الحجز أو يُطبق بالكاشير</div></div>`;
        LUX.toast('استُبدلت '+r.pts+' نقطة بكوبون '+r.value+' ر.س ✓','ok');
      });
    }});
  },
};
