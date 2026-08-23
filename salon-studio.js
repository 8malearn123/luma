/* لوما · استوديو تصميم موقع الصالون
   ── المبدأ المعماري ──
   الواجهة العامة ليست صفحة ثابتة، بل مصفوفة أقسام مرتّبة تُرسم من JSON محفوظ،
   وتُلوَّن عبر متغيّرات CSS تُحقن وقت التشغيل. والمعاينة هنا ليست محاكاة —
   بل booking.html نفسها داخل iframe، تستقبل المسودة غير المحفوظة عبر postMessage.

   ── مصدرا الحقيقة (مقصودان) ──
   • حقول مستقرة يُستعلم عنها  → مفاتيح مباشرة في luma_page_cfg (title, themeId, layout…)
   • خيارات مرنة أو تجريبية    → كائن extras داخل نفس المفتاح (perks, faq, countdown…)
   القاعدة: ما يثبت ويُستعلم عنه يُرقّى لاحقاً إلى حقل مباشر. */

/* ═══ الأقسام التسعة عشر ووصفها العربي ═══ */
const ST_SECTIONS={
  banner:     {n:'شريط الإعلان',   d:'أشرطة ترويجية أعلى الصفحة'},
  perks:      {n:'لماذا نحن',      d:'مميزات الصالون — نظافة وخصوصية ومواعيد'},
  services:   {n:'خدماتنا',        d:'شبكة الخدمات مع السعر والمدة (ثابت لا يُخفى)'},
  offers:     {n:'الباقات والعروض',d:'عروض مجمّعة وخصومات موسمية'},
  countdown:  {n:'عدّاد العرض',    d:'عد تنازلي لعرض ينتهي بتاريخ محدّد'},
  team:       {n:'فريق العمل',     d:'الخبيرات وتخصصاتهن'},
  gallery:    {n:'معرض الأعمال',   d:'صور وفيديوهات أعمالك'},
  wide:       {n:'بنرات عريضة',    d:'بنر بصورة وعنوان يملأ العرض'},
  divider:    {n:'فاصل تسويقي',    d:'سطر واحد بين قسمين'},
  brands:     {n:'الماركات',       d:'ماركات المنتجات التي تستخدمينها'},
  video:      {n:'فيديو تعريفي',   d:'يوتيوب أو ملف فيديو مباشر'},
  reviews:    {n:'آراء العميلات',  d:'تقييمات وشهادات بالنجوم'},
  hours:      {n:'أوقات العمل',    d:'جدول الدوام الأسبوعي'},
  location:   {n:'موقعنا',         d:'العنوان والخريطة'},
  faq:        {n:'الأسئلة الشائعة',d:'سؤال وجواب — من تبويب الصفحات'},
  text:       {n:'نص حر',          d:'عنوان وفقرة تكتبينها بنفسك'},
  booking_cta:{n:'دعوة الحجز',     d:'شريط ختامي يدفع للحجز'},
  support:    {n:'واتساب واتصال',  d:'زرّا تواصل سريع'},
  insta:      {n:'انستغرام',       d:'شبكة صور وزر متابعة'},
};
const ST_ORDER_DEFAULT=['banner','perks','services','offers','countdown','team','gallery','wide','divider','brands','video','reviews','hours','location','faq','text','booking_cta','support','insta'];
const ST_ON_DEFAULT={banner:1,perks:1,services:1,gallery:1,reviews:1,hours:1,location:1,booking_cta:1,support:1};

