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
const PAGE_THEMES=PAGE_PRESETS.map(p=>[p.k,p.ar,p.bg,p.ac]);
/* الثيم المحلول للإعدادات الحالية: قالب جاهز أو ثيم مخصص بالكامل */
function pageThemeOf(c){
  c=c||pageCfg();
  if(c.theme==='custom'&&c.themeCustom)return {...PAGE_PRESETS[0],k:'custom',ar:'ثيم مخصص',...c.themeCustom};
  return PAGE_PRESETS.find(p=>p.k===c.theme)||PAGE_PRESETS[0];
}
const PAGE_POLICY_DEFAULT='الحضور قبل الموعد بـ10 دقائق يضمن اكتمال جلستك كاملة.\nيمكن إلغاء أو تعديل الحجز مجاناً قبل 24 ساعة من الموعد.\nالتأخر أكثر من 15 دقيقة قد يتطلب إعادة جدولة الموعد.\nقيمة العربون (إن وُجد) تُخصم من الفاتورة النهائية.';
const pageCfg=()=>({slug:'lama-beauty',title:'صالون لمسة',bio:'وجهتكِ الأولى للجمال في جدة — مكياج، شعر، وعناية ملكية بلمسات خبيرات.',phone:'0555 123 456',address:'جدة · حي الشاطئ',logo:'',cover:'',theme:'dark-luxury',themeCustom:null,gallery:[],policy:PAGE_POLICY_DEFAULT,featured:{'مكياج عروس':'الأكثر طلباً'},font:'plex',welcome:'',...hrLoad(PAGE_KEY,{})});
const PAGE_BADGES=['الأكثر طلباً','جديدة','عرض خاص','اختيار الخبيرات'];
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
const PAGE={
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
    const badge=document.getElementById('thBadge');if(badge)badge.style.display='inline-block';
  },
  setRad(v){
    const t=PAGE.customBase();t.rad=Math.max(0,Math.min(28,parseInt(v)||0));
    PAGE.save({theme:'custom',themeCustom:t},true);
    const l=document.getElementById('radV');if(l)l.textContent=t.rad+'px';
    const badge=document.getElementById('thBadge');if(badge)badge.style.display='inline-block';
  },
  preset(k){PAGE.save({theme:k,themeCustom:null},true);SALON.go('page');LUX.toast('طُبّق قالب البداية — عدّلي ألوانه كما تحبين','ok');},
  setFont(k){PAGE.save({font:k},true);SALON.go('page');LUX.toast('تغيّر خط الصفحة ✓','ok');},
  resetTheme(){PAGE.save({theme:'dark-luxury',themeCustom:null},true);SALON.go('page');LUX.toast('عاد المظهر للافتراضي','ok');},
  /* ── الشعار والغلاف: رفع من الجهاز (مضغوط) أو رابط ── */
  imgUpload(key,inp){
    const f=inp.files&&inp.files[0];if(!f)return;
    const MAX=key==='logo'?300:1400;
    const rd=new FileReader();
    rd.onload=()=>{const im=new Image();im.onload=()=>{
      const sc=Math.min(1,MAX/Math.max(im.width,im.height));
      const cv=document.createElement('canvas');cv.width=Math.round(im.width*sc);cv.height=Math.round(im.height*sc);
      cv.getContext('2d').drawImage(im,0,0,cv.width,cv.height);
      PAGE.save({[key]:cv.toDataURL('image/jpeg',0.78)},true);
      SALON.go('page');LUX.toast(key==='logo'?'رُفع الشعار ✓':'رُفعت صورة الغلاف ✓','ok');
    };im.src=rd.result;};
    rd.readAsDataURL(f);inp.value='';
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
    <div><div style="font-weight:600;font-size:19px;color:var(--white)">مُنشئ الرابط والصفحة الخاصة</div>
    <div style="font-size:13px;color:var(--gold-pale);margin-top:2px">رابطك المخصص وصفحة حجز فاخرة — وهذه الهوية نفسها تظهر على فواتيرك المطبوعة</div></div>
    <a class="btn btn-gold" href="booking.html" target="_blank" style="text-decoration:none">فتح صفحتي ↗</a>
  </div>
  <div style="display:grid;grid-template-columns:1fr 330px;gap:20px;align-items:start">
    <div>
      <div class="card" style="margin-bottom:14px">
        <div class="sec-label">إعداد الرابط الخاص <span class="ln"></span></div>
        <div style="display:flex;align-items:stretch;border:1px solid var(--line);border-radius:11px;overflow:hidden" dir="ltr">
          <span style="background:var(--surface2);padding:12px 14px;font-size:13px;color:var(--muted);font-family:'IBM Plex Mono',monospace">luma.beauty/</span>
          <input value="${c.slug}" oninput="PAGE.field('slug',this)" style="flex:1;background:var(--bg);border:none;outline:none;color:var(--gold-light);padding:12px;font-size:13.5px;font-family:'IBM Plex Mono',monospace"/>
          <button id="cpBtn" class="btn btn-ghost" style="border-radius:0;border:none;border-right:1px solid var(--line)" onclick="PAGE.copy()">نسخ الرابط</button>
        </div>
        <div style="font-size:11px;color:var(--muted);margin-top:8px">أحرف إنجليزية وأرقام وشرطات فقط — يُنظَّف تلقائياً أثناء الكتابة.</div>
      </div>
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
                <button onclick="PAGE.imgClear('${k}')" title="إزالة" style="position:absolute;top:-7px;left:-7px;width:19px;height:19px;border-radius:50%;border:none;background:rgba(0,0,0,.75);color:#f0a3b0;cursor:pointer;font-size:10px;line-height:1">✕</button></span>`:''}
              <label class="btn btn-ghost" style="cursor:pointer;padding:9px 12px;font-size:12px;white-space:nowrap">⬆ رفع
                <input id="up-${k}" type="file" accept="image/*" onchange="PAGE.imgUpload('${k}',this)" style="display:none"/></label>
              <input value="${isData?'':v}" oninput="PAGE.field('${k}',this)" dir="ltr" placeholder="${isData?'صورة مرفوعة ✓ — أو الصقي رابطاً':ph}" style="flex:1;min-width:0;background:var(--bg);border:1px dashed var(--gold-deep);border-radius:8px;padding:11px 13px;color:var(--white);font-family:inherit;font-size:12px;outline:none;text-align:right"/>
            </div></div>`;}).join('')}
        </div>
      </div>
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
          <label class="btn btn-gold" style="cursor:pointer">⬆ رفع صورة من الجهاز
            <input id="galFile" type="file" accept="image/*" onchange="PAGE.galAddFile(this)" style="display:none"/></label>
          <div style="flex:1;display:flex;gap:8px;min-width:260px">
            <input id="galUrl" dir="ltr" placeholder="رابط صورة أو فيديو (YouTube / mp4)…" style="flex:1;background:var(--bg);border:1px dashed var(--gold-deep);border-radius:9px;padding:11px 13px;color:var(--white);font-family:inherit;font-size:12px;outline:none;text-align:right"/>
            <button id="galAdd" class="btn btn-ghost" onclick="PAGE.galAddUrl()">إضافة</button>
          </div>
        </div>
        <div style="font-size:11px;color:var(--muted);margin-top:9px">الصور المرفوعة تُضغط تلقائياً · الفيديو برابط يوتيوب أو ملف mp4</div>
      </div>
      <div class="card" style="margin-bottom:14px">
        <div class="sec-label">سياسة الحجز والخدمات المميزة <span class="ln"></span></div>
        <div class="lux-f"><label>سياسة الحجز — كل سطر يظهر كبند في صفحة الحجز وعند التأكيد</label>
          <textarea rows="4" oninput="PAGE.field('policy',this)" style="width:100%;background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:11px 13px;color:var(--white);font-family:inherit;font-size:13px;line-height:2;outline:none;resize:vertical">${c.policy||''}</textarea></div>
        <div class="lux-f" style="margin-top:6px"><label>الخدمات المميزة — اختاري شارة تظهر على الخدمة في صفحة الحجز</label>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px">
            ${SVC_CATALOG.map(s=>{const cur=(c.featured||{})[s[0]]||'';return `
            <div style="display:flex;align-items:center;gap:9px;border:1px solid ${cur?'var(--gold-deep)':'var(--line)'};border-radius:10px;padding:8px 11px">
              <span style="flex:1;font-size:12.5px;color:var(--white)">${cur?'⭐ ':''}${s[0]}</span>
              <select class="feat-sel" onchange="PAGE.setFeat('${s[0].replace(/'/g,"\\'")}',this.value)" style="background:var(--bg);border:1px solid var(--line);border-radius:7px;color:${cur?'var(--gold-light)':'var(--muted)'};font-family:inherit;font-size:11.5px;padding:6px 8px;outline:none">
                <option value="">بدون شارة</option>
                ${PAGE_BADGES.map(b=>`<option ${cur===b?'selected':''}>${b}</option>`).join('')}
              </select>
            </div>`;}).join('')}
          </div></div>
      </div>
      <div class="card">
        <div class="sec-label">مظهر وتصميم الصفحة <span class="ln"></span>
          <span id="thBadge" style="display:${c.theme==='custom'?'inline-block':'none'};font-size:10.5px;color:var(--gold-light);border:1px solid var(--gold-deep);border-radius:20px;padding:2px 10px">ثيم مخصص ✓</span></div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:9px">قوالب كنقطة بداية — ثم عدّلي كل لون بنفسك:</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px">
          ${PAGE_PRESETS.map(p=>`
          <button onclick="PAGE.preset('${p.k}')" style="background:${p.bg};border:2px solid ${c.theme===p.k?p.ac:'var(--line)'};border-radius:12px;padding:11px;text-align:right;cursor:pointer;font-family:inherit">
            <span style="display:flex;gap:5px;margin-bottom:8px"><i style="width:14px;height:14px;border-radius:50%;background:${p.ac}"></i><i style="width:14px;height:14px;border-radius:50%;background:${p.card};border:1px solid rgba(128,128,128,.35)"></i></span>
            <span style="display:block;font-size:12px;font-weight:700;color:${p.tx}">${p.ar}</span>
            <span style="display:block;font-size:9px;color:${p.tx};opacity:.5" dir="ltr">${p.k}</span>
          </button>`).join('')}
        </div>
        ${(()=>{const t=pageThemeOf(c);const FIELDS=[['bg','خلفية الصفحة'],['card','لون البطاقات'],['ac','اللون المميز — الأزرار والعناوين'],['tx','لون النصوص']];
        return `
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
        <div style="display:flex;align-items:center;gap:14px;margin-top:14px;border:1px solid var(--line);border-radius:11px;padding:10px 14px">
          <span style="font-size:12px;color:var(--white);white-space:nowrap">استدارة الزوايا</span>
          <input type="range" min="0" max="28" value="${t.rad!=null?t.rad:18}" onchange="PAGE.setRad(this.value)" style="flex:1;accent-color:var(--gold-light)"/>
          <span id="radV" class="num" style="font-size:13px;color:var(--gold-light);width:44px;text-align:left" dir="ltr">${t.rad!=null?t.rad:18}px</span>
        </div>
        <div style="margin-top:16px">
          <div style="font-size:12.5px;color:var(--gold-pale);margin-bottom:9px">نوع الخط</div>
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:9px">
            ${PAGE_FONTS.map(([k,lb,fam])=>`
            <button class="font-chip" onclick="PAGE.setFont('${k}')" style="font-family:${fam.replace(/"/g,'&quot;')};background:var(--surface2);border:1.5px solid ${(c.font||'plex')===k?'var(--gold-light)':'var(--line)'};border-radius:11px;padding:10px 6px;cursor:pointer;text-align:center;color:var(--white)">
              <span style="display:block;font-size:17px;line-height:1.5">أهلاً بك 🌸</span>
              <span style="display:block;font-size:9.5px;color:${(c.font||'plex')===k?'var(--gold-light)':'var(--muted)'};margin-top:4px">${lb}</span>
            </button>`).join('')}
          </div>
        </div>
        <div style="margin-top:16px">
          <div style="font-size:12.5px;color:var(--gold-pale);margin-bottom:7px">شريط رسالة الترحيب <span style="font-size:10px;color:var(--muted)">— اختياري، يظهر أعلى الصفحة أول ما تفتحها العميلة</span></div>
          <input id="wbIn" value="${(c.welcome||'').replace(/"/g,'&quot;')}" oninput="PAGE.field('welcome',this)" placeholder="مثال: 🌸 أهلاً بك! خصم 10٪ على أول حجز بكود LUMA10 — اتركيه فارغاً للإخفاء" style="width:100%;background:var(--bg);border:1px solid var(--line);border-radius:9px;padding:12px 14px;color:var(--white);font-family:inherit;font-size:13px;outline:none"/>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px">
          <span style="font-size:11px;color:var(--muted)">كل تغيير يُحفظ فوراً وينعكس على المعاينة والفاتورة</span>
          <button class="btn btn-ghost" style="padding:8px 14px;font-size:12px" onclick="PAGE.resetTheme()">استعادة الافتراضي</button>
        </div>`;})()}
      </div>
    </div>
    <div style="position:sticky;top:90px">
      <div class="sec-label">المعاينة الفورية <span class="ln"></span></div>
      <div style="width:300px;margin:0 auto;border:6px solid #26242d;border-radius:38px;background:#000;padding:7px;box-shadow:0 30px 60px rgba(0,0,0,.5)">
        <div style="width:92px;height:18px;background:#17161c;border-radius:0 0 14px 14px;margin:0 auto 5px"></div>
        <iframe id="pagePrev" src="booking.html" style="width:100%;height:520px;border:none;border-radius:26px;background:#000"></iframe>
      </div>
    </div>
  </div>`;
};

