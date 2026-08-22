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

/* ══════════ فئات العملاء — حد إنفاق سنوي · مسمّى · مميزات ══════════
   الفئة تُشتق تلقائياً من إنفاق العميلة السنوي، والمسميات والحدود والمميزات
   كلها من إعداد صاحبة الصالون، وتنعكس على جدول العملاء والفلترة. */
const TIER_KEY='luma_client_tiers';
const TIER_DEFAULT=[
  {id:'t1',name:'عميلة جديدة',min:0,    color:'soft', discount:0,  perks:['ترحيب بأول زيارة']},
  {id:'t2',name:'فضية',       min:3000, color:'green',discount:5,  perks:['خصم ٥٪ على الخدمات','أولوية في قائمة الانتظار']},
  {id:'t3',name:'ذهبية',      min:6000, color:'gold', discount:10, perks:['خصم ١٠٪ على الخدمات','هدية عيد الميلاد','حجز مؤكد في أوقات الذروة']},
  {id:'t4',name:'ماسية',      min:12000,color:'gold', discount:15, perks:['خصم ١٥٪ على الخدمات','جلسة عناية مجانية كل ٦ أشهر','مديرة علاقات خاصة']},
];
const tiersAll=()=>{const l=LumaStore.get(TIER_KEY,null);return (Array.isArray(l)&&l.length)?l:TIER_DEFAULT;};
const tiersSorted=()=>tiersAll().slice().sort((a,b)=>(a.min||0)-(b.min||0));
const saveTiers=l=>LumaStore.set(TIER_KEY,l);
const spNum=v=>parseFloat(String(v==null?0:v).replace(/[^\d.]/g,''))||0;
/* الإنفاق السنوي المعتمد في احتساب الفئة */
const clientYearSpend=c=>spNum(c.ysp!=null?c.ysp:c.sp);
/* فئة العميلة: أعلى فئة تجاوزت حدّها السنوي */
function tierOf(c){
  const s=clientYearSpend(c);let t=null;
  tiersSorted().forEach(x=>{if(s>=(x.min||0))t=x;});
  return t||tiersSorted()[0]||null;
}
/* الفئة التالية والمتبقّي للوصول إليها */
function tierNext(c){
  const s=clientYearSpend(c);
  const nx=tiersSorted().find(x=>(x.min||0)>s);
  return nx?{tier:nx,gap:Math.max(0,(nx.min||0)-s)}:null;
}
const tierClients=id=>CLIENTS.filter(c=>(tierOf(c)||{}).id===id);