/* ═══ قوالب جاهزة — ضغطة واحدة تضبط اللون والخط والقالب والاستدارة معاً ═══ */
const ST_TEMPLATES=[
  {id:'gold',  n:'فخم ذهبي',   d:'كلاسيكي راقٍ بلمسة ذهبية',
   set:{themeId:'classic',font:'amiri',    theme:'custom',themeCustom:{bg:'#0b0a08',card:'#171410',ac:'#b08a57',tx:'#f3ece1'}}, ex:{btnRadius:0}},
  {id:'rose',  n:'وردي أنثوي', d:'ناعم ودافئ',
   set:{themeId:'modern', font:'messiri',  theme:'custom',themeCustom:{bg:'#1a0e12',card:'#241318',ac:'#db2777',tx:'#f8eef1'}}, ex:{btnRadius:20}},
  {id:'nude',  n:'نيود هادئ',  d:'ألوان ترابية مريحة',
   set:{themeId:'minimal',font:'almarai',  theme:'custom',themeCustom:{bg:'#f7f3ec',card:'#ffffff',ac:'#a1866f',tx:'#2e241b'}}, ex:{btnRadius:8}},
  {id:'noir',  n:'أسود فاخر',  d:'تباين عالٍ وأناقة',
   set:{themeId:'bold',   font:'changa',   theme:'custom',themeCustom:{bg:'#0a0a0c',card:'#141418',ac:'#d4af37',tx:'#f5f5f5'}}, ex:{btnRadius:6}},
  {id:'spa',   n:'سبا أخضر',   d:'استرخاء وطبيعة',
   set:{themeId:'minimal',font:'tajawal',  theme:'custom',themeCustom:{bg:'#0a1413',card:'#12201e',ac:'#0f766e',tx:'#eef6f4'}}, ex:{btnRadius:12}},
  {id:'violet',n:'بنفسجي عصري',d:'جريء وحديث',
   set:{themeId:'modern', font:'cairo',    theme:'custom',themeCustom:{bg:'#120e1c',card:'#1b1528',ac:'#7c3aed',tx:'#f2eefb'}}, ex:{btnRadius:16}},
];
const ST_THEMES=[['modern','عصري','زوايا دائرية وظل ناعم'],['minimal','بسيط','زوايا حادة بلا ظل'],
                 ['bold','جريء','ظل عميق وحدود سميكة'],['classic','كلاسيكي','بلا استدارة وخط سفلي ذهبي']];

/* ═══ خطوات «أكمل موقعك» ═══ */
const ST_STEPS=[
  ['logo','الشعار',            c=>!!c.logo,        'identity'],
  ['title','الاسم والوصف',     c=>!!c.title&&!!c.bio,'identity'],
  ['colors','الألوان والقالب',  c=>!!c.themeId,     'design'],
  ['cover','صورة الغلاف',      c=>!!c.cover,       'identity'],
  ['svc','الخدمات',            ()=>typeof SVC_CATALOG!=='undefined'&&SVC_CATALOG.length>0,'svc'],
  ['hours','أوقات العمل',      c=>!!((c.extras||{}).hours||[]).length,'design'],
  ['team','فريق العمل',        ()=>typeof STAFF!=='undefined'&&STAFF.length>0,'team'],
  ['reviews','آراء العميلات',  c=>!!((c.extras||{}).reviews||[]).length||true,'design'],
  ['phone','التواصل والحجز',   c=>!!c.phone,       'identity'],
  ['publish','النشر',          c=>!!c.published,   'design'],
];

/* ═══ محرّرات القوائم: مخطط واحد يخدم كل الأقسام ذات العناصر المتكررة ═══ */
const ST_LISTS={
  perks:{n:'مميزات الصالون',f:[['ic','الأيقونة','✦'],['t','العنوان',''],['d','الوصف','']]},
  offers:{n:'الباقات والعروض',f:[['b','الشارة','-15٪'],['t','العنوان',''],['d','الوصف','']]},
  wide:{n:'البنرات العريضة',f:[['t','العنوان',''],['d','السطر الثاني',''],['img','رابط الصورة','']]},
  brands:{n:'الماركات',f:[['n','اسم الماركة',''],['img','رابط الشعار','']]},
  hours:{n:'أوقات العمل',f:[['d','اليوم أو المدى',''],['o','من','10:00 ص'],['c','إلى','10:00 م']]},
};

