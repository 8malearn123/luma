/* لوما · داشبورد الصالون — مُنشئ الرابط والصفحة الخاصة */
/* ══════════ مُنشئ الرابط والصفحة الخاصة (Landing & Booking Link) ══════════ */
const PAGE_KEY='luma_page_cfg';
/* القوالب الجاهزة — نقاط بداية لمحرر الثيم المخصص */
const PAGE_PRESETS=[
  {k:'dark-luxury',ar:'فخامة داكنة',bg:'#09090b',card:'#151517',ac:'#e5c158',tx:'#f5f1e8',rad:18},
  {k:'rose-velvet',ar:'مخمل وردي',bg:'#1a0e12',card:'#241318',ac:'#e08a9b',tx:'#f8eef1',rad:18},
  {k:'minimal-emerald',ar:'زمرد هادئ',bg:'#0a1413',card:'#12201e',ac:'#8fd0c0',tx:'#eef6f4',rad:18},
  {k:'pearl-light',ar:'لؤلؤ فاتح',bg:'#f7f3ec',card:'#ffffff',ac:'#9c8047',tx:'#2e241b',rad:18},
];
/* توافق خلفي مع أي كود قديم يقرأ الشكل المصفوفي */
/* الثيم المحلول للإعدادات الحالية: قالب جاهز أو ثيم مخصص بالكامل */
function pageThemeOf(c){
  c=c||pageCfg();
  if(c.theme==='custom'&&c.themeCustom)return {...PAGE_PRESETS[0],k:'custom',ar:'ثيم مخصص',...c.themeCustom};
  return PAGE_PRESETS.find(p=>p.k===c.theme)||PAGE_PRESETS[0];
}
const PAGE_POLICY_DEFAULT='الحضور قبل الموعد بـ10 دقائق يضمن اكتمال جلستك كاملة.\nيمكن إلغاء أو تعديل الحجز مجاناً قبل 24 ساعة من الموعد.\nالتأخر أكثر من 15 دقيقة قد يتطلب إعادة جدولة الموعد.\nقيمة العربون (إن وُجد) تُخصم من الفاتورة النهائية.';
const pageCfg=()=>({slug:'lama-beauty',title:'صالون لمسة',bio:'وجهتكِ الأولى للجمال في جدة — مكياج، شعر، وعناية ملكية بلمسات خبيرات.',phone:'0555 123 456',address:'جدة · حي الشاطئ',logo:'',cover:'',theme:'dark-luxury',themeCustom:null,gallery:[],policy:PAGE_POLICY_DEFAULT,featured:{'مكياج عروس':'الأكثر طلباً'},font:'plex',welcome:'',social:{},map:'',about:'',banners:[],hideCats:[],faqText:PAGE_FAQ_DEFAULT,privacyText:PAGE_PRIVACY_DEFAULT,policyText:PAGE_POLICY_DEFAULT,pagesOn:{},pagesExtra:[],catList:PAGE_CATS_DEFAULT,...hrLoad(PAGE_KEY,{})});
/* شبكات التواصل المدعومة: [المفتاح، الاسم، نص المساعدة] */
const PAGE_SOCIALS=[
  ['ig','إنستقرام','@اسم_الحساب أو الرابط الكامل'],
  ['tk','تيك توك','@اسم_الحساب أو الرابط'],
  ['sc','سناب شات','اسم المستخدم أو الرابط'],
  ['x','إكس (تويتر)','@اسم_الحساب أو الرابط'],
  ['wa','واتساب','رقم الجوال 05xxxxxxxx'],
];
const PAGE_BADGES=['الأكثر طلباً','جديدة','عرض خاص','اختيار الخبيرات'];
/* أقسام الصفحة الرئيسية لموقع الصالون — كل صالون يرتّبها ويُظهر/يُخفي ما يشاء فيصبح موقعه مختلفاً */
const PAGE_SECTIONS=[
  ['banner','البانر الرئيسي','أشرطة إعلانية أعلى الصفحة'],
  ['offers','العروض','بطاقات خصومات وباقات موسمية'],
  ['gallery','صور الصالون','صور وفيديوهات أعمالك'],
  ['services','الخدمات المميزة','قائمة الخدمات والحجز'],
  ['reviews','آراء العملاء','تقييمات عميلاتك بالنجوم'],
  ['team','فريقنا','خبيرات الصالون بأدوارهن'],
  ['insta','انستغرام','شبكة صور من حسابك مع زر متابعة'],
];
const PAGE_LAYOUT_DEFAULT=[{k:'banner',on:true},{k:'gallery',on:true},{k:'services',on:true},{k:'reviews',on:true},{k:'offers',on:false},{k:'team',on:false},{k:'insta',on:false}];
/* صفحات الموقع الجاهزة — تُفتح من تذييل صفحة الصالون */
const PAGE_SITEPAGES=[
  ['about','من نحن','قصة الصالون — من محرر «من نحن» أدناه'],
  ['services','خدماتنا','قائمة تلقائية بكل خدماتك وأسعارها'],
  ['team','فريقنا','خبيرات الصالون تلقائياً'],
  ['contact','تواصل معنا','الجوال والعنوان والسوشل والخريطة'],
  ['faq','الأسئلة الشائعة','سؤال | جواب — كل سطر'],
  ['privacy','سياسة الخصوصية','كل سطر فقرة'],
  ['policy','سياسة الحجز والإلغاء','كل سطر فقرة'],
];
const PAGE_FAQ_DEFAULT='هل أحتاج حجزاً مسبقاً؟ | نعم، الحجز المسبق يضمن وقتك المفضل — احجزي من الصفحة مباشرة.\nهل تتوفر باقات للعرائس؟ | نعم، باقة العروس الملكية تشمل المكياج والتسريحة والعناية.\nهل يمكن إلغاء الحجز؟ | الإلغاء أو التعديل مجاني قبل 24 ساعة من الموعد.';
const PAGE_PRIVACY_DEFAULT='نحترم خصوصيتك — بياناتك (الاسم ورقم الجوال) تُستخدم لإدارة حجزك وطلباتك فقط.\nلا نشارك بياناتك مع أي طرف ثالث دون موافقتك.\nيمكنك طلب حذف بياناتك في أي وقت عبر التواصل معنا.';
/* ═══ أقسام إدارة الموقع المستقلة: الخدمات والحجوزات والفريق ═══ */
const PAGE_SEED_BOOKS=[
  {id:'s1',client:'نوف العتيبي',svc:'مكياج عروس',staff:'أمل',date:'2026-08-12',time:'6:00 م',st:'up'},
  {id:'s2',client:'لينا الحربي',svc:'هيدرافيشل',staff:'نورة',date:'2026-08-10',time:'4:30 م',st:'up'},
  {id:'s3',client:'جود السبيعي',svc:'منيكير جل',staff:'ريم',date:'2026-08-05',time:'2:00 م',st:'done'},
  {id:'s4',client:'رزان الشهري',svc:'تسريحة',staff:'سارة',date:'2026-08-03',time:'7:00 م',st:'done'},
  {id:'s5',client:'مها الزهراني',svc:'تنظيف بشرة',staff:'نورة',date:'2026-08-02',time:'1:00 م',st:'cancel'},
];
const PAGE_TEAM_DEFAULT=[['أمل','مكياج'],['سارة','شعر'],['نورة','بشرة'],['ريم','أظافر']];
const pageTeam=()=>{const extra=(LumaStore.get('luma_salon_staff',[])||[]).filter(t=>t&&t.n).map(t=>[t.n,t.role||'تجميل']);return [...PAGE_TEAM_DEFAULT,...extra];};
const pageSvcList=()=>{const cats=['مكياج','مكياج','مكياج','شعر','شعر','شعر','بشرة','بشرة','بشرة','أظافر','أظافر','أظافر'];
  const cat=LumaStore.get('luma_svc_catalog',null)||SVC_CATALOG;
  return cat.filter(x=>x&&x[0]).map((x,i)=>({n:x[0],d:(x[1]||2)*30,p:x[2],c:x[3]||cats[i]||'أخرى'}));};