const TIERS={
  /* إعداد الفئات: المسمّى والحد السنوي والخصم والمميزات */
  settings(){
    const rowHtml=(t,i)=>`
      <div data-row="${i}" style="border:1px solid var(--line);border-radius:12px;padding:12px;margin-bottom:10px;background:var(--surface2)">
        <div class="lux-two">
          <div class="lux-f"><label>مسمّى الفئة</label><input data-f="name" value="${(t.name||'').replace(/"/g,'&quot;')}"/></div>
          <div class="lux-f"><label>حد الإنفاق السنوي (ر.س)</label><input data-f="min" type="number" min="0" dir="ltr" style="text-align:right" value="${t.min||0}"/></div>
        </div>
        <div class="lux-two">
          <div class="lux-f"><label>خصم الفئة (٪)</label><input data-f="discount" type="number" min="0" max="100" dir="ltr" style="text-align:right" value="${t.discount||0}"/></div>
          <div class="lux-f"><label>لون الشارة</label><select data-f="color">
            ${[['gold','ذهبي'],['green','أخضر'],['soft','رمادي']].map(([v,n])=>`<option value="${v}" ${t.color===v?'selected':''}>${n}</option>`).join('')}</select></div>
        </div>
        <div class="lux-f"><label>مميزات الفئة (افصلي بينها بفاصلة)</label>
          <input data-f="perks" value="${(t.perks||[]).join('، ').replace(/"/g,'&quot;')}" placeholder="خصم ١٠٪، هدية عيد الميلاد"/></div>
        <button class="lux-btn lux-ghost" data-del="${i}" style="padding:7px 14px;font-size:12px;color:#e29aa6;border-color:#7c4a55">حذف الفئة</button>
      </div>`;
    const list=tiersSorted();
    LUX.modal('فئات العملاء',`
      <div class="lux-lead">الفئة تُحتسب تلقائياً من إنفاق العميلة خلال السنة — حدّدي المسمّى والحد والمميزات، وتظهر على كل عميلة في جدول العملاء.</div>
      <div data-rows>${list.map(rowHtml).join('')}</div>
      <button class="lux-btn lux-ghost" data-add style="width:100%;margin-bottom:10px">+ إضافة فئة</button>
      <button class="lux-btn lux-gold" data-ok style="width:100%">حفظ الفئات</button>`,{onMount(ov,close){
      const rows=ov.querySelector('[data-rows]');
      const bind=()=>ov.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{
        if(rows.children.length<=1){LUX.toast('لا بد من فئة واحدة على الأقل','err');return;}
        b.closest('[data-row]').remove();});
      bind();
      ov.querySelector('[data-add]').onclick=()=>{
        const d=document.createElement('div');
        d.innerHTML=rowHtml({name:'فئة جديدة',min:0,color:'soft',discount:0,perks:[]},rows.children.length);
        rows.appendChild(d.firstElementChild);bind();};
      ov.querySelector('[data-ok]').onclick=()=>{
        const out=[...rows.querySelectorAll('[data-row]')].map((r,i)=>{
          const g=f=>r.querySelector('[data-f='+f+']');
          return {id:'t'+(i+1),name:g('name').value.trim()||('فئة '+(i+1)),
            min:Math.max(0,parseFloat(g('min').value)||0),
            discount:Math.min(100,Math.max(0,parseFloat(g('discount').value)||0)),
            color:g('color').value,
            perks:g('perks').value.split(/[،,]/).map(x=>x.trim()).filter(Boolean)};
        });
        const mins=out.map(t=>t.min);
        if(new Set(mins).size!==mins.length){LUX.toast('لا يمكن تكرار حد الإنفاق بين فئتين','err');return;}
        saveTiers(out);close();SALON.go('clients');LUX.toast('حُفظت '+out.length+' فئات ✓','ok');
      };
    }});
  },
  /* بطاقة الفئة ومميزاتها */
  view(id){
    const t=tiersAll().find(x=>x.id===id);if(!t)return;
    const cl=tierClients(id);
    LUX.modal('فئة «'+t.name+'»',`
      <div class="lux-row"><span class="k">حد الإنفاق السنوي</span><span class="v">${(t.min||0).toLocaleString('en')} ر.س فأكثر</span></div>
      <div class="lux-row"><span class="k">خصم الفئة</span><span class="v">${t.discount||0}٪</span></div>
      <div class="lux-row"><span class="k">عدد العميلات</span><span class="v">${cl.length}</span></div>
      <div class="lux-lead" style="margin-top:12px">المميزات</div>
      ${(t.perks||[]).length?(t.perks||[]).map(p=>`<div class="lux-row"><span class="k">✦</span><span class="v">${p}</span></div>`).join(''):'<div class="lux-lead">لم تُحدَّد مميزات لهذه الفئة بعد.</div>'}
      <div class="lux-lead" style="margin-top:12px">العميلات في هذه الفئة</div>
      ${cl.length?cl.map(c=>`<div class="lux-row"><span class="k">${c.n}</span><span class="v">${clientYearSpend(c).toLocaleString('en')} ر.س</span></div>`).join(''):'<div class="lux-lead">لا عميلات في هذه الفئة بعد.</div>'}
      <button class="lux-btn lux-gold" data-ok style="width:100%;margin-top:14px">تعديل الفئات</button>`,{onMount(ov,close){
      ov.querySelector('[data-ok]').onclick=()=>{close();TIERS.settings();};
    }});
  },
  /* فلترة جدول العملاء: فئة + بحث بالاسم أو الجوال */
  pick(id){
    const bar=document.querySelector('[data-tierbar]');if(!bar)return;
    bar.querySelectorAll('[data-tid]').forEach(b=>{
      const on=b.dataset.tid===id;
      b.classList.toggle('on',on);
      b.style.background=on?'linear-gradient(120deg,#dbbd81,#9c8047)':'var(--surface3)';
      b.style.color=on?'#131217':'var(--cream)';
      b.style.borderColor=on?'transparent':'var(--line)';
    });
    TIERS.apply();
  },
  apply(){
    const bar=document.querySelector('[data-tierbar]');if(!bar)return;
    const id=(bar.querySelector('[data-tid].on')||{dataset:{tid:''}}).dataset.tid;
    const q=(document.querySelector('#cliSearch')||{value:''}).value.trim().toLowerCase();
    let shown=0;
    document.querySelectorAll('.ctab .ctr').forEach(r=>{
      const okT=!id||r.dataset.tier===id;
      const okQ=!q||(r.dataset.find||'').toLowerCase().includes(q);
      const ok=okT&&okQ;r.style.display=ok?'':'none';if(ok)shown++;
    });
    const n=document.querySelector('#cliCount');if(n)n.textContent=shown;
    const e=document.querySelector('#cliEmpty');if(e)e.style.display=shown?'none':'';
  },
};
window.TIERS=TIERS;