const STUDIO={
  form:{}, extras:null, dirty:false, device:'mobile', sub:null,
  _hist:[], _skip:false, _timer:null, _prev:null, _post:null,

  cfg(){return (typeof pageCfg==='function')?pageCfg():{};},
  /* القراءة دائماً: المسودة أولاً ثم المحفوظ */
  val(k){return this.form[k]!==undefined?this.form[k]:this.cfg()[k];},
  ex(){if(this.extras===null)this.extras={...(this.cfg().extras||{})};return this.extras;},
  set(k,v){this.snap();this.form[k]=v;this.dirty=true;this.push();this.paint();},
  setEx(k,v){this.snap();const e=this.ex();e[k]=v;this.dirty=true;this.push();this.paint();},

  /* ── التراجع: لقطات بتجميع زمني ٧٠٠ مللي ثانية، فالكتابة السريعة لقطة واحدة ── */
  snap(){
    if(this._skip){this._skip=false;return;}
    if(this._timer)return;
    this._hist.push({form:{...this.form},extras:{...this.ex()}});
    if(this._hist.length>30)this._hist.shift();
    this._timer=setTimeout(()=>{this._timer=null;},700);
  },
  undo(){
    const s=this._hist.pop();
    if(!s){LUX.toast('ما فيه تعديلات للتراجع عنها','warn');return;}
    this._skip=true;this.form={...s.form};this.extras={...s.extras};
    this.dirty=Object.keys(this.form).length>0;this.push();this.paint();
    LUX.toast('تراجعت خطوة ✓','ok');
  },
  discard(){
    LUX.confirm('تجاهل كل التغييرات غير المنشورة؟',()=>{
      this.form={};this.extras=null;this.dirty=false;this._hist=[];this.push();this.paint();
      LUX.toast('عادت المسودة للمحفوظ','ok');
    },true);
  },

  /* ── المعاينة الحية: إرسال مجمَّع كل ٢٥٠ مللي ثانية، والهدف origin لا '*' ── */
  frame(){return document.getElementById('pagePrev');},
  postNow(){
    const f=this.frame();if(!f||!f.contentWindow)return;
    try{f.contentWindow.postMessage({type:'salon-preview',settings:this.form,extras:this.ex()},window.location.origin);}catch(e){}
  },
  push(){clearTimeout(this._post);this._post=setTimeout(()=>this.postNow(),250);},

  /* ── النشر الموحّد ── */
  publish(){
    const patch={...this.form,extras:this.ex()};
    if(!this.cfg().published)patch.published=true;
    PAGE.save(patch,true);
    this.form={};this.extras=null;this.dirty=false;this._hist=[];
    SALON.go('page');LUX.toast('تم نشر تصميم موقعك بنجاح ✓','ok');
  },
  resetAll(){
    LUX.confirm('استعادة التصميم الافتراضي بالكامل؟ سيُفقد ترتيب الأقسام ومحتواها المخصص.',()=>{
      PAGE.save({layout:null,extras:{},themeId:'modern',theme:'dark-luxury',themeCustom:null},true);
      this.form={};this.extras=null;this.dirty=false;this._hist=[];
      SALON.go('page');LUX.toast('عاد التصميم للافتراضي','ok');
    },true);
  },

  /* ── قالب جاهز ── */
  template(id){
    const t=ST_TEMPLATES.find(x=>x.id===id);if(!t)return;
    this.snap();
    Object.assign(this.form,t.set);
    Object.assign(this.ex(),t.ex);
    this.dirty=true;this.push();this.paint();
    LUX.toast('طُبّق قالب «'+t.n+'» — شوفي المعاينة','ok');
  },
  theme(id){this.set('themeId',id);},
  device(d){this.device=d;this.paint();},

  /* ── لوحة الأقسام: إظهار/إخفاء · تحريك · تكرار · حذف ── */
  order(){
    const cur=(this.val('layout')||[]).filter(x=>x&&ST_SECTIONS[x.k]);
    const out=cur.map(x=>({k:x.k,on:x.k==='services'?true:x.on!==false}));
    ST_ORDER_DEFAULT.forEach(k=>{if(!cur.some(x=>x.k===k))out.push({k,on:!!ST_ON_DEFAULT[k]});});
    return out;
  },
  setOrder(l){this.set('layout',l);},
  secToggle(i){const l=this.order();if(!l[i]||l[i].k==='services')return;l[i]={...l[i],on:!l[i].on};this.setOrder(l);},
  secMove(i,d){const l=this.order();const j=i+d;if(!l[i]||j<0||j>=l.length)return;const [m]=l.splice(i,1);l.splice(j,0,m);this.setOrder(l);},
  secDup(i){const l=this.order();if(!l[i])return;l.splice(i+1,0,{...l[i]});this.setOrder(l);LUX.toast('كُرّر القسم — يظهر مرتين','ok');},
  secDel(i){const l=this.order();if(!l[i]||l[i].k==='services')return;const k=l[i].k;l.splice(i,1);this.setOrder(l);LUX.toast('حُذف قسم «'+ST_SECTIONS[k].n+'»','ok');},
  dragStart(e,i){this._drag=i;e.dataTransfer.effectAllowed='move';},
  dragOver(e){e.preventDefault();},
  drop(e,i){e.preventDefault();const f=this._drag;this._drag=null;if(f==null||f===i)return;
    const l=this.order();const [m]=l.splice(f,1);l.splice(i,0,m);this.setOrder(l);},

  /* ── شاشات التحرير الفرعية ── */
  open(k){this.sub=k;this.paint();},
  back(){this.sub=null;this.paint();},
  listAdd(k){const e=this.ex();const rows=[...(e[k]||[])];const f={};
    (ST_LISTS[k].f||[]).forEach(([key,,def])=>f[key]=def||'');
    rows.push(f);this.setEx(k,rows);},
  listSet(k,i,f,el){const e=this.ex();const rows=[...(e[k]||[])];if(!rows[i])return;
    rows[i]={...rows[i],[f]:el.value};this.setEx(k,rows);},
  listDel(k,i){const e=this.ex();const rows=[...(e[k]||[])];rows.splice(i,1);this.setEx(k,rows);},

  paint(){if((location.hash||'').replace('#','')==='page')SALON.go('page');},
};
window.STUDIO=STUDIO;