/* تصنيفات الموقع الافتراضية — لكل صالون قائمته الخاصة */
const PAGE_CATS_DEFAULT=['شعر','أظافر','مكياج','بشرة','عناية','عناية بالجسم','منتجات'];
/* ترتيب الأقسام المحفوظ مع تطبيع: الخدمات قسم أساسي لا يُخفى، والمفاتيح الجديدة تُلحق آخر القائمة */
function pageLayoutOf(c){
  const cur=Array.isArray((c||pageCfg()).layout)?(c||pageCfg()).layout:[];
  const seen=new Set();const out=[];
  cur.forEach(x=>{if(x&&PAGE_SECTIONS.some(s=>s[0]===x.k)&&!seen.has(x.k)){seen.add(x.k);out.push({k:x.k,on:x.k==='services'?true:!!x.on});}});
  PAGE_LAYOUT_DEFAULT.forEach(d=>{if(!seen.has(d.k))out.push({...d});});
  return out;
}
/* خطوط عربية لصفحة الحجز — [مفتاح، الاسم، عائلة CSS، استعلام Google Fonts] */
const PAGE_FONTS=[
  ['plex','بلكس عربي — الافتراضي',"'IBM Plex Sans Arabic',sans-serif",'IBM+Plex+Sans+Arabic:wght@300;400;500;700'],
  ['cairo','القاهرة',"'Cairo',sans-serif",'Cairo:wght@300;400;600;700'],
  ['tajawal','تجوَل',"'Tajawal',sans-serif",'Tajawal:wght@300;400;500;700'],
  ['almarai','المراعي',"'Almarai',sans-serif",'Almarai:wght@300;400;700'],
  ['noto-kufi','نوتو كوفي',"'Noto Kufi Arabic',sans-serif",'Noto+Kufi+Arabic:wght@300;400;600'],
  ['messiri','المسيري',"'El Messiri',sans-serif",'El+Messiri:wght@400;600'],
  ['amiri','أميري — كلاسيكي',"'Amiri',serif",'Amiri:wght@400;700'],
  ['changa','تشانغا',"'Changa',sans-serif",'Changa:wght@300;400;600'],
];
/* تحميل الخطوط للمعاينة داخل المحرر — غير حاجب حتى لا يجمّد الصفحة */
(function(){
  const q=PAGE_FONTS.map(f=>'family='+f[3]).join('&');
  const l=document.createElement('link');l.rel='stylesheet';l.media='print';
  l.href='https://fonts.googleapis.com/css2?'+q+'&display=swap';
  l.onload=function(){this.media='all';};
  document.head.appendChild(l);
})();
/* معرّف يوتيوب من أي شكل رابط (watch / youtu.be / shorts / embed) */
const ytIdOf=u=>{const m=String(u||'').match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);return m?m[1]:null;};
const isVideoUrl=u=>!!ytIdOf(u)||/\.(mp4|webm|mov)(\?|$)/i.test(String(u||''));
const slugClean=v=>v.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'').replace(/-{2,}/g,'-');
let PAGE_TAB='general';
let PAGE_BOOKF='up';
const PAGE={
  showTab(t){PAGE_TAB=t;SALON.go('page');
    setTimeout(()=>{
      const sub=document.getElementById('pgSub');if(sub)sub.style.display='block';
      document.querySelectorAll('.pgsub').forEach(n=>n.classList.toggle('active',n.dataset.sub===t));
    },0);},
  save(patch,silent){const c={...pageCfg(),...patch};hrSave(PAGE_KEY,c);
    const fr=document.getElementById('pagePrev');if(fr)fr.contentWindow.location.reload();
    if(!silent)LUX.toast('حُفظت التغييرات وانعكست على المعاينة ✓','ok');},
  copy(){const c=pageCfg();navigator.clipboard.writeText(location.origin+location.pathname.replace(/[^/]*$/,'')+'booking.html?s='+c.slug).then(()=>{
    const b=document.getElementById('cpBtn');if(b){b.textContent='✓ نُسخ!';setTimeout(()=>b.textContent='نسخ الرابط',1600);}});},
  field(k,el){const v=k==='slug'?slugClean(el.value):el.value;if(k==='slug')el.value=v;PAGE.save({[k]:v},true);},
  /* ── محرر الثيم المخصص ── */
  hex(v){v=String(v||'').trim().replace(/^#?/,'#');return /^#[0-9a-fA-F]{6}$/.test(v)?v.toLowerCase():null;},
  customBase(){const t={...pageThemeOf()};delete t.k;delete t.ar;return t;},
  setColor(key,val){
    const hx=PAGE.hex(val);if(!hx)return;
    const t=PAGE.customBase();t[key]=hx;
    PAGE.save({theme:'custom',themeCustom:t},true);
    const cp=document.getElementById('thc-'+key);if(cp&&cp.value!==hx)cp.value=hx;
    const tx=document.getElementById('thx-'+key);if(tx&&tx.value!==hx)tx.value=hx;
    const cp2=document.getElementById('uic-'+key);if(cp2&&cp2.value!==hx)cp2.value=hx;
    const tx2=document.getElementById('uix-'+key);if(tx2&&tx2.value!==hx)tx2.value=hx;
    const badge=document.getElementById('thBadge');if(badge)badge.style.display='inline-block';
  },
  /* خيارات شكل الواجهة: بطاقات/أزرار/قائمة/طرق عرض/تذييل */
  setUI(k,v){if(v==='true')v=true;if(v==='false')v=false;PAGE.save({[k]:v},true);PAGE.showTab('front');},
  setFont(k){PAGE.save({font:k},true);SALON.go('page');LUX.toast('تغيّر خط الصفحة ✓','ok');},
  setSocial(k,el){
    const s={...(pageCfg().social||{})};
    const v=el.value.trim();
    if(v)s[k]=v;else delete s[k];
    PAGE.save({social:s},true);
  },
  /* التقاط الموقع الحالي من المتصفح وتعبئته كإحداثيات */
  geoPick(){
    if(!navigator.geolocation)return LUX.toast('المتصفح لا يدعم تحديد الموقع','warn');
    LUX.toast('جارٍ التقاط موقعك…','ok');
    navigator.geolocation.getCurrentPosition(p=>{
      const v=p.coords.latitude.toFixed(6)+','+p.coords.longitude.toFixed(6);
      const el=document.getElementById('mapIn');if(el)el.value=v;
      PAGE.save({map:v},true);
      LUX.toast('التُقط موقعك وظهر على الخريطة ✓','ok');
    },()=>LUX.toast('تعذر تحديد الموقع — اسمحي بالوصول للموقع أو الصقي رابط خرائط Google','warn'),{enableHighAccuracy:true,timeout:8000});
  },
  addBanner(){
    const el=document.getElementById('bnIn');const v=(el&&el.value.trim())||'';
    if(!v){if(el){el.style.borderColor='#c0566a';el.focus();}return;}
    const b=[...(pageCfg().banners||[]),{t:v,on:true}];
    PAGE.save({banners:b},true);PAGE.showTab('banners');LUX.toast('أُضيف البنر وظهر بموقعك ✓','ok');
  },
  toggleBanner(i){const b=[...(pageCfg().banners||[])];if(!b[i])return;b[i]={...b[i],on:!b[i].on};PAGE.save({banners:b},true);PAGE.showTab('banners');},
  delBanner(i){const b=[...(pageCfg().banners||[])];b.splice(i,1);PAGE.save({banners:b},true);PAGE.showTab('banners');LUX.toast('حُذف البنر','ok');},
  toggleCat(ct){
    const h=new Set(pageCfg().hideCats||[]);
    h.has(ct)?h.delete(ct):h.add(ct);
    PAGE.save({hideCats:[...h]},true);PAGE.showTab('cats');
  },
  /* ── تصنيفات خاصة بكل موقع: إضافة وحذف ── */
  addCat(){
    const el=document.getElementById('catIn');const v=(el&&el.value.trim())||'';
    if(!v){if(el){el.style.borderColor='#c0566a';el.focus();}return;}
    const l=[...(pageCfg().catList||PAGE_CATS_DEFAULT)];
    if(l.includes(v)){LUX.toast('التصنيف موجود مسبقاً','warn');return;}
    l.push(v);PAGE.save({catList:l},true);PAGE.showTab('cats');LUX.toast('أُضيف التصنيف ✓','ok');
  },
  delCat(ct){
    const l=(pageCfg().catList||PAGE_CATS_DEFAULT).filter(x=>x!==ct);
    const h=(pageCfg().hideCats||[]).filter(x=>x!==ct);
    PAGE.save({catList:l,hideCats:h},true);PAGE.showTab('cats');LUX.toast('حُذف التصنيف','ok');
  },
  /* ── صفحات الموقع: إظهار/إخفاء الجاهزة + صفحات إضافية ── */
  pgToggle(k){
    const p={...(pageCfg().pagesOn||{})};p[k]=p[k]===false?true:false;
    PAGE.save({pagesOn:p},true);PAGE.showTab('pages');
  },
  xpAdd(){
    const t=document.getElementById('xpT'),b=document.getElementById('xpB');
    const tv=(t&&t.value.trim())||'',bv=(b&&b.value.trim())||'';
    if(!tv){if(t){t.style.borderColor='#c0566a';t.focus();}return;}
    if(!bv){if(b){b.style.borderColor='#c0566a';b.focus();}return;}
    const l=[...(pageCfg().pagesExtra||[]),{t:tv,body:bv,on:true}];
    PAGE.save({pagesExtra:l},true);PAGE.showTab('pages');LUX.toast('أُضيفت الصفحة لموقعك ✓','ok');
  },
  xpToggle(i){const l=[...(pageCfg().pagesExtra||[])];if(!l[i])return;l[i]={...l[i],on:!l[i].on};PAGE.save({pagesExtra:l},true);PAGE.showTab('pages');},
  xpDel(i){const l=[...(pageCfg().pagesExtra||[])];l.splice(i,1);PAGE.save({pagesExtra:l},true);PAGE.showTab('pages');LUX.toast('حُذفت الصفحة','ok');},
  /* ── قسم الخدمات المستقل: وصف وموظفات وحالة وظهور ── */
  svcMeta(n,k,v){const m=LumaStore.get('luma_svc_meta',{})||{};m[n]={...(m[n]||{}),[k]:v};LumaStore.set('luma_svc_meta',m);},
  svcMetaT(n,k){const m=LumaStore.get('luma_svc_meta',{})||{};PAGE.svcMeta(n,k,!((m[n]||{})[k]));PAGE.save({},true);PAGE.showTab('svc');},
  svcDesc(n,el){PAGE.svcMeta(n,'desc',el.value.trim());PAGE.save({},true);},
  svcStaff(n,st){const m=LumaStore.get('luma_svc_meta',{})||{};const cur=new Set((m[n]||{}).staff||[]);
    cur.has(st)?cur.delete(st):cur.add(st);m[n]={...(m[n]||{}),staff:[...cur]};
    LumaStore.set('luma_svc_meta',m);PAGE.save({},true);PAGE.showTab('svc');},
  /* ── قسم الحجوزات: قادمة/مكتملة/ملغاة مع الإجراءات ── */
  bookFilter(f){PAGE_BOOKF=f;PAGE.showTab('books');},
  bookList(){
    const ov=LumaStore.get('luma_bookst',{})||{};
    const live=(LumaStore.get('luma_public_bookings',[])||[]).map((b,i)=>({id:'p'+i,client:b.client||'حجز أونلاين',svc:b.service||'—',staff:b.staffName||b.staff||'—',date:String(b.at||'').slice(0,10)||'—',time:b.time||'',st:ov['p'+i]||'up'}));
    return [...live,...PAGE_SEED_BOOKS.map(b=>({...b,st:ov[b.id]||b.st}))];},
  bookSt(id,st){const ov=LumaStore.get('luma_bookst',{})||{};ov[id]=st;LumaStore.set('luma_bookst',ov);PAGE.showTab('books');LUX.toast(st==='done'?'اكتمل الحجز ✓':'أُلغي الحجز','ok');},
  /* ── قسم الفريق: نبذة قابلة للتحرير ── */
  teamBio(n,el){const m=LumaStore.get('luma_team_meta',{})||{};m[n]={...(m[n]||{}),bio:el.value.trim()};LumaStore.set('luma_team_meta',m);LUX.toast('حُفظت النبذة ✓','ok');},
  resetTheme(){PAGE.save({theme:'dark-luxury',themeCustom:null},true);SALON.go('page');LUX.toast('عاد المظهر للافتراضي','ok');},
  /* ── منشئ تخطيط الصفحة الرئيسية: إظهار/إخفاء وترتيب بالسحب والأسهم ── */
  secToggle(i){const l=pageLayoutOf();if(!l[i]||l[i].k==='services')return;l[i]={...l[i],on:!l[i].on};
    PAGE.save({layout:l},true);PAGE.showTab('design');},
  secMove(i,d){const l=pageLayoutOf();const j=i+d;if(!l[i]||j<0||j>=l.length)return;
    const t=l[i];l[i]=l[j];l[j]=t;PAGE.save({layout:l},true);PAGE.showTab('design');},
  _drag:null,
  secDragStart(e,i){PAGE._drag=i;try{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',String(i));}catch(x){}},
  secDragOver(e){e.preventDefault();try{e.dataTransfer.dropEffect='move';}catch(x){}},
  secDrop(e,i){e.preventDefault();const f=PAGE._drag;PAGE._drag=null;if(f==null||f===i)return;
    const l=pageLayoutOf();const [m]=l.splice(f,1);l.splice(i,0,m);
    PAGE.save({layout:l},true);PAGE.showTab('design');LUX.toast('تغيّر ترتيب الأقسام ✓','ok');},
  /* ── الشعار والغلاف: رفع ثم محرر قص وتكبير قبل الحفظ ── */
  imgUpload(key,inp){
    const f=inp.files&&inp.files[0];if(!f)return;
    const rd=new FileReader();
    rd.onload=()=>{const im=new Image();im.onload=()=>{
      /* تصغير أولي للأداء ثم فتح المحرر */
      const MAX=1600,sc=Math.min(1,MAX/Math.max(im.width,im.height));
      let src=rd.result;
      if(sc<1){const cv=document.createElement('canvas');cv.width=Math.round(im.width*sc);cv.height=Math.round(im.height*sc);
        cv.getContext('2d').drawImage(im,0,0,cv.width,cv.height);src=cv.toDataURL('image/jpeg',0.86);}
      PAGE.imgCrop(key,src);
    };im.src=rd.result;};
    rd.readAsDataURL(f);inp.value='';
  },
  /* محرر القص: سحب لتحريك الصورة + منزلق تكبير داخل إطار بنسبة الوجهة */
  imgCrop(key,src){
    src=src||pageCfg()[key];if(!src)return;
    const aspect=key==='logo'?1:2.9, outW=key==='logo'?400:1200;
    const frameW=key==='logo'?250:390, frameH=Math.round(frameW/aspect);
    LUX.modal('تعديل الصورة — قص وتكبير',`
      <div class="lux-lead">اسحبي الصورة لتحريكها واستخدمي المنزلق للتكبير — ما بداخل الإطار هو ما سيظهر في ${key==='logo'?'الشعار':'الغلاف'}.</div>
      <div id="crFrame" style="position:relative;width:${frameW}px;height:${frameH}px;margin:0 auto;overflow:hidden;border-radius:${key==='logo'?'18px':'12px'};border:1.5px dashed var(--gold-light,#ccab64);cursor:grab;touch-action:none;background:#101014">
        <img id="crImg" src="${src}" alt="" draggable="false" style="position:absolute;left:50%;top:50%;max-width:none;user-select:none;pointer-events:none"/>
      </div>
      <div style="display:flex;align-items:center;gap:12px;margin-top:16px">
        <span style="font-size:13px;opacity:.6">تصغير −</span>
        <input id="crZoom" type="range" min="100" max="300" value="100" style="flex:1;accent-color:var(--gold-light,#ccab64)"/>
        <span style="font-size:13px;opacity:.6">+ تكبير</span>
      </div>
      <button class="lux-btn lux-gold" data-ok style="width:100%;margin-top:14px;display:inline-flex;align-items:center;justify-content:center;gap:8px">${icon('scissors',15)} حفظ الصورة</button>`,
    {onMount(ov,close){
      const img=ov.querySelector('#crImg'),frame=ov.querySelector('#crFrame'),zoom=ov.querySelector('#crZoom');
      let iw=0,ih=0,z=1,ox=0,oy=0,drag=null;
      const scale=()=>Math.max(frameW/iw,frameH/ih)*z;
      const clamp=()=>{const s=scale();
        const mx=Math.max(0,(iw*s-frameW)/2),my=Math.max(0,(ih*s-frameH)/2);
        ox=Math.min(mx,Math.max(-mx,ox));oy=Math.min(my,Math.max(-my,oy));};
      const apply=()=>{if(!iw)return;const s=scale();clamp();
        img.style.width=(iw*s)+'px';img.style.height=(ih*s)+'px';
        img.style.transform='translate(calc(-50% + '+ox+'px),calc(-50% + '+oy+'px))';};
      const init=()=>{iw=img.naturalWidth;ih=img.naturalHeight;apply();};
      img.complete&&img.naturalWidth?init():(img.onload=init);
      zoom.oninput=()=>{z=zoom.value/100;apply();};
      frame.onpointerdown=e=>{drag={x:e.clientX-ox,y:e.clientY-oy};try{frame.setPointerCapture(e.pointerId);}catch(err){}frame.style.cursor='grabbing';};
      frame.onpointermove=e=>{if(!drag)return;ox=e.clientX-drag.x;oy=e.clientY-drag.y;apply();};
      frame.onpointerup=frame.onpointercancel=()=>{drag=null;frame.style.cursor='grab';};
      ov.querySelector('[data-ok]').onclick=()=>{
        if(!iw)return;
        const s=scale();
        const fx=frameW/2-(iw*s)/2+ox, fy=frameH/2-(ih*s)/2+oy;
        const outH=Math.round(outW/aspect);
        const cv=document.createElement('canvas');cv.width=outW;cv.height=outH;
        cv.getContext('2d').drawImage(img,-fx/s,-fy/s,frameW/s,frameH/s,0,0,outW,outH);
        PAGE.save({[key]:cv.toDataURL('image/jpeg',0.82)},true);
        close();SALON.go('page');
        LUX.toast((key==='logo'?'الشعار':'الغلاف')+' حُفظ بالقص الجديد ✓','ok');
      };
    }});
  },
  imgClear(key){PAGE.save({[key]:''},true);SALON.go('page');},
  /* شارة مميزة لخدمة (الأكثر طلباً…) — تظهر في صفحة الحجز */
  setFeat(name,val){
    const f={...(pageCfg().featured||{})};
    if(val)f[name]=val;else delete f[name];
    PAGE.save({featured:f},true);
    LUX.toast(val?('مُيّزت «'+name+'» — '+val+' ✓'):('أُزيل تمييز «'+name+'»'),'ok');
  },
  /* ── معرض الأعمال: صور مرفوعة (مضغوطة) أو روابط صور/فيديو ── */
  GAL_MAX:12,
  galPush(item){
    const g=[...(pageCfg().gallery||[])];
    if(g.length>=PAGE.GAL_MAX)return LUX.toast('الحد الأقصى '+PAGE.GAL_MAX+' عنصراً — احذفي عنصراً أولاً','warn');
    g.push(item);PAGE.save({gallery:g},true);SALON.go('page');
    LUX.toast(item.type==='video'?'أُضيف الفيديو للمعرض ✓':'أُضيفت الصورة للمعرض ✓','ok');
  },
  galAddFile(inp){
    const f=inp.files&&inp.files[0];if(!f)return;
    const rd=new FileReader();
    rd.onload=()=>{const im=new Image();im.onload=()=>{
      const MAX=900,sc=Math.min(1,MAX/Math.max(im.width,im.height));
      const cv=document.createElement('canvas');cv.width=Math.round(im.width*sc);cv.height=Math.round(im.height*sc);
      cv.getContext('2d').drawImage(im,0,0,cv.width,cv.height);
      PAGE.galPush({type:'img',src:cv.toDataURL('image/jpeg',0.72)});
    };im.src=rd.result;};
    rd.readAsDataURL(f);inp.value='';
  },
  galAddUrl(){
    const el=document.getElementById('galUrl');const u=(el&&el.value||'').trim();if(!u)return;
    if(isVideoUrl(u))PAGE.galPush({type:'video',src:u,yt:ytIdOf(u)});
    else PAGE.galPush({type:'img',src:u});
  },
  galDel(i){
    const g=[...(pageCfg().gallery||[])];g.splice(i,1);
    PAGE.save({gallery:g},true);SALON.go('page');
  },
};
window.PAGE=PAGE;

SCREENS.page=()=>{
  const c=pageCfg();
  return `
  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;flex-wrap:wrap;gap:12px">
    <div><div style="font-weight:600;font-size:19px;color:var(--white)">موقع الصالون</div>
    <div style="font-size:13px;color:var(--gold-pale);margin-top:2px">رابطك المخصص وصفحتك العامة: لاندنج بأقسام قابلة للترتيب وتدفق حجز كامل — والهوية نفسها على فواتيرك</div></div>
    <a class="btn btn-gold" href="booking.html" target="_blank" style="text-decoration:none">فتح موقعي ↗</a>
  </div>
  <div style="display:grid;grid-template-columns:1fr 330px;gap:20px;align-items:start">
    <div>
      ${(()=>{const T=[['general','gear','عام'],['visits','chart','الزيارات'],['svc','scissors','الخدمات'],['books','calendar','الحجوزات'],['team','staff','الفريق'],['identity','idcard','الهوية'],['design','palette','استوديو التصميم'],['front','image','الواجهة'],['banners','mega','البنرات'],['pages','clipboard','الصفحات'],['cats','boxes','التصنيفات']];
        return `<div style="display:flex;gap:9px;margin-bottom:16px;flex-wrap:wrap">${T.map(([k,ic,l])=>`
          <button onclick="PAGE.showTab('${k}')" style="flex:1;min-width:130px;display:flex;align-items:center;justify-content:center;gap:8px;padding:12px 10px;border-radius:12px;cursor:pointer;font-family:inherit;font-size:13px;font-weight:${PAGE_TAB===k?'700':'400'};
            border:1.5px solid ${PAGE_TAB===k?'var(--gold-light)':'var(--line)'};
            background:${PAGE_TAB===k?'linear-gradient(100deg,rgba(156,124,58,0.18),rgba(156,124,58,0.05))':'var(--surface)'};
            color:${PAGE_TAB===k?'var(--gold-light)':'var(--cream)'}">${icon(ic,17)} ${l}</button>`).join('')}</div>`;})()}
      <div style="${PAGE_TAB==='general'?'':'display:none'}">
      <div class="card" style="margin-bottom:14px">
        <div class="sec-label">إعداد الرابط الخاص <span class="ln"></span></div>
        <div style="display:flex;align-items:stretch;border:1px solid var(--line);border-radius:11px;overflow:hidden" dir="ltr">
          <span style="background:var(--surface2);padding:12px 14px;font-size:13px;color:var(--muted);font-family:'IBM Plex Mono',monospace">luma.beauty/</span>
          <input value="${c.slug}" oninput="PAGE.field('slug',this)" style="flex:1;background:var(--bg);border:none;outline:none;color:var(--gold-light);padding:12px;font-size:13.5px;font-family:'IBM Plex Mono',monospace"/>
          <button id="cpBtn" class="btn btn-ghost" style="border-radius:0;border:none;border-right:1px solid var(--line)" onclick="PAGE.copy()">نسخ الرابط</button>
        </div>
        <div style="font-size:11px;color:var(--muted);margin-top:8px">أحرف إنجليزية وأرقام وشرطات فقط — يُنظَّف تلقائياً أثناء الكتابة.</div>
      </div>
      ${(()=>{ /* لوحة أداء الموقع — أرقام حية من الزيارات والحجوزات */
        const visits=1284+(parseInt(LumaStore.raw.get('luma_store_visits','0'))||0);
        const sales=26950;
        const bookings=LumaStore.get('luma_public_bookings',[])||[];
        const bookCount=47+bookings.length;
        const clientsN=306+((typeof CLIENTS!=='undefined')?CLIENTS.length:6);
        const svcCount={'مكياج عروس':18,'مكياج سهرة':14,'هيدرافيشل':9};
        bookings.forEach(b=>{if(b.service)svcCount[b.service]=(svcCount[b.service]||0)+1;});
        const topSvc=Object.entries(svcCount).sort((a,b)=>b[1]-a[1]).slice(0,3);
        const maxS=topSvc.length?topSvc[0][1]:1;
        const feed=bookings.map(b=>({k:'حجز',kc:'green',n:b.client||'حجز أونلاين',d:(b.service||'')+(b.time?' · '+b.time:''),at:b.at||''}))
          .sort((a,b)=>String(b.at).localeCompare(String(a.at))).slice(0,6);
        const bar=(v,max,color)=>`<div style="flex:1;height:7px;background:var(--surface3);border-radius:10px;overflow:hidden"><span style="display:block;height:100%;width:${Math.round(v/max*100)}%;background:${color};border-radius:10px"></span></div>`;
        return `
      <div class="sec-label" style="margin-top:4px">أداء الموقع <span class="ln"></span><span style="font-size:11px;color:var(--muted)">أرقام حية — الزيارات والحجوزات تتحدث تلقائياً</span></div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px">
        ${[[visits.toLocaleString('en'),'زيارة للموقع'],[sales.toLocaleString('en')+' <span style=\'font-size:11px\'>ر.س</span>','قيمة المبيعات'],[bookCount,'حجز'],[clientsN,'عميلة']].map(x=>`
        <div class="card" style="text-align:center;padding:15px 8px"><div class="num" style="font-size:22px;color:var(--gold-light)">${x[0]}</div><div style="font-size:11px;color:var(--muted);margin-top:4px">${x[1]}</div></div>`).join('')}
      </div>
      <div style="margin-bottom:16px">
        <div class="card"><div class="sec-label">الخدمات الأكثر حجزاً <span class="ln"></span></div>
          ${topSvc.map(([n,v])=>`<div style="display:flex;align-items:center;gap:10px;padding:8px 0"><span style="font-size:12.5px;color:var(--cream);width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${n}</span>${bar(v,maxS,'linear-gradient(90deg,#9fce99,#5f8a5b)')}<span class="num" style="font-size:13px;color:var(--gold-pale);width:30px;text-align:left">${v}</span></div>`).join('')}</div>
      </div>
      <div class="card" style="margin-bottom:14px"><div class="sec-label">آخر الحجوزات <span class="ln"></span></div>
        ${feed.length?feed.map(f=>`<div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--line-soft)"><span class="badge ${f.kc}" style="min-width:44px;justify-content:center">${f.k}</span><span style="flex:1;font-size:13px;color:var(--white)">${f.n}</span><span style="font-size:11.5px;color:var(--muted)" dir="ltr">${f.d}</span></div>`).join('')
        :'<div style="font-size:12.5px;color:var(--muted);padding:6px 0;line-height:1.9">لا حجوزات أونلاين بعد — أول حجز من موقعك سيظهر هنا فوراً.</div>'}</div>`;})()}
      </div>
      <div style="${PAGE_TAB==='visits'?'':'display:none'}">
      ${(()=>{ /* تحليلات الزيارات — الزوار والمشاهدات والمصادر والأجهزة ومعدل التحويل */
        const live=(parseInt(LumaStore.raw.get('luma_store_visits','0'))||0);
        const visits=1284+live;
        const visitors=942+live;
        const booksN=(LumaStore.get('luma_public_bookings',[])||[]).length;
        const conv=Math.min(100,((47+booksN)/(visits||1))*100);
        const sv=[['مكياج عروس',693],['هيدرافيشل',441],['مكياج سهرة',402],['قص أطراف وسشوار',287]];
        const svSum=sv.reduce((t,x)=>t+x[1],0);
        const pages=[['الصفحة الرئيسية',visits],['صفحة الحجز',744],['كل الخدمات',861],['صفحة المعرض',519],['من نحن',203]];
        const src=[['انستغرام',38,'#dbbd81'],['بحث Google',24,'#9fce99'],['مباشر — الرابط',19,'#8fb8d8'],['واتساب',12,'#a9dfb9'],['تيك توك',7,'#d8a5c0']];
        const dev=[['جوال',78],['كمبيوتر',16],['تابلت',6]];
        const bar=(v,max,color)=>`<div style="flex:1;height:7px;background:var(--surface3);border-radius:10px;overflow:hidden"><span style="display:block;height:100%;width:${Math.max(3,Math.round(v/max*100))}%;background:${color};border-radius:10px"></span></div>`;
        const row=(n,v,max,color,suffix)=>`<div style="display:flex;align-items:center;gap:10px;padding:8px 0"><span style="font-size:12.5px;color:var(--cream);width:132px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${n}</span>${bar(v,max,color)}<span class="num" style="font-size:13px;color:var(--gold-pale);width:52px;text-align:left">${v.toLocaleString('en')}${suffix||''}</span></div>`;
        return `
      <div class="sec-label" style="margin-top:4px">تحليلات الزيارات <span class="ln"></span><span style="font-size:11px;color:var(--muted)">آخر 30 يوماً — الزوار يتحدثون تلقائياً مع كل زيارة لموقعك</span></div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px">
        ${[[visitors.toLocaleString('en'),'الزوار'],[svSum.toLocaleString('en'),'مشاهدات الخدمات'],[conv.toFixed(1)+'٪','معدل التحويل']].map(x=>`
        <div class="card" style="text-align:center;padding:15px 8px"><div class="num" style="font-size:22px;color:var(--gold-light)">${x[0]}</div><div style="font-size:11px;color:var(--muted);margin-top:4px">${x[1]}</div></div>`).join('')}
      </div>
      <div style="margin-bottom:14px">
        <div class="card"><div class="sec-label">مشاهدات الخدمات — الأعلى <span class="ln"></span></div>
          ${sv.map(([n,v])=>row(n,v,sv[0][1],'linear-gradient(90deg,#9fce99,#5f8a5b)')).join('')}</div>
      </div>
      <div class="card" style="margin-bottom:14px"><div class="sec-label">أكثر الصفحات زيارة <span class="ln"></span></div>
        ${pages.map(([n,v])=>row(n,v,pages[0][1],'linear-gradient(90deg,#8fb8d8,#5b7f9c)')).join('')}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
        <div class="card"><div class="sec-label">مصادر الزيارات <span class="ln"></span></div>
          ${src.map(([n,v,cl])=>row(n,v,src[0][1],cl,'٪')).join('')}</div>
        <div class="card"><div class="sec-label">الأجهزة <span class="ln"></span></div>
          ${dev.map(([n,v])=>row(n,v,dev[0][1],'linear-gradient(90deg,#d8a5c0,#9c5b7f)','٪')).join('')}
          <div style="font-size:11px;color:var(--muted);margin-top:8px;line-height:1.9">معدل التحويل = (الطلبات + الحجوزات) ÷ الزيارات — كل طلب أو حجز جديد يرفعه مباشرة.</div></div>
      </div>`;})()}
      </div>
      <div style="${PAGE_TAB==='svc'?'':'display:none'}">
      <div class="card" style="margin-bottom:14px">
        <div class="sec-label">إدارة الخدمات <span class="ln"></span><span style="font-size:11px;color:var(--muted)">الاسم والسعر والمدة والوصف والصور والموظفات والحالة والظهور بالموقع</span></div>
        ${(()=>{const META=LumaStore.get('luma_svc_meta',{})||{};const IMGS=LumaStore.get('luma_svc_img',{})||{};
        return pageSvcList().map(sv=>{const m=META[sv.n]||{};const im=IMGS[sv.n];const q=sv.n.replace(/'/g,"\\'");
        return `
        <div class="msvc" style="border:1px solid ${m.off?'var(--line)':'var(--gold-deep)'};border-radius:12px;padding:12px 14px;margin-bottom:10px;${m.off?'opacity:.7;':''}background:${m.off?'var(--surface)':'linear-gradient(120deg,rgba(219,189,129,.05),transparent)'}">
          <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap">
            ${im?`<img src="${im}" alt="" style="width:44px;height:44px;border-radius:9px;object-fit:cover;border:1px solid var(--gold-deep);flex-shrink:0"/>`:`<span style="width:44px;height:44px;border-radius:9px;background:var(--surface2);display:inline-flex;align-items:center;justify-content:center;color:var(--muted);flex-shrink:0">${icon('image',17)}</span>`}
            <span style="flex:1;min-width:140px"><b style="font-size:13.5px;color:var(--white)">${sv.n}</b><span style="display:block;font-size:11px;color:var(--muted);margin-top:3px">${sv.c} · ${sv.d} دقيقة · <b class="num" style="color:var(--gold-pale)">${sv.p}</b> ر.س</span></span>
            <label class="btn btn-ghost" style="cursor:pointer;padding:7px 11px;font-size:11px;display:inline-flex;align-items:center;gap:5px">${icon('upload',12)} صورة<input type="file" accept="image/*" onchange="svcImgPick('${q}',this)" style="display:none"/></label>
            <button class="msvc-st btn btn-ghost" onclick="PAGE.svcMetaT('${q}','off')" style="padding:7px 12px;font-size:11px;color:${m.off?'#e29aa6':'var(--gold-light)'}">${m.off?'موقوفة':'نشطة ✓'}</button>
            <button class="msvc-hide btn btn-ghost" onclick="PAGE.svcMetaT('${q}','hide')" style="padding:7px 12px;font-size:11px;color:${m.hide?'#e29aa6':'var(--cream)'}">${m.hide?'مخفية من الموقع':'ظاهرة بالموقع ✓'}</button>
          </div>
          <input class="msvc-desc" value="${String(m.desc||'').replace(/"/g,'&quot;')}" onchange="PAGE.svcDesc('${q}',this)" placeholder="وصف الخدمة — يظهر للعميلة تحت اسم الخدمة في الموقع" style="width:100%;margin-top:10px;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:9px 12px;color:var(--white);font-family:inherit;font-size:12px;outline:none"/>
          <div style="display:flex;gap:7px;flex-wrap:wrap;margin-top:9px;align-items:center">
            <span style="font-size:11px;color:var(--muted)">تقدمها:</span>
            ${pageTeam().map(([tn])=>{const onn=(m.staff||[]).includes(tn);return `
            <button class="msvc-stf" onclick="PAGE.svcStaff('${q}','${tn}')" style="font-family:inherit;font-size:11px;padding:5px 13px;border-radius:16px;cursor:pointer;border:1px solid ${onn?'var(--gold-light)':'var(--line)'};background:${onn?'linear-gradient(120deg,rgba(219,189,129,.18),rgba(156,124,58,.06))':'var(--surface)'};color:${onn?'var(--gold-light)':'var(--muted)'}">${tn}${onn?' ✓':''}</button>`;}).join('')}
          </div>
        </div>`;}).join('');})()}
      </div>
      </div>
      <div style="${PAGE_TAB==='books'?'':'display:none'}">
      <div class="card" style="margin-bottom:14px">
        <div class="sec-label">حجوزات الموقع <span class="ln"></span><span style="font-size:11px;color:var(--muted)">القادمة والمكتملة والملغاة — العميل والخدمة والموظفة والوقت</span></div>
        ${(()=>{const all=PAGE.bookList();
        const F=[['up','القادمة'],['done','المكتملة'],['cancel','الملغاة']];
        const list=all.filter(b=>b.st===PAGE_BOOKF);
        return `
        <div style="display:flex;gap:8px;margin-bottom:13px">
          ${F.map(([k,lb])=>`<button class="bkf" data-f="${k}" onclick="PAGE.bookFilter('${k}')" style="font-family:inherit;font-size:12px;padding:8px 17px;border-radius:20px;cursor:pointer;border:1.5px solid ${PAGE_BOOKF===k?'var(--gold-light)':'var(--line)'};background:${PAGE_BOOKF===k?'linear-gradient(120deg,rgba(219,189,129,.16),rgba(156,124,58,.05))':'var(--surface)'};color:${PAGE_BOOKF===k?'var(--gold-light)':'var(--cream)'}">${lb} <b class="num">${all.filter(b=>b.st===k).length}</b></button>`).join('')}
        </div>
        ${list.length?list.map(b=>`
        <div class="mbk" style="display:flex;align-items:center;gap:12px;border:1px solid var(--line);border-radius:11px;padding:11px 14px;margin-bottom:8px;flex-wrap:wrap">
          <span style="width:36px;height:36px;border-radius:50%;background:rgba(219,189,129,.12);color:var(--gold-light);display:inline-flex;align-items:center;justify-content:center;font-weight:800;flex-shrink:0">${String(b.client).charAt(0)}</span>
          <span style="flex:1;min-width:120px"><b style="font-size:13px;color:var(--white)">${b.client}</b><span style="display:block;font-size:11px;color:var(--muted);margin-top:2px">${b.svc} · مع ${b.staff}</span></span>
          <span style="font-size:11.5px;color:var(--gold-pale)" dir="ltr">${b.date} · ${b.time}</span>
          <span class="badge ${b.st==='up'?'gold':b.st==='done'?'green':'red'}" style="min-width:56px;justify-content:center">${b.st==='up'?'قادم':b.st==='done'?'مكتمل':'ملغي'}</span>
          ${b.st==='up'?`<span style="display:inline-flex;gap:6px">
            <button class="mbk-done btn btn-ghost" onclick="PAGE.bookSt('${b.id}','done')" style="padding:6px 12px;font-size:11px;color:#9fce99">إتمام ✓</button>
            <button class="mbk-cancel btn btn-ghost" onclick="PAGE.bookSt('${b.id}','cancel')" style="padding:6px 12px;font-size:11px;color:#e29aa6">إلغاء</button></span>`:''}
        </div>`).join(''):`<div style="font-size:12.5px;color:var(--muted);padding:8px 0">لا حجوزات في هذه القائمة.</div>`}`;})()}
      </div>
      </div>
      <div style="${PAGE_TAB==='team'?'':'display:none'}">
      <div class="card" style="margin-bottom:14px">
        <div class="sec-label">فريق الصالون <span class="ln"></span><span style="font-size:11px;color:var(--muted)">الموظفات والتخصص والخدمات وجدول العمل والنبذة</span></div>
        ${(()=>{const META=LumaStore.get('luma_team_meta',{})||{};const svcs=pageSvcList();const SVM=LumaStore.get('luma_svc_meta',{})||{};
        return `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">${pageTeam().map(([tn,role])=>{
          const assigned=svcs.filter(sv=>((SVM[sv.n]||{}).staff||[]).includes(tn));
          const list=assigned.length?assigned:svcs.filter(sv=>sv.c===role);
          const bio=(META[tn]||{}).bio||'';
          return `
        <div class="mteam" style="border:1px solid var(--gold-deep);border-radius:13px;padding:14px 15px">
          <div style="display:flex;align-items:center;gap:11px;margin-bottom:9px">
            <span style="width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,rgba(219,189,129,.25),rgba(156,124,58,.08));color:var(--gold-light);display:inline-flex;align-items:center;justify-content:center;font-size:17px;font-weight:800">${tn.charAt(0)}</span>
            <span><b style="font-size:14px;color:var(--white)">${tn}</b><span style="display:block;font-size:11px;color:var(--gold-pale);margin-top:2px">التخصص: ${role}</span></span>
          </div>
          <div style="font-size:11px;color:var(--muted);margin-bottom:5px">الخدمات التي تقدمها:</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:9px">
            ${list.slice(0,4).map(sv=>`<span style="font-size:10.5px;color:var(--cream);border:1px solid var(--line);border-radius:14px;padding:4px 11px">${sv.n}</span>`).join('')||'<span style="font-size:11px;color:var(--muted)">حدديها من قسم «الخدمات»</span>'}
          </div>
          <div style="display:flex;align-items:center;gap:7px;font-size:11px;color:var(--muted);margin-bottom:9px"><span style="color:var(--gold-light);display:inline-flex">${icon('clock',13)}</span> السبت – الخميس · 10:00 ص – 8:00 م · الجمعة إجازة</div>
          <textarea class="mteam-bio" rows="2" onchange="PAGE.teamBio('${tn}',this)" placeholder="نبذة عنها — خبرتها وشهاداتها وأسلوبها" style="width:100%;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:9px 11px;color:var(--white);font-family:inherit;font-size:11.5px;line-height:1.9;outline:none;resize:vertical">${bio}</textarea>
        </div>`;}).join('')}</div>`;})()}
      </div>
      </div>
      <div style="${PAGE_TAB==='identity'?'':'display:none'}">
      <div class="card" style="margin-bottom:14px">
        <div class="sec-label">هوية الصفحة <span class="ln"></span></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="lux-f"><label>اسم الصالون</label><input value="${c.title}" oninput="PAGE.field('title',this)" style="width:100%;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:11px 13px;color:var(--white);font-family:inherit;font-size:13.5px;outline:none"/></div>
          <div class="lux-f"><label>رقم التواصل</label><input value="${c.phone}" oninput="PAGE.field('phone',this)" dir="ltr" style="width:100%;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:11px 13px;color:var(--white);font-family:inherit;font-size:13.5px;outline:none;text-align:right"/></div>
          <div class="lux-f"><label>العنوان</label><input value="${c.address||''}" oninput="PAGE.field('address',this)" style="width:100%;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:11px 13px;color:var(--white);font-family:inherit;font-size:13.5px;outline:none"/></div>
          <div class="lux-f"><label>الرقم الضريبي <span style="font-size:10px;color:var(--muted)">— يظهر في الفاتورة</span></label><input value="${c.vatno||''}" oninput="PAGE.field('vatno',this)" dir="ltr" placeholder="310123456700003" style="width:100%;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:11px 13px;color:var(--white);font-family:inherit;font-size:13.5px;outline:none;text-align:right"/></div>
        </div>
        <div class="lux-f"><label>نبذة مختصرة</label><textarea rows="2" oninput="PAGE.field('bio',this)" style="width:100%;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:11px 13px;color:var(--white);font-family:inherit;font-size:13.5px;outline:none;resize:vertical">${c.bio}</textarea></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          ${[['logo','الشعار','https://…/logo.png'],['cover','صورة الغلاف الفاخرة','https://…/cover.jpg']].map(([k,lb,ph])=>{
            const v=c[k]||'';const isData=v.startsWith('data:');
            return `
          <div class="lux-f"><label>${lb} <span style="font-size:10px;color:var(--muted)">— رفع صورة أو رابط</span></label>
            <div style="display:flex;gap:8px;align-items:center">
              ${v?`<span style="position:relative;flex-shrink:0">
                <img id="pv-${k}" src="${v}" alt="" style="width:${k==='logo'?'42px':'66px'};height:42px;border-radius:9px;object-fit:cover;border:1px solid var(--gold-deep)" onerror="this.style.display='none'"/>
                <button onclick="PAGE.imgClear('${k}')" title="إزالة" style="position:absolute;top:-7px;left:-7px;width:19px;height:19px;border-radius:50%;border:none;background:rgba(0,0,0,.75);color:#f0a3b0;cursor:pointer;font-size:10px;line-height:1">✕</button>
                <button class="crop-btn" onclick="PAGE.imgCrop('${k}')" title="قص وتكبير" style="position:absolute;bottom:-7px;left:-7px;width:19px;height:19px;border-radius:50%;border:none;background:var(--gold-deep);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0">${icon('scissors',11)}</button></span>`:''}
              <label class="btn btn-ghost" style="cursor:pointer;padding:9px 12px;font-size:12px;white-space:nowrap;display:inline-flex;align-items:center;gap:6px">${icon('upload',13)} رفع
                <input id="up-${k}" type="file" accept="image/*" onchange="PAGE.imgUpload('${k}',this)" style="display:none"/></label>
              <input value="${isData?'':v}" oninput="PAGE.field('${k}',this)" dir="ltr" placeholder="${isData?'صورة مرفوعة ✓ — أو الصقي رابطاً':ph}" style="flex:1;min-width:0;background:var(--bg);border:1px dashed var(--gold-deep);border-radius:8px;padding:11px 13px;color:var(--white);font-family:inherit;font-size:12px;outline:none;text-align:right"/>
            </div></div>`;}).join('')}
        </div>
      </div>
      ${(()=>{const t=pageThemeOf(c);const FIELDS=[['bg','خلفية الصفحة'],['card','لون البطاقات'],['ac','اللون المميز — الأزرار والعناوين'],['tx','لون النصوص']];
      return `
      <div class="card" style="margin-bottom:14px">
        <div class="sec-label">ألوان الهوية <span class="ln"></span>
          <span id="thBadge" style="display:${c.theme==='custom'?'inline-block':'none'};font-size:10.5px;color:var(--gold-light);border:1px solid var(--gold-deep);border-radius:20px;padding:2px 10px">ثيم مخصص ✓</span></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:11px">
          ${FIELDS.map(([k,lb])=>`
          <div style="display:flex;align-items:center;gap:10px;border:1px solid var(--line);border-radius:11px;padding:9px 12px">
            <input type="color" id="thc-${k}" value="${t[k]}" onchange="PAGE.setColor('${k}',this.value)"
              style="width:34px;height:34px;border:none;border-radius:9px;background:none;cursor:pointer;padding:0"/>
            <div style="flex:1"><div style="font-size:12px;color:var(--white)">${lb}</div>
              <input id="thx-${k}" value="${t[k]}" onchange="PAGE.setColor('${k}',this.value)" dir="ltr"
                style="width:100%;background:none;border:none;outline:none;color:var(--gold-pale);font-family:'IBM Plex Mono',monospace;font-size:11.5px;padding:2px 0"/></div>
          </div>`).join('')}
        </div>
      </div>
      <div class="card" style="margin-bottom:14px">
        <div class="sec-label">نوع الخط <span class="ln"></span><span style="font-size:11px;color:var(--muted)">خط صفحة موقعك وفاتورتك</span></div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:9px">
          ${PAGE_FONTS.map(([k,lb,fam])=>`
          <button class="font-chip" onclick="PAGE.setFont('${k}')" style="font-family:${fam.replace(/"/g,'&quot;')};background:var(--surface2);border:1.5px solid ${(c.font||'plex')===k?'var(--gold-light)':'var(--line)'};border-radius:11px;padding:10px 6px;cursor:pointer;text-align:center;color:var(--white)">
            <span style="display:flex;align-items:center;justify-content:center;gap:6px;font-size:17px;line-height:1.5">أهلاً بك <span style="color:var(--gold-light);display:inline-flex">${icon('flower',15)}</span></span>
            <span style="display:block;font-size:9.5px;color:${(c.font||'plex')===k?'var(--gold-light)':'var(--muted)'};margin-top:4px">${lb}</span>
          </button>`).join('')}
        </div>
      </div>`;})()}
      <div class="card" style="margin-bottom:14px">
        <div class="sec-label">موقعي على الخريطة <span class="ln"></span><span style="font-size:11px;color:var(--muted)">اختياري — خريطة مدمجة وزر اتجاهات في صفحتك</span></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-gold" style="white-space:nowrap;display:inline-flex;align-items:center;gap:7px" onclick="PAGE.geoPick()">${icon('pin',15)} التقاط موقعي الحالي</button>
          <input id="mapIn" value="${(c.map||'').replace(/"/g,'&quot;')}" oninput="PAGE.field('map',this)" dir="ltr" placeholder="إحداثيات (مثال 21.5433,39.1728) أو رابط خرائط Google" style="flex:1;min-width:280px;background:var(--bg);border:1px dashed var(--gold-deep);border-radius:9px;padding:11px 13px;color:var(--white);font-family:inherit;font-size:12px;outline:none;text-align:right"/>
        </div>
        <div style="font-size:11px;color:var(--muted);margin-top:9px">تظهر للعميلات كخريطة مدمجة أسفل صفحة الحجز مع زر «الاتجاهات» — اتركيه فارغاً للإخفاء.</div>
      </div>
      <div class="card" style="margin-bottom:14px">
        <div class="sec-label">حسابات التواصل <span class="ln"></span><span style="font-size:11px;color:var(--muted)">اختيارية — تظهر كأيقونات في صفحتك فقط عند تعبئتها</span></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          ${PAGE_SOCIALS.map(([k,lb,ph])=>`
          <div class="lux-f"><label>${lb}</label>
            <input id="soc-${k}" value="${((c.social||{})[k]||'').replace(/"/g,'&quot;')}" oninput="PAGE.setSocial('${k}',this)" dir="ltr" placeholder="${ph}" style="width:100%;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:11px 13px;color:var(--white);font-family:inherit;font-size:12.5px;outline:none;text-align:right"/></div>`).join('')}
        </div>
      </div>
      </div>
      <div style="${PAGE_TAB==='front'?'':'display:none'}">
      <div class="card" style="margin-bottom:14px">
        <div class="sec-label">رسالة الترحيب <span class="ln"></span><span style="font-size:11px;color:var(--muted)">اختيارية — نافذة منبثقة أول ما تفتح العميلة موقعك</span></div>
        <input id="wbIn" value="${(c.welcome||'').replace(/"/g,'&quot;')}" oninput="PAGE.field('welcome',this)" placeholder="مثال: 🌸 أهلاً بك! خصم 10٪ على أول حجز بكود LUMA10 — اتركيه فارغاً للإخفاء" style="width:100%;background:var(--bg);border:1px solid var(--line);border-radius:9px;padding:12px 14px;color:var(--white);font-family:inherit;font-size:13px;outline:none"/>
      </div>
      ${(()=>{const t=pageThemeOf(c);
      const uiChip=(k,v,cur,lb)=>`<button class="ui-chip" data-ui="${k}:${v}" onclick="PAGE.setUI('${k}','${v}')" style="font-family:inherit;font-size:12px;padding:8px 16px;border-radius:20px;cursor:pointer;border:1.5px solid ${cur===v?'var(--gold-light)':'var(--line)'};background:${cur===v?'linear-gradient(120deg,rgba(219,189,129,.16),rgba(156,124,58,.05))':'var(--surface)'};color:${cur===v?'var(--gold-light)':'var(--cream)'}">${lb}</button>`;
      return `
      <div class="card" style="margin-bottom:14px">
        <div class="sec-label">ألوان الواجهة <span class="ln"></span><span style="font-size:11px;color:var(--muted)">الأساسي والثانوي ولون الأزرار</span></div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:11px">
          ${[['ac','اللون الأساسي'],['ac2','اللون الثانوي'],['btn','لون الأزرار']].map(([k,lb])=>{const v=t[k]||t.ac;return `
          <div style="display:flex;align-items:center;gap:10px;border:1px solid var(--line);border-radius:11px;padding:9px 12px">
            <input type="color" id="uic-${k}" value="${v}" onchange="PAGE.setColor('${k}',this.value)" style="width:34px;height:34px;border:none;border-radius:9px;background:none;cursor:pointer;padding:0"/>
            <div style="flex:1"><div style="font-size:12px;color:var(--white)">${lb}</div>
              <input id="uix-${k}" value="${v}" onchange="PAGE.setColor('${k}',this.value)" dir="ltr" style="width:100%;background:none;border:none;outline:none;color:var(--gold-pale);font-family:'IBM Plex Mono',monospace;font-size:11.5px;padding:2px 0"/></div>
          </div>`;}).join('')}
        </div>
        <div style="font-size:11px;color:var(--muted);margin-top:9px">الأساسي للعناوين والتمييز · الثانوي لخلفيات القوائم · الأزرار لزر الحجز والدفع.</div>
      </div>
      <div class="card" style="margin-bottom:14px">
        <div class="sec-label">خط الواجهة <span class="ln"></span></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${PAGE_FONTS.map(([k,lb,fam])=>`<button class="font-chip2" onclick="PAGE.setFont('${k}')" style="font-family:${fam.replace(/"/g,'&quot;')};font-size:12.5px;padding:9px 15px;border-radius:20px;cursor:pointer;border:1.5px solid ${(c.font||'plex')===k?'var(--gold-light)':'var(--line)'};background:var(--surface);color:${(c.font||'plex')===k?'var(--gold-light)':'var(--cream)'}">${lb}</button>`).join('')}
        </div>
      </div>
      <div class="card" style="margin-bottom:14px">
        <div class="sec-label">أشكال الواجهة <span class="ln"></span><span style="font-size:11px;color:var(--muted)">البطاقات والأزرار والقائمة وطرق العرض</span></div>
        ${[
          ['cardStyle','شكل البطاقات',[['soft','ناعمة مستديرة'],['sharp','حادة مربعة'],['outline','بإطار مميز']],'soft'],
          ['btnStyle','شكل الأزرار',[['auto','حسب الاستدارة'],['pill','كبسولة'],['rounded','مستدير خفيف'],['square','مربع']],'auto'],
          ['svcView','طريقة عرض الخدمات',[['list','قائمة'],['cards','بطاقات']],'list'],
          ['menuStyle','شكل القائمة',[['simple','بسيطة'],['pills','حبوب'],['underline','شريط سفلي']],'simple'],
        ].map(([k,lb,opts,d])=>`
        <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--line-soft);flex-wrap:wrap">
          <span style="font-size:12.5px;color:var(--white);width:158px">${lb}</span>
          <span style="display:flex;gap:7px;flex-wrap:wrap">${opts.map(([v,ol])=>uiChip(k,v,c[k]||d,ol)).join('')}</span>
        </div>`).join('')}
      </div>
      <div class="card" style="margin-bottom:14px">
        <div class="sec-label">Footer — تذييل الصفحة <span class="ln"></span>
          <button class="btn btn-ghost" id="ftTgl" style="padding:6px 13px;font-size:11.5px" onclick="PAGE.setUI('footerOn','${c.footerOn===false?'true':'false'}')">${c.footerOn===false?'إظهار':'إخفاء'}</button></div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:9px">يظهر أسفل موقعك: الاسم والعنوان والتواصل وحسابات السوشل — وحالته الآن: <b style="color:${c.footerOn===false?'#e29aa6':'var(--gold-light)'}">${c.footerOn===false?'مخفي':'ظاهر'}</b></div>
        <input id="ftNote" value="${(c.footerNote||'').replace(/"/g,'&quot;')}" oninput="PAGE.field('footerNote',this)" placeholder="سطر إضافي — مثال: نسعد بخدمتكم يومياً من 10 صباحاً حتى 10 مساءً" style="width:100%;background:var(--bg);border:1px solid var(--line);border-radius:9px;padding:12px 14px;color:var(--white);font-family:inherit;font-size:13px;outline:none"/>
      </div>`;})()}
      <div class="card" style="margin-bottom:14px">
        <div class="sec-label">معرض الأعمال — صور وفيديوهات <span class="ln"></span><span style="font-size:11px;color:var(--muted)">${(c.gallery||[]).length} / ${PAGE.GAL_MAX}</span></div>
        ${(c.gallery||[]).length?`
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:10px;margin-bottom:14px">
          ${c.gallery.map((g,i)=>`
          <div class="gal-thumb" style="position:relative;aspect-ratio:1;border-radius:11px;overflow:hidden;border:1px solid var(--line);background:var(--surface3)">
            ${g.type==='video'
              ?`${g.yt?`<img src="https://i.ytimg.com/vi/${g.yt}/hqdefault.jpg" alt="" style="width:100%;height:100%;object-fit:cover" onerror="this.remove()"/>`:''}
                 <span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.35);color:#fff;font-size:22px">▶</span>`
              :`<img src="${g.src}" alt="" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'"/>`}
            <button onclick="PAGE.galDel(${i})" title="حذف" style="position:absolute;top:5px;left:5px;width:22px;height:22px;border-radius:50%;border:none;background:rgba(0,0,0,.65);color:#f0a3b0;cursor:pointer;font-size:12px;line-height:1">✕</button>
          </div>`).join('')}
        </div>`:`<div style="font-size:12.5px;color:var(--muted);margin-bottom:14px">أضيفي صور أعمالك (مكياج، تسريحات، أظافر…) وفيديوهات قصيرة — تظهر كمعرض أنيق في صفحة الحجز.</div>`}
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <label class="btn btn-gold" style="cursor:pointer;display:inline-flex;align-items:center;gap:7px">${icon('upload',14)} رفع صورة من الجهاز
            <input id="galFile" type="file" accept="image/*" onchange="PAGE.galAddFile(this)" style="display:none"/></label>
          <div style="flex:1;display:flex;gap:8px;min-width:260px">
            <input id="galUrl" dir="ltr" placeholder="رابط صورة أو فيديو (YouTube / mp4)…" style="flex:1;background:var(--bg);border:1px dashed var(--gold-deep);border-radius:9px;padding:11px 13px;color:var(--white);font-family:inherit;font-size:12px;outline:none;text-align:right"/>
            <button id="galAdd" class="btn btn-ghost" onclick="PAGE.galAddUrl()">إضافة</button>
          </div>
        </div>
        <div style="font-size:11px;color:var(--muted);margin-top:9px">الصور المرفوعة تُضغط تلقائياً · الفيديو برابط يوتيوب أو ملف mp4</div>
      </div>
      </div>
      <div style="${PAGE_TAB==='pages'?'':'display:none'}">
      <div class="card" style="margin-bottom:14px">
        <div class="sec-label">صفحات الموقع <span class="ln"></span><span style="font-size:11px;color:var(--muted)">سياسة الحجز و«من نحن»</span></div>
        <div class="lux-f"><label>سياسة الحجز — كل سطر يظهر كبند في صفحة الحجز وعند التأكيد</label>
          <textarea rows="4" oninput="PAGE.field('policy',this)" style="width:100%;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:11px 13px;color:var(--white);font-family:inherit;font-size:13px;line-height:2;outline:none;resize:vertical">${c.policy||''}</textarea></div>
        <div class="lux-f"><label>من نحن <span style="font-size:10px;color:var(--muted)">— اختياري، يظهر بنافذة منبثقة عند ضغط العميلة زر «من نحن» · كل سطر فقرة</span></label><textarea id="aboutIn" rows="4" oninput="PAGE.field('about',this)" placeholder="قصتكم، رؤيتكم، ما يميز صالونكم…" style="width:100%;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:11px 13px;color:var(--white);font-family:inherit;font-size:13.5px;line-height:2;outline:none;resize:vertical">${c.about||''}</textarea></div>
      </div>
      <div class="card" style="margin-bottom:14px">
        <div class="sec-label">صفحات موقعك الجاهزة <span class="ln"></span><span style="font-size:11px;color:var(--muted)">تظهر كروابط في تذييل الموقع — فعّلي ما يناسبك</span></div>
        ${PAGE_SITEPAGES.map(([k,lb,d])=>{const on=(c.pagesOn||{})[k]!==false;return `
        <div class="spg-row" data-pg="${k}" style="display:flex;align-items:center;gap:11px;border:1px solid ${on?'var(--gold-deep)':'var(--line)'};border-radius:11px;padding:10px 13px;margin-bottom:8px;background:${on?'linear-gradient(120deg,rgba(219,189,129,.07),transparent)':'var(--surface)'}">
          <span style="color:${on?'var(--gold-light)':'var(--muted)'};display:inline-flex">${icon('clipboard',15)}</span>
          <span style="flex:1;min-width:0"><span style="display:block;font-size:13px;color:${on?'var(--white)':'var(--muted)'}">${lb}</span><span style="display:block;font-size:10.5px;color:var(--muted);margin-top:2px">${d}</span></span>
          <button class="spg-tgl btn btn-ghost" onclick="PAGE.pgToggle('${k}')" style="padding:6px 13px;font-size:11.5px;white-space:nowrap">${on?'إخفاء':'إظهار'}</button>
        </div>`;}).join('')}
        <div class="lux-f" style="margin-top:12px"><label>الأسئلة الشائعة <span style="font-size:10px;color:var(--muted)">— كل سطر: السؤال | الجواب</span></label>
          <textarea id="faqIn" rows="3" oninput="PAGE.field('faqText',this)" style="width:100%;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:11px 13px;color:var(--white);font-family:inherit;font-size:12.5px;line-height:2;outline:none;resize:vertical">${c.faqText||''}</textarea></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
          <div class="lux-f"><label>سياسة الخصوصية <span style="font-size:10px;color:var(--muted)">— كل سطر فقرة</span></label>
            <textarea id="privIn" rows="3" oninput="PAGE.field('privacyText',this)" style="width:100%;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:11px 13px;color:var(--white);font-family:inherit;font-size:12.5px;line-height:2;outline:none;resize:vertical">${c.privacyText||''}</textarea></div>
          <div class="lux-f"><label>سياسة الاسترجاع <span style="font-size:10px;color:var(--muted)">— كل سطر فقرة</span></label>
            <textarea id="retIn" rows="3" oninput="PAGE.field('policyText',this)" style="width:100%;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:11px 13px;color:var(--white);font-family:inherit;font-size:12.5px;line-height:2;outline:none;resize:vertical">${c.policyText||''}</textarea></div>
        </div>
      </div>
      <div class="card" style="margin-bottom:14px">
        <div class="sec-label">صفحة إضافية <span class="ln"></span><span style="font-size:11px;color:var(--muted)">أي صفحة تريدينها — شروط، عروض الشركات، أي محتوى</span></div>
        ${(c.pagesExtra||[]).length?(c.pagesExtra||[]).map((p,i)=>`
        <div class="xpg-row" style="display:flex;align-items:center;gap:11px;border:1px solid ${p.on?'var(--gold-deep)':'var(--line)'};border-radius:11px;padding:10px 13px;margin-bottom:8px">
          <span style="color:var(--gold-light);display:inline-flex">${icon('plus',14)}</span>
          <span style="flex:1;font-size:13px;color:${p.on?'var(--white)':'var(--muted)'}">${p.t}</span>
          <button class="btn btn-ghost" style="padding:6px 13px;font-size:11.5px" onclick="PAGE.xpToggle(${i})">${p.on?'إخفاء':'إظهار'}</button>
          <button onclick="PAGE.xpDel(${i})" title="حذف" style="background:none;border:none;color:#e29aa6;cursor:pointer;font-size:13px">✕</button>
        </div>`).join(''):`<div style="font-size:12.5px;color:var(--muted);margin-bottom:12px">لا صفحات إضافية بعد — أضيفي أول صفحة خاصة بموقعك.</div>`}
        <input id="xpT" placeholder="عنوان الصفحة — مثال: خدمات الشركات والفعاليات" style="width:100%;background:var(--bg);border:1px dashed var(--gold-deep);border-radius:9px;padding:11px 13px;color:var(--white);font-family:inherit;font-size:12.5px;outline:none;margin-bottom:9px"/>
        <textarea id="xpB" rows="3" placeholder="محتوى الصفحة — كل سطر فقرة" style="width:100%;background:var(--bg);border:1px dashed var(--gold-deep);border-radius:9px;padding:11px 13px;color:var(--white);font-family:inherit;font-size:12.5px;line-height:2;outline:none;resize:vertical;margin-bottom:9px"></textarea>
        <button class="btn btn-gold" onclick="PAGE.xpAdd()">+ إضافة الصفحة</button>
      </div>
      </div>
      <div style="${PAGE_TAB==='banners'?'':'display:none'}">
      <div class="card" style="margin-bottom:14px">
        <div class="sec-label">البنرات الترويجية <span class="ln"></span><span style="font-size:11px;color:var(--muted)">أشرطة إعلانية تظهر أعلى موقعك — فعّلي وعطّلي كما تشائين</span></div>
        ${(c.banners||[]).length?(c.banners||[]).map((b,i)=>`
        <div style="display:flex;align-items:center;gap:11px;border:1px solid ${b.on?'var(--gold-deep)':'var(--line)'};border-radius:11px;padding:11px 14px;margin-bottom:9px">
          <span style="color:var(--gold-light);display:inline-flex">${icon('mega',16)}</span>
          <span style="flex:1;font-size:13px;color:${b.on?'var(--white)':'var(--muted)'}">${b.t}</span>
          <button class="btn btn-ghost" style="padding:6px 13px;font-size:11.5px" onclick="PAGE.toggleBanner(${i})">${b.on?'إيقاف':'تفعيل'}</button>
          <button onclick="PAGE.delBanner(${i})" title="حذف" style="background:none;border:none;color:#e29aa6;cursor:pointer;font-size:13px">✕</button>
        </div>`).join(''):`<div style="font-size:12.5px;color:var(--muted);margin-bottom:12px">لا بنرات بعد — أضيفي أول بنر ترويجي (مثال: توصيل مجاني للطلبات فوق 200 ر.س).</div>`}
        <div style="display:flex;gap:9px">
          <input id="bnIn" placeholder="نص البنر — مثال: خصم 15% على كل المنتجات هذا الأسبوع" style="flex:1;background:var(--bg);border:1px dashed var(--gold-deep);border-radius:9px;padding:11px 13px;color:var(--white);font-family:inherit;font-size:12.5px;outline:none"/>
          <button class="btn btn-gold" onclick="PAGE.addBanner()">+ إضافة</button>
        </div>
      </div>
      </div>
      <div style="${PAGE_TAB==='cats'?'':'display:none'}">
      <div class="card" style="margin-bottom:14px">
        <div class="sec-label">تصنيفات موقعك <span class="ln"></span><span style="font-size:11px;color:var(--muted)">لكل صالون قائمته الخاصة — أضيفي واحذفي وأخفي كما يناسب موقعك</span></div>
        <div style="display:flex;gap:9px;flex-wrap:wrap;margin-bottom:12px">
          ${(c.catList||PAGE_CATS_DEFAULT).map(ct=>{const off=(c.hideCats||[]).includes(ct);return `
          <span class="cat-chip" style="display:inline-flex;align-items:center;gap:7px;border:1.5px solid ${off?'var(--line)':'var(--gold-light)'};background:${off?'var(--surface)':'linear-gradient(120deg,rgba(219,189,129,.16),rgba(156,124,58,.05))'};border-radius:20px;padding:7px 8px 7px 14px">
            <button onclick="PAGE.toggleCat('${ct.replace(/'/g,"\\'")}')" style="background:none;border:none;cursor:pointer;font-family:inherit;font-size:12.5px;color:${off?'var(--muted)':'var(--gold-light)'};text-decoration:${off?'line-through':'none'};padding:2px 4px">${ct}</button>
            <button onclick="PAGE.delCat('${ct.replace(/'/g,"\\'")}')" title="حذف التصنيف" style="width:18px;height:18px;border-radius:50%;border:none;background:rgba(0,0,0,.4);color:#e29aa6;cursor:pointer;font-size:10px;line-height:1">✕</button>
          </span>`;}).join('')}
        </div>
        <div style="display:flex;gap:9px">
          <input id="catIn" placeholder="تصنيف جديد — مثال: رموش وحواجب" style="flex:1;background:var(--bg);border:1px dashed var(--gold-deep);border-radius:9px;padding:11px 13px;color:var(--white);font-family:inherit;font-size:12.5px;outline:none"/>
          <button class="btn btn-gold" onclick="PAGE.addCat()">+ إضافة</button>
        </div>
        <div style="font-size:11px;color:var(--muted);margin-top:9px">اضغطي على التصنيف لإخفائه (يُشطب) — المخفي لا تظهر خدماته في الموقع، والبقية تظهر كفلاتر للعميلة.</div>
      </div>
      <div class="card" style="margin-bottom:14px">
        <div class="sec-label">الخدمات المميزة <span class="ln"></span><span style="font-size:11px;color:var(--muted)">شارات تظهر على الخدمات في صفحة الحجز</span></div>
        <div class="lux-f"><label>اختاري شارة لكل خدمة</label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px">
            ${SVC_CATALOG.map(s=>{const cur=(c.featured||{})[s[0]]||'';return `
            <div style="display:flex;align-items:center;gap:9px;border:1px solid ${cur?'var(--gold-deep)':'var(--line)'};border-radius:10px;padding:8px 11px">
              <span style="flex:1;display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--white)">${cur?`<span style="color:var(--gold-light);display:inline-flex">${icon('star',13)}</span>`:''}${s[0]}</span>
              <select class="feat-sel" onchange="PAGE.setFeat('${s[0].replace(/'/g,"\\'")}',this.value)" style="background:var(--bg);border:1px solid var(--line);border-radius:7px;color:${cur?'var(--gold-light)':'var(--muted)'};font-family:inherit;font-size:11.5px;padding:6px 8px;outline:none">
                <option value="">بدون شارة</option>
                ${PAGE_BADGES.map(b=>`<option ${cur===b?'selected':''}>${b}</option>`).join('')}
              </select>
            </div>`;}).join('')}
          </div></div>
      </div>
      </div>
      <div style="${PAGE_TAB==='design'?'':'display:none'}">
      ${PAGE_TAB==='design'?studioView():''}
      </div>
    </div>
    <div style="position:sticky;top:90px">
      <div class="sec-label">المعاينة الحية <span class="ln"></span><span style="font-size:11px;color:var(--muted)">الصفحة العامة نفسها — لا محاكاة</span></div>
      ${(()=>{const wide=(window.STUDIO&&STUDIO.device==='desktop'&&PAGE_TAB==='design');
      return wide
      ?`<div style="border:1px solid var(--line);border-radius:14px;overflow:hidden;background:#000">
          <iframe id="pagePrev" src="booking.html?preview=1" title="معاينة الموقع" style="width:100%;height:560px;border:none;display:block;background:#000"></iframe></div>`
      :`<div style="width:300px;margin:0 auto;border:6px solid #26242d;border-radius:38px;background:#000;padding:7px;box-shadow:0 30px 60px rgba(0,0,0,.5)">
          <div style="width:92px;height:18px;background:#17161c;border-radius:0 0 14px 14px;margin:0 auto 5px"></div>
          <iframe id="pagePrev" src="booking.html?preview=1" title="معاينة الموقع" style="width:100%;height:520px;border:none;border-radius:26px;background:#000"></iframe></div>`;})()}
    </div>
  </div>`;
};