/* ═══════════ رسم الاستوديو ═══════════ */
function studioView(){
  const S=STUDIO, c=S.cfg();
  const inp='background:var(--bg);border:1px solid var(--line);border-radius:9px;padding:10px 12px;color:var(--white);font-family:inherit;font-size:12.5px;outline:none;width:100%';
  const done=ST_STEPS.filter(s=>{try{return s[2]({...c,...S.form,extras:S.ex()});}catch(e){return false;}}).length;
  const pct=Math.round(done/ST_STEPS.length*100);

  /* شريط علوي ثابت */
  const bar=`
  <div style="position:sticky;top:0;z-index:6;background:var(--surface2);border:1px solid ${S.dirty?'var(--gold-deep)':'var(--line)'};border-radius:13px;padding:11px 15px;margin-bottom:14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
    <div style="flex:1;min-width:170px">
      <div style="font-size:14px;color:var(--white);font-weight:600">${esc0(S.val('title')||'موقع الصالون')}</div>
      <div style="font-size:11px;color:${S.dirty?'var(--gold-light)':'var(--muted)'};margin-top:2px">
        ${S.dirty?'مسودة غير منشورة — '+Object.keys(S.form).length+' تغيير':'كل التغييرات منشورة ✓'}</div>
    </div>
    <div style="display:flex;gap:6px;background:var(--surface3);border-radius:9px;padding:3px">
      ${[['mobile','جوال'],['desktop','سطح المكتب']].map(([k,l])=>`
      <button onclick="STUDIO.device('${k}')" style="border:none;border-radius:7px;padding:6px 12px;font-family:inherit;font-size:11.5px;cursor:pointer;background:${S.device===k?'linear-gradient(120deg,#dbbd81,#9c8047)':'transparent'};color:${S.device===k?'#131217':'var(--cream)'}">${l}</button>`).join('')}
    </div>
    <button class="btn btn-ghost" style="padding:8px 13px;font-size:12px" onclick="STUDIO.undo()">↶ تراجع</button>
    <button class="btn btn-ghost" style="padding:8px 13px;font-size:12px" onclick="STUDIO.resetAll()">استعادة الافتراضي</button>
    <button class="btn btn-gold" style="padding:8px 18px" onclick="STUDIO.publish()">نشر التغييرات</button>
  </div>
  ${S.dirty?`<div style="position:sticky;top:66px;z-index:5;background:rgba(205,172,80,.12);border:1px solid var(--gold-deep);border-radius:11px;padding:9px 14px;margin-bottom:12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
    <span style="flex:1;font-size:12px;color:var(--gold-light)">لديك تغييرات غير منشورة — تظهر في المعاينة فقط</span>
    <button class="btn btn-ghost" style="padding:6px 12px;font-size:11.5px" onclick="STUDIO.discard()">تجاهل</button>
    <button class="btn btn-gold" style="padding:6px 14px;font-size:11.5px" onclick="STUDIO.publish()">نشر</button>
  </div>`:''}`;

  /* شاشة فرعية */
  if(S.sub)return bar+studioSub(S.sub,inp);

  return bar+`
  <div class="card" style="margin-bottom:14px">
    <div class="sec-label">أكمل موقعك <span class="ln"></span><span style="font-size:11px;color:var(--muted)">${done} من ${ST_STEPS.length}</span></div>
    <div style="height:8px;background:var(--surface3);border-radius:10px;overflow:hidden;margin-bottom:12px">
      <span style="display:block;height:100%;width:${pct}%;background:linear-gradient(90deg,#9c8047,#dbbd81);border-radius:10px"></span></div>
    <div style="display:flex;gap:7px;flex-wrap:wrap">
      ${ST_STEPS.map(s=>{let ok=false;try{ok=s[2]({...c,...S.form,extras:S.ex()});}catch(e){}
      return `<button onclick="${s[3]==='design'?'STUDIO.back()':`PAGE.showTab('${s[3]}')`}" style="font-family:inherit;font-size:11.5px;padding:7px 13px;border-radius:20px;cursor:pointer;border:1px solid ${ok?'rgba(111,168,106,.45)':'var(--line)'};background:${ok?'rgba(111,168,106,.12)':'var(--surface3)'};color:${ok?'#9fce99':'var(--cream)'}">${ok?'✓':'○'} ${s[1]}</button>`;}).join('')}
    </div>
  </div>

  <div class="card" style="margin-bottom:14px">
    <div class="sec-label">قوالب جاهزة <span class="ln"></span><span style="font-size:11px;color:var(--muted)">ضغطة واحدة تضبط اللون والخط والقالب والاستدارة</span></div>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px">
      ${ST_TEMPLATES.map(t=>{const cu=t.set.themeCustom;
      return `<button class="st-tpl" data-tpl="${t.id}" onclick="STUDIO.template('${t.id}')" style="background:${cu.bg};border:2px solid var(--line);border-radius:12px;padding:12px;text-align:right;cursor:pointer;font-family:inherit">
        <span style="display:flex;gap:5px;margin-bottom:8px"><i style="width:15px;height:15px;border-radius:50%;background:${cu.ac}"></i><i style="width:15px;height:15px;border-radius:50%;background:${cu.card};border:1px solid rgba(128,128,128,.35)"></i></span>
        <span style="display:block;font-size:12.5px;font-weight:700;color:${cu.tx}">${t.n}</span>
        <span style="display:block;font-size:10px;color:${cu.tx};opacity:.55;margin-top:3px">${t.d}</span></button>`;}).join('')}
    </div>
  </div>

  <div class="card" style="margin-bottom:14px">
    <div class="sec-label">قالب الصفحة <span class="ln"></span><span style="font-size:11px;color:var(--muted)">يغيّر الاستدارة والظل والحدود فعلياً</span></div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin-bottom:14px">
      ${ST_THEMES.map(([k,n,d])=>{const on=(S.val('themeId')||'modern')===k;
      return `<button class="st-theme" data-theme="${k}" onclick="STUDIO.theme('${k}')" style="border:1px solid ${on?'var(--gold-deep)':'var(--line)'};background:${on?'rgba(219,189,129,.1)':'var(--surface2)'};border-radius:11px;padding:11px 9px;cursor:pointer;font-family:inherit;text-align:center">
        <span style="display:block;font-size:12.5px;color:${on?'var(--gold-light)':'var(--white)'};font-weight:600">${n}</span>
        <span style="display:block;font-size:10px;color:var(--muted);margin-top:4px;line-height:1.6">${d}</span></button>`;}).join('')}
    </div>
    <div style="display:flex;align-items:center;gap:14px;border:1px solid var(--line);border-radius:11px;padding:10px 14px">
      <span style="font-size:12px;color:var(--white);white-space:nowrap">استدارة الأزرار</span>
      <input id="stRad" type="range" min="0" max="28" value="${(S.ex().btnRadius!=null?S.ex().btnRadius:16)}" oninput="STUDIO.setEx('btnRadius',+this.value)" style="flex:1;accent-color:var(--gold-light)"/>
      <span class="num" style="font-size:13px;color:var(--gold-light);width:44px;text-align:left" dir="ltr">${(S.ex().btnRadius!=null?S.ex().btnRadius:16)}px</span>
    </div>
  </div>

  <div class="card">
    <div class="sec-label">أقسام الصفحة <span class="ln"></span><span style="font-size:11px;color:var(--muted)">اسحبي للترتيب · أظهري وأخفي · كرّري · احذفي</span></div>
    ${S.order().map((x,i)=>{const m=ST_SECTIONS[x.k];const lock=x.k==='services';
    const ab='width:27px;height:27px;border-radius:8px;border:1px solid var(--line);background:var(--surface2);color:var(--cream);cursor:pointer;font-size:11px;line-height:1;display:inline-flex;align-items:center;justify-content:center';
    const hasEd=!!ST_LISTS[x.k]||['countdown','divider','video','text','booking_cta'].includes(x.k);
    return `
    <div class="sec-row" draggable="true" ondragstart="STUDIO.dragStart(event,${i})" ondragover="STUDIO.dragOver(event)" ondrop="STUDIO.drop(event,${i})"
      style="display:flex;align-items:center;gap:10px;border:1px solid ${x.on?'var(--gold-deep)':'var(--line)'};border-radius:11px;padding:10px 13px;margin-bottom:8px;background:${x.on?'linear-gradient(120deg,rgba(219,189,129,.07),transparent)':'var(--surface)'};cursor:grab">
      <span style="color:var(--muted);font-size:15px;letter-spacing:1px" title="اسحبي للترتيب">⠿</span>
      <div style="flex:1;min-width:120px">
        <div style="font-size:13.5px;color:var(--white);font-weight:600">${m.n}${lock?' <span class="badge soft" style="font-size:9.5px">ثابت</span>':''}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">${m.d}</div>
      </div>
      ${hasEd?`<button class="sec-ed btn btn-ghost" onclick="STUDIO.open('${x.k}')" style="padding:6px 12px;font-size:11.5px;white-space:nowrap">تحرير المحتوى</button>`:''}
      <button class="sec-up" onclick="STUDIO.secMove(${i},-1)" title="لأعلى" style="${ab}">▲</button>
      <button class="sec-dn" onclick="STUDIO.secMove(${i},1)" title="لأسفل" style="${ab}">▼</button>
      <button class="sec-dup" onclick="STUDIO.secDup(${i})" title="تكرار القسم" style="${ab}">⧉</button>
      ${lock?'':`<button class="sec-del" onclick="STUDIO.secDel(${i})" title="حذف القسم" style="${ab};color:#e29aa6">✕</button>`}
      ${lock?'<span class="badge gold" style="font-size:10px">دائم</span>'
        :`<button class="sec-tgl btn btn-ghost" onclick="STUDIO.secToggle(${i})" style="padding:6px 13px;font-size:11.5px;white-space:nowrap">${x.on?'إخفاء':'إظهار'}</button>`}
    </div>`;}).join('')}
  </div>`;
}

/* شاشة تحرير فرعية واحدة لكل قسم — بدل صفحة عملاقة */
function studioSub(k,inp){
  const S=STUDIO,e=S.ex();
  const head=`<button class="btn btn-ghost" style="padding:7px 14px;font-size:12px;margin-bottom:12px" onclick="STUDIO.back()">← رجوع للأقسام</button>`;
  if(ST_LISTS[k]){
    const L=ST_LISTS[k],rows=e[k]||[];
    return head+`<div class="card">
      <div class="sec-label">${L.n} <span class="ln"></span><span style="font-size:11px;color:var(--muted)">${rows.length} عنصر</span></div>
      ${rows.map((r,i)=>`
      <div class="st-row" style="border:1px solid var(--line);border-radius:11px;padding:11px;margin-bottom:9px;display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
        ${L.f.map(([f,lb])=>`<div style="flex:1;min-width:110px"><label style="display:block;font-size:11px;color:var(--gold-pale);margin-bottom:5px">${lb}</label>
          <input value="${String(r[f]==null?'':r[f]).replace(/"/g,'&quot;')}" onchange="STUDIO.listSet('${k}',${i},'${f}',this)" style="${inp}"/></div>`).join('')}
        <button class="btn btn-ghost st-del" onclick="STUDIO.listDel('${k}',${i})" style="padding:9px 12px;color:#e29aa6">حذف</button>
      </div>`).join('')||'<div style="font-size:12.5px;color:var(--muted);margin-bottom:10px">لا عناصر بعد.</div>'}
      <button class="btn btn-ghost st-add" style="width:100%" onclick="STUDIO.listAdd('${k}')">+ إضافة عنصر</button>
    </div>`;
  }
  const F={
    countdown:[['ends','تاريخ انتهاء العرض','date'],['t','عنوان العدّاد','text']],
    divider:[['t','جملة الفاصل','text']],
    video:[['url','رابط الفيديو (يوتيوب أو ملف)','text'],['t','عنوان القسم','text']],
    text:[['textTitle','العنوان','text'],['textBody','النص','area']],
    booking_cta:[['ctaTitle','العنوان','text'],['ctaText','السطر الثاني','text']],
  }[k]||[];
  const obj=['countdown','divider','video'].includes(k);
  const cur=obj?(e[k]||{}):e;
  return head+`<div class="card">
    <div class="sec-label">${ST_SECTIONS[k].n} <span class="ln"></span><span style="font-size:11px;color:var(--muted)">${ST_SECTIONS[k].d}</span></div>
    ${F.map(([f,lb,t])=>`<div style="margin-bottom:11px"><label style="display:block;font-size:11.5px;color:var(--gold-pale);margin-bottom:6px">${lb}</label>
      ${t==='area'
        ?`<textarea rows="4" onchange="STUDIO.subSet('${k}',${obj},'${f}',this)" style="${inp};line-height:2;resize:vertical">${String(cur[f]||'')}</textarea>`
        :`<input type="${t}" value="${String(cur[f]==null?'':cur[f]).replace(/"/g,'&quot;')}" onchange="STUDIO.subSet('${k}',${obj},'${f}',this)" style="${inp}"/>`}</div>`).join('')}
  </div>`;
}
STUDIO.subSet=function(k,obj,f,el){
  if(obj){const cur={...(this.ex()[k]||{})};cur[f]=el.value;this.setEx(k,cur);}
  else this.setEx(f,el.value);
};
const esc0=s=>String(s==null?'':s).replace(/[&<>"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));

/* إعادة الإرسال فور إعلان الإطار جاهزيته — يحل سباق التحميل */
window.addEventListener('message',e=>{
  if(e.origin!==window.location.origin)return;
  if(e.data&&e.data.type==='salon-preview-ready')STUDIO.postNow();
});
